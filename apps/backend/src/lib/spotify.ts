import { createHash, randomBytes } from 'crypto';
import type { SpotifyTokenResponse, SpotifyUserProfile } from '../types/spotify';
import { fetchWithRetry, SPOTIFY_API_URL } from './spotify-api';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

const SCOPES = [
    'user-read-recently-played',
    'user-read-private',
    'user-top-read',
    'user-read-email',
].join(' ');

function getClientCredentials() {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Missing Spotify OAuth environment variables');
    }

    return { clientId, clientSecret, redirectUri };
}

// PKCE utilities
export function generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
}

export function generateState(): string {
    return randomBytes(16).toString('hex');
}

// Build authorization URL
export function buildAuthUrl(codeChallenge: string, state: string, showDialog: boolean = false): string {
    const { clientId, redirectUri } = getClientCredentials();

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: SCOPES,
        state,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        show_dialog: showDialog ? 'true' : 'false',
    });

    return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
    code: string,
    codeVerifier: string
): Promise<SpotifyTokenResponse> {
    const { clientId, clientSecret, redirectUri } = getClientCredentials();

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
    });

    const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${error}`);
    }

    return response.json() as Promise<SpotifyTokenResponse>;
}

// Custom error for token refresh failures
export class TokenRefreshError extends Error {
    constructor(
        message: string,
        public readonly isRevoked: boolean,
        public readonly spotifyError?: string
    ) {
        super(message);
        this.name = 'TokenRefreshError';
    }
}

// Refresh access token using refresh token
export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
    const { clientId, clientSecret } = getClientCredentials();

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });

    const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const errorText = await response.text();
        let errorBody: { error?: string; error_description?: string } = {};
        try {
            errorBody = JSON.parse(errorText);
        } catch {
            // Not JSON, use raw text
        }

        const isRevoked = errorBody.error === 'invalid_grant';
        throw new TokenRefreshError(
            `Token refresh failed: ${errorBody.error_description || errorText}`,
            isRevoked,
            errorBody.error
        );
    }

    return response.json() as Promise<SpotifyTokenResponse>;
}

// Get user profile using shared fetch wrapper
export async function getUserProfile(accessToken: string): Promise<SpotifyUserProfile> {
    return fetchWithRetry<SpotifyUserProfile>(`${SPOTIFY_API_URL}/me`, accessToken);
}

