import { createHmac, timingSafeEqual } from 'crypto';

// Confirmation tokens prevent accidental double-submissions and ensure
// the user has seen validation results before creating a playlist.
// The token is an HMAC of userId + params + timestamp, valid for 5 minutes.

const TOKEN_EXPIRY_MS = 5 * 60 * 1000;
const HMAC_SECRET = (() => {
    if (process.env.NODE_ENV === 'production' && !process.env.ENCRYPTION_KEY) {
        throw new Error('FATAL: ENCRYPTION_KEY is required in production environment');
    }
    return process.env.ENCRYPTION_KEY || 'default-dev-key';
})();

interface TokenPayload {
    userId: string;
    params: Record<string, unknown>;
    issuedAt: number;
}

function createSignature(payload: TokenPayload): string {
    const data = JSON.stringify({
        userId: payload.userId,
        params: payload.params,
        issuedAt: payload.issuedAt,
    });
    return createHmac('sha256', HMAC_SECRET).update(data).digest('hex');
}

export function generateConfirmationToken(
    userId: string,
    params: Record<string, unknown>
): string {
    const payload: TokenPayload = {
        userId,
        params,
        issuedAt: Date.now(),
    };

    const signature = createSignature(payload);
    const tokenData = Buffer.from(JSON.stringify({ ...payload, signature })).toString('base64url');

    return tokenData;
}

export interface TokenVerificationResult {
    valid: boolean;
    params?: Record<string, unknown>;
    error?: string;
}

export function verifyConfirmationToken(
    token: string,
    userId: string
): TokenVerificationResult {
    try {
        const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
        const { userId: tokenUserId, params, issuedAt, signature } = decoded;

        // Verify user ID matches
        if (tokenUserId !== userId) {
            return { valid: false, error: 'Token does not belong to this user' };
        }

        // Verify expiration
        const age = Date.now() - issuedAt;
        if (age > TOKEN_EXPIRY_MS) {
            return { valid: false, error: 'Token expired' };
        }

        // Verify signature
        const expectedPayload: TokenPayload = { userId: tokenUserId, params, issuedAt };
        const expectedSignature = createSignature(expectedPayload);

        const sigBuffer = Buffer.from(signature, 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');

        if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
            return { valid: false, error: 'Invalid token signature' };
        }

        return { valid: true, params };
    } catch {
        return { valid: false, error: 'Invalid token format' };
    }
}

// Typed parameter interfaces for each playlist creation method
export interface ShuffleTokenParams {
    method: 'shuffle';
    sourcePlaylistId: string;
    shuffleMode: 'truly_random' | 'less_repetition';
    trackCount: number;
}

export interface Top50TokenParams {
    method: 'top50';
    term: 'short' | 'medium' | 'long' | 'all_time';
    trackCount: number;
}

export interface RecentTokenParams {
    method: 'recent';
    kValue: number;
    startDate?: string;
    endDate?: string;
    trackCount: number;
}

export type PlaylistTokenParams = ShuffleTokenParams | Top50TokenParams | RecentTokenParams;

export interface TokenParamValidationResult extends TokenVerificationResult {
    paramMismatch?: string[];
}

/**
 * Verifies token AND validates that request params match token params.
 * Security-critical: prevents token reuse across different requests.
 * 
 * @param token - The confirmation token to verify
 * @param userId - The user ID to verify ownership
 * @param requestParams - The parameters from the current request
 * @param requiredFields - Array of field names that must match between token and request
 * @returns Validation result with detailed mismatch info on failure
 */
export function verifyConfirmationTokenWithParams<T extends Record<string, unknown>>(
    token: string,
    userId: string,
    requestParams: T,
    requiredFields: (keyof T)[]
): TokenParamValidationResult {
    // Verify basic token validity (expiry, signature, user ownership)
    const baseResult = verifyConfirmationToken(token, userId);
    if (!baseResult.valid) {
        return baseResult;
    }

    // Verify that request params match token params
    const tokenParams = baseResult.params as Record<string, unknown>;
    const mismatches: string[] = [];

    for (const field of requiredFields) {
        const fieldStr = String(field);
        const tokenValue = tokenParams[fieldStr];
        const requestValue = requestParams[field];

        // Compare with loose equality for undefined/null handling
        if (tokenValue !== requestValue) {
            mismatches.push(
                `${fieldStr}: expected '${String(tokenValue)}', got '${String(requestValue)}'`
            );
        }
    }

    if (mismatches.length > 0) {
        return {
            valid: false,
            error: 'Token parameters do not match request',
            paramMismatch: mismatches,
        };
    }

    return { valid: true, params: baseResult.params };
}
