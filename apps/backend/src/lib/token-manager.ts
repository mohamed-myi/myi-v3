import { prisma } from './prisma';
import { decrypt, encrypt } from './encryption';
import { refreshAccessToken, TokenRefreshError } from './spotify';
import { logger } from './logger';
import { redis } from './redis';

// Access tokens expire in 1 hour; refresh proactively at 50 minutes
const REFRESH_THRESHOLD_MS = 50 * 60 * 1000;

// Number of consecutive failures before invalidating token
const MAX_CONSECUTIVE_FAILURES = 3;

// Access token cache: 45 minutes (tokens last 60 min, refresh at 45 for safety)
const ACCESS_TOKEN_TTL = 45 * 60;
const ACCESS_TOKEN_KEY = (userId: string) => `access_token:${userId}`;

// Distributed mutex for token refresh to prevent race conditions
const REFRESH_LOCK_TTL = 30; // 30 seconds max lock time
const REFRESH_LOCK_KEY = (userId: string) => `refresh_lock:${userId}`;

export interface TokenResult {
    accessToken: string;
    expiresIn: number;
}

// Gets cached access token from Redis
async function getCachedAccessToken(userId: string): Promise<TokenResult | null> {
    const cached = await redis.get(ACCESS_TOKEN_KEY(userId));
    if (cached) {
        try {
            return JSON.parse(cached) as TokenResult;
        } catch {
            // Invalid cache entry, ignore
        }
    }
    return null;
}

// Caches access token in Redis with TTL
export async function cacheAccessToken(userId: string, token: TokenResult): Promise<void> {
    await redis.setex(ACCESS_TOKEN_KEY(userId), ACCESS_TOKEN_TTL, JSON.stringify(token));
}

// Refreshes token with distributed mutex to prevent concurrent refresh race conditions
async function refreshUserTokenWithMutex(userId: string): Promise<TokenResult | null> {
    const lockKey = REFRESH_LOCK_KEY(userId);

    // Try to acquire lock (NX = only if not exists)
    const acquired = await redis.set(lockKey, '1', 'EX', REFRESH_LOCK_TTL, 'NX');
    if (acquired !== 'OK') {
        // Another process is refreshing, wait briefly and check cache
        logger.info({ userId }, 'Token refresh in progress by another process, waiting...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const cached = await getCachedAccessToken(userId);
        if (cached) {
            return cached;
        }
        // Still no cache, wait a bit more and try again
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getCachedAccessToken(userId);
    }

    try {
        const result = await refreshUserToken(userId);
        if (result) {
            await cacheAccessToken(userId, result);
        }
        return result;
    } finally {
        // Release lock
        await redis.del(lockKey);
    }
}

// Gets a valid access token for a user, using cache and mutex-protected refresh
export async function getValidAccessToken(userId: string): Promise<TokenResult | null> {
    // First, check Redis cache for existing access token
    const cached = await getCachedAccessToken(userId);
    if (cached) {
        return cached;
    }

    // No cached token; verify auth is still valid before refreshing
    const auth = await prisma.spotifyAuth.findUnique({
        where: { userId },
    });

    if (!auth || !auth.isValid) {
        return null;
    }

    // Use mutex-protected refresh to prevent race conditions
    return refreshUserTokenWithMutex(userId);
}

// Refreshes the user's token and updates the database
export async function refreshUserToken(userId: string): Promise<TokenResult | null> {
    const auth = await prisma.spotifyAuth.findUnique({
        where: { userId },
    });

    if (!auth || !auth.isValid) {
        return null;
    }

    try {
        const decryptedRefreshToken = decrypt(auth.refreshToken);
        const tokens = await refreshAccessToken(decryptedRefreshToken);

        // Spotify may return a new refresh token
        const newRefreshToken = tokens.refresh_token || decryptedRefreshToken;
        const encryptedNewToken = encrypt(newRefreshToken);

        await prisma.spotifyAuth.update({
            where: { userId },
            data: {
                refreshToken: encryptedNewToken,
                lastRefreshAt: new Date(),
                isValid: true,
                consecutiveFailures: 0, // Reset on successful refresh
            },
        });

        return {
            accessToken: tokens.access_token,
            expiresIn: tokens.expires_in,
        };
    } catch (error) {
        if (error instanceof TokenRefreshError && error.isRevoked) {
            // Token was revoked by user; immediate invalidation
            await invalidateUserToken(userId, 'token_revoked_by_user');
            logger.warn({ userId }, 'Token revoked by user');
            return null;
        }

        // Other errors; log but don't invalidate
        logger.error({ userId, error }, 'Token refresh failed');
        throw error;
    }
}

// Records a token failure and returns true if token was invalidated
export async function recordTokenFailure(userId: string, reason: string): Promise<boolean> {
    const auth = await prisma.spotifyAuth.update({
        where: { userId },
        data: {
            consecutiveFailures: { increment: 1 },
            lastFailureAt: new Date(),
            lastFailureReason: reason,
        },
    });

    logger.warn(
        { userId, consecutiveFailures: auth.consecutiveFailures, reason },
        'Token failure recorded'
    );

    // Only invalidate after threshold reached
    if (auth.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        await invalidateUserToken(userId, `max_failures_reached:${reason}`);
        return true;
    }
    return false;
}

// Resets failure count after successful API call
export async function resetTokenFailures(userId: string): Promise<void> {
    await prisma.spotifyAuth.update({
        where: { userId },
        data: { consecutiveFailures: 0 },
    });
}

// Marks a user's token as invalid 
export async function invalidateUserToken(userId: string, reason?: string): Promise<void> {
    await prisma.spotifyAuth.update({
        where: { userId },
        data: {
            isValid: false,
            lastFailureReason: reason || 'unknown',
        },
    });
    logger.error({ userId, reason }, 'Token invalidated');
}

