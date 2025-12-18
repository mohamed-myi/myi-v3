// Mock p-retry to avoid ESM issues (needed for getUserProfile which uses fetchWithRetry)
jest.mock('p-retry', () => ({
    __esModule: true,
    default: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { mockFetch, restoreFetch, createMockResponse } from '../../mocks/fetch.mock';
import {
    generateCodeVerifier,
    generateCodeChallenge,
    generateState,
    buildAuthUrl,
    exchangeCodeForTokens,
    refreshAccessToken,
    getUserProfile,
    TokenRefreshError,
} from '../../../src/lib/spotify';
import { SpotifyUnauthenticatedError } from '../../../src/lib/spotify-errors';

describe('lib/spotify', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            SPOTIFY_CLIENT_ID: 'test-client-id',
            SPOTIFY_CLIENT_SECRET: 'test-client-secret',
            SPOTIFY_REDIRECT_URI: 'http://localhost:3000/callback',
        };
    });

    afterEach(() => {
        process.env = originalEnv;
        restoreFetch();
    });

    describe('generateCodeVerifier', () => {
        it('returns a base64url encoded string', () => {
            const verifier = generateCodeVerifier();
            expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
            expect(verifier.length).toBeGreaterThan(20);
        });

        it('generates unique values on each call', () => {
            const v1 = generateCodeVerifier();
            const v2 = generateCodeVerifier();
            expect(v1).not.toBe(v2);
        });
    });

    describe('generateCodeChallenge', () => {
        it('produces SHA256 hash as base64url', () => {
            const verifier = 'test-verifier-123';
            const challenge = generateCodeChallenge(verifier);
            expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
        });

        it('produces consistent output for same input', () => {
            const verifier = 'consistent-verifier';
            const c1 = generateCodeChallenge(verifier);
            const c2 = generateCodeChallenge(verifier);
            expect(c1).toBe(c2);
        });
    });

    describe('generateState', () => {
        it('returns a hex string', () => {
            const state = generateState();
            expect(state).toMatch(/^[a-f0-9]+$/);
            expect(state.length).toBe(32);
        });

        it('generates unique values on each call', () => {
            const s1 = generateState();
            const s2 = generateState();
            expect(s1).not.toBe(s2);
        });
    });

    describe('buildAuthUrl', () => {
        it('constructs correct authorization URL', () => {
            const url = buildAuthUrl('test-challenge', 'test-state');
            expect(url).toContain('https://accounts.spotify.com/authorize');
            expect(url).toContain('client_id=test-client-id');
            expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fcallback');
            expect(url).toContain('code_challenge=test-challenge');
            expect(url).toContain('state=test-state');
            expect(url).toContain('code_challenge_method=S256');
            expect(url).toContain('response_type=code');
        });

        it('includes show_dialog=true when specified', () => {
            const url = buildAuthUrl('challenge', 'state', true);
            expect(url).toContain('show_dialog=true');
        });

        it('includes show_dialog=false by default', () => {
            const url = buildAuthUrl('challenge', 'state');
            expect(url).toContain('show_dialog=false');
        });

        it('throws when env vars missing', () => {
            delete process.env.SPOTIFY_CLIENT_ID;
            expect(() => buildAuthUrl('c', 's')).toThrow('Missing Spotify OAuth environment variables');
        });
    });

    describe('exchangeCodeForTokens', () => {
        it('returns tokens on success', async () => {
            const mockTokens = {
                access_token: 'access-123',
                refresh_token: 'refresh-456',
                expires_in: 3600,
                scope: 'user-read-recently-played',
                token_type: 'Bearer',
            };
            mockFetch(async () => createMockResponse(200, mockTokens));

            const result = await exchangeCodeForTokens('auth-code', 'verifier');
            expect(result.access_token).toBe('access-123');
            expect(result.refresh_token).toBe('refresh-456');
        });

        it('throws on error response', async () => {
            mockFetch(async () => createMockResponse(400, { error: 'invalid_grant' }));

            await expect(exchangeCodeForTokens('bad-code', 'verifier'))
                .rejects.toThrow('Token exchange failed');
        });
    });

    describe('refreshAccessToken', () => {
        it('returns new tokens on success', async () => {
            const mockTokens = {
                access_token: 'new-access',
                expires_in: 3600,
                scope: 'user-read-recently-played',
                token_type: 'Bearer',
            };
            mockFetch(async () => createMockResponse(200, mockTokens));

            const result = await refreshAccessToken('refresh-token');
            expect(result.access_token).toBe('new-access');
        });

        it('throws TokenRefreshError with isRevoked=true for invalid_grant', async () => {
            mockFetch(async () => createMockResponse(400, {
                error: 'invalid_grant',
                error_description: 'Refresh token revoked',
            }));

            try {
                await refreshAccessToken('revoked-token');
                fail('Expected TokenRefreshError');
            } catch (error) {
                expect(error).toBeInstanceOf(TokenRefreshError);
                expect((error as TokenRefreshError).isRevoked).toBe(true);
                expect((error as TokenRefreshError).spotifyError).toBe('invalid_grant');
            }
        });

        it('throws TokenRefreshError with isRevoked=false for other errors', async () => {
            mockFetch(async () => createMockResponse(400, {
                error: 'invalid_request',
                error_description: 'Bad request',
            }));

            try {
                await refreshAccessToken('bad-token');
                fail('Expected TokenRefreshError');
            } catch (error) {
                expect(error).toBeInstanceOf(TokenRefreshError);
                expect((error as TokenRefreshError).isRevoked).toBe(false);
            }
        });

        it('handles non-JSON error response', async () => {
            mockFetch(async () => ({
                ok: false,
                status: 500,
                headers: new Map(),
                json: async () => { throw new Error('Not JSON'); },
                text: async () => 'Internal Server Error',
            }));

            await expect(refreshAccessToken('token')).rejects.toBeInstanceOf(TokenRefreshError);
        });
    });

    describe('getUserProfile', () => {
        it('returns user profile on success', async () => {
            const mockProfile = {
                id: 'user-123',
                display_name: 'Test User',
                email: 'test@example.com',
                country: 'US',
                images: [{ url: 'https://example.com/avatar.jpg' }],
            };
            mockFetch(async () => createMockResponse(200, mockProfile));

            const result = await getUserProfile('access-token');
            expect(result.id).toBe('user-123');
            expect(result.display_name).toBe('Test User');
        });

        it('throws SpotifyUnauthenticatedError on 401', async () => {
            mockFetch(async () => createMockResponse(401, { error: 'Unauthorized' }));

            await expect(getUserProfile('bad-token'))
                .rejects.toThrow(SpotifyUnauthenticatedError);
        });
    });
});
