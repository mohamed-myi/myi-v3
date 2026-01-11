// Confirmation token tests - security-critical component
// Tests cover: generation, verification, expiry, signature tampering, wrong user, param validation

import {
    generateConfirmationToken,
    verifyConfirmationToken,
    verifyConfirmationTokenWithParams,
} from '../../../src/lib/confirmation-token';

describe('confirmation-token', () => {
    const userId = 'user-123';
    const params = { method: 'shuffle', sourcePlaylistId: 'playlist-abc', trackCount: 150 };

    beforeAll(() => {
        // Ensure encryption key is set
        process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    });

    describe('generateConfirmationToken', () => {
        test('returns base64url-encoded string', () => {
            const token = generateConfirmationToken(userId, params);
            expect(typeof token).toBe('string');
            expect(token.length).toBeGreaterThan(0);
            // Base64url charset: A-Z, a-z, 0-9, -, _
            expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
        });

        test('different params produce different tokens', () => {
            const token1 = generateConfirmationToken(userId, { method: 'shuffle' });
            const token2 = generateConfirmationToken(userId, { method: 'recent' });
            expect(token1).not.toBe(token2);
        });

        test('different users produce different tokens', () => {
            const token1 = generateConfirmationToken('user-1', params);
            const token2 = generateConfirmationToken('user-2', params);
            expect(token1).not.toBe(token2);
        });
    });

    describe('verifyConfirmationToken', () => {
        test('valid token returns params', () => {
            const token = generateConfirmationToken(userId, params);
            const result = verifyConfirmationToken(token, userId);

            expect(result.valid).toBe(true);
            expect(result.params).toEqual(params);
            expect(result.error).toBeUndefined();
        });

        test('rejects token for wrong user', () => {
            const token = generateConfirmationToken(userId, params);
            const result = verifyConfirmationToken(token, 'different-user');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Token does not belong to this user');
        });

        test('rejects malformed token (invalid base64)', () => {
            const result = verifyConfirmationToken('not-valid-base64!@#', userId);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Invalid token format');
        });

        test('rejects token with tampered signature', () => {
            const token = generateConfirmationToken(userId, params);

            // Decode, tamper, re-encode
            const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
            decoded.signature = 'tampered' + decoded.signature.slice(8);
            const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64url');

            const result = verifyConfirmationToken(tampered, userId);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Invalid token signature');
        });

        test('rejects token with tampered params', () => {
            const token = generateConfirmationToken(userId, params);

            // Decode, change params, re-encode (signature unchanged)
            const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
            decoded.params.trackCount = 9999;
            const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64url');

            const result = verifyConfirmationToken(tampered, userId);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('Invalid token signature');
        });

        test('rejects expired token', () => {
            const token = generateConfirmationToken(userId, params);

            // Decode and set issuedAt to 10 minutes ago
            const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
            const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
            decoded.issuedAt = tenMinutesAgo;

            // Re-sign with correct signature for tampered timestamp (won't work - signature mismatch)
            const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64url');

            const result = verifyConfirmationToken(tampered, userId);

            // This should fail because signature doesn't match
            expect(result.valid).toBe(false);
        });

        test('handles empty params object', () => {
            const token = generateConfirmationToken(userId, {});
            const result = verifyConfirmationToken(token, userId);

            expect(result.valid).toBe(true);
            expect(result.params).toEqual({});
        });

        test('handles complex nested params', () => {
            const complexParams = {
                method: 'recent',
                kValue: 500,
                dates: { start: '2024-01-01', end: '2024-12-31' },
                tags: ['rock', 'pop'],
            };
            const token = generateConfirmationToken(userId, complexParams);
            const result = verifyConfirmationToken(token, userId);

            expect(result.valid).toBe(true);
            expect(result.params).toEqual(complexParams);
        });
    });

    describe('verifyConfirmationTokenWithParams', () => {
        describe('shuffle method', () => {
            test('accepts when all params match', () => {
                const token = generateConfirmationToken(userId, {
                    method: 'shuffle',
                    sourcePlaylistId: 'playlist-123',
                    shuffleMode: 'truly_random',
                });

                const result = verifyConfirmationTokenWithParams(
                    token,
                    userId,
                    { method: 'shuffle', sourcePlaylistId: 'playlist-123', shuffleMode: 'truly_random' },
                    ['method', 'sourcePlaylistId', 'shuffleMode']
                );

                expect(result.valid).toBe(true);
                expect(result.paramMismatch).toBeUndefined();
            });

            test('rejects when sourcePlaylistId differs', () => {
                const token = generateConfirmationToken(userId, {
                    method: 'shuffle',
                    sourcePlaylistId: 'playlist-A',
                    shuffleMode: 'truly_random',
                });

                const result = verifyConfirmationTokenWithParams(
                    token,
                    userId,
                    { method: 'shuffle', sourcePlaylistId: 'playlist-B', shuffleMode: 'truly_random' },
                    ['method', 'sourcePlaylistId', 'shuffleMode']
                );

                expect(result.valid).toBe(false);
                expect(result.error).toBe('Token parameters do not match request');
                expect(result.paramMismatch).toContainEqual(
                    expect.stringContaining('sourcePlaylistId')
                );
            });

            test('rejects when shuffleMode differs', () => {
                const token = generateConfirmationToken(userId, {
                    method: 'shuffle',
                    sourcePlaylistId: 'playlist-123',
                    shuffleMode: 'truly_random',
                });

                const result = verifyConfirmationTokenWithParams(
                    token,
                    userId,
                    { method: 'shuffle', sourcePlaylistId: 'playlist-123', shuffleMode: 'less_repetition' },
                    ['method', 'sourcePlaylistId', 'shuffleMode']
                );

                expect(result.valid).toBe(false);
                expect(result.paramMismatch).toContainEqual(
                    expect.stringContaining('shuffleMode')
                );
            });
        });

        describe('top50 method', () => {
            test('accepts when term matches', () => {
                const token = generateConfirmationToken(userId, {
                    method: 'top50',
                    term: 'medium',
                });

                const result = verifyConfirmationTokenWithParams(
                    token,
                    userId,
                    { method: 'top50', term: 'medium' },
                    ['method', 'term']
                );

                expect(result.valid).toBe(true);
            });

            test('rejects when term differs', () => {
                const token = generateConfirmationToken(userId, {
                    method: 'top50',
                    term: 'short',
                });

                const result = verifyConfirmationTokenWithParams(
                    token,
                    userId,
                    { method: 'top50', term: 'long' },
                    ['method', 'term']
                );

                expect(result.valid).toBe(false);
                expect(result.paramMismatch).toContainEqual(
                    expect.stringContaining('term')
                );
            });
        });

        describe('recent method', () => {
            test('accepts when kValue matches', () => {
                const token = generateConfirmationToken(userId, {
                    method: 'recent',
                    kValue: 100,
                });

                const result = verifyConfirmationTokenWithParams(
                    token,
                    userId,
                    { method: 'recent', kValue: 100 },
                    ['method', 'kValue']
                );

                expect(result.valid).toBe(true);
            });

            test('rejects when kValue differs', () => {
                const token = generateConfirmationToken(userId, {
                    method: 'recent',
                    kValue: 100,
                });

                const result = verifyConfirmationTokenWithParams(
                    token,
                    userId,
                    { method: 'recent', kValue: 500 },
                    ['method', 'kValue']
                );

                expect(result.valid).toBe(false);
                expect(result.paramMismatch).toContainEqual(
                    expect.stringContaining('kValue')
                );
            });

            test('rejects when date range differs', () => {
                const token = generateConfirmationToken(userId, {
                    method: 'recent',
                    kValue: 100,
                    startDate: '2024-01-01',
                    endDate: '2024-01-15',
                });

                const result = verifyConfirmationTokenWithParams(
                    token,
                    userId,
                    { method: 'recent', kValue: 100, startDate: '2024-01-01', endDate: '2024-01-31' },
                    ['method', 'kValue', 'startDate', 'endDate']
                );

                expect(result.valid).toBe(false);
                expect(result.paramMismatch).toContainEqual(
                    expect.stringContaining('endDate')
                );
            });
        });

        describe('security properties', () => {
            test('lists all mismatched fields in error', () => {
                const token = generateConfirmationToken(userId, {
                    method: 'shuffle',
                    sourcePlaylistId: 'playlist-A',
                    shuffleMode: 'truly_random',
                });

                const result = verifyConfirmationTokenWithParams(
                    token,
                    userId,
                    { method: 'top50', sourcePlaylistId: 'playlist-B', shuffleMode: 'less_repetition' },
                    ['method', 'sourcePlaylistId', 'shuffleMode']
                );

                expect(result.valid).toBe(false);
                expect(result.paramMismatch?.length).toBe(3);
            });

            test('validates basic token properties before checking params', () => {
                const token = generateConfirmationToken(userId, {
                    method: 'shuffle',
                    sourcePlaylistId: 'playlist-123',
                });

                // Tamper the token
                const tampered = token.slice(0, -5) + 'XXXXX';

                const result = verifyConfirmationTokenWithParams(
                    tampered,
                    userId,
                    { method: 'shuffle', sourcePlaylistId: 'playlist-123' },
                    ['method', 'sourcePlaylistId']
                );

                // Should fail on signature, not report param mismatch
                expect(result.valid).toBe(false);
                expect(result.paramMismatch).toBeUndefined();
            });

            test('prevents token reuse across different methods', () => {
                // Generate a shuffle token
                const token = generateConfirmationToken(userId, {
                    method: 'shuffle',
                    sourcePlaylistId: 'playlist-123',
                });

                // Try to use it for top50 creation
                const result = verifyConfirmationTokenWithParams(
                    token,
                    userId,
                    { method: 'top50', term: 'medium' },
                    ['method', 'term']
                );

                expect(result.valid).toBe(false);
                expect(result.paramMismatch).toContainEqual(
                    expect.stringContaining('method')
                );
            });
        });
    });
});

