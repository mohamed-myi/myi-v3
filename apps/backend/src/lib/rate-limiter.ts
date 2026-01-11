import { logger } from './logger';

export interface RateLimiterConfig {
    initialRate: number;      // Requests per second
    minRate: number;          // Minimum rate after backoff
    burstCapacity: number;    // Max tokens in bucket
    recoveryFactor: number;   // Rate increase factor after success streak
    successStreakThreshold: number; // Successes before rate recovery
}

const DEFAULT_CONFIG: RateLimiterConfig = {
    initialRate: 2,           // 2 requests/second (conservative)
    minRate: 0.5,             // 1 request every 2 seconds minimum
    burstCapacity: 5,         // Allow small bursts
    recoveryFactor: 1.25,     // 25% rate increase on recovery
    successStreakThreshold: 20, // 20 successes before recovering rate
};

export class AdaptiveRateLimiter {
    private tokens: number;
    private lastRefill: number;
    private currentRate: number;
    private successStreak: number;
    private isPaused: boolean;
    private pauseUntil: number;
    private config: RateLimiterConfig;

    constructor(config: Partial<RateLimiterConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.tokens = this.config.burstCapacity;
        this.lastRefill = Date.now();
        this.currentRate = this.config.initialRate;
        this.successStreak = 0;
        this.isPaused = false;
        this.pauseUntil = 0;
    }

    private refillTokens(): void {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 1000; // Convert to seconds
        const newTokens = elapsed * this.currentRate;
        this.tokens = Math.min(this.config.burstCapacity, this.tokens + newTokens);
        this.lastRefill = now;
    }

    async acquire(): Promise<void> {
        if (this.isPaused) {
            const now = Date.now();
            if (now < this.pauseUntil) {
                const waitTime = this.pauseUntil - now;
                logger.info({ waitTime }, 'Rate limiter paused, waiting...');
                await this.sleep(waitTime);
            }
            this.isPaused = false;
        }

        this.refillTokens();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return;
        }

        const tokensNeeded = 1 - this.tokens;
        const waitTime = (tokensNeeded / this.currentRate) * 1000;

        logger.debug({ waitTime, currentRate: this.currentRate }, 'Rate limiter waiting for token');
        await this.sleep(waitTime);

        this.refillTokens();
        this.tokens -= 1;
    }

    recordSuccess(): void {
        this.successStreak++;

        if (this.successStreak >= this.config.successStreakThreshold) {
            const newRate = Math.min(
                this.config.initialRate,
                this.currentRate * this.config.recoveryFactor
            );
            if (newRate > this.currentRate) {
                logger.info(
                    { oldRate: this.currentRate, newRate },
                    'Rate limiter recovering rate after success streak'
                );
                this.currentRate = newRate;
            }
            this.successStreak = 0;
        }
    }

    handleRateLimit(retryAfterSeconds: number): void {
        this.successStreak = 0;

        this.isPaused = true;
        this.pauseUntil = Date.now() + (retryAfterSeconds * 1000);

        const newRate = Math.max(this.config.minRate, this.currentRate / 2);

        logger.warn(
            {
                retryAfterSeconds,
                oldRate: this.currentRate,
                newRate,
                pauseUntil: new Date(this.pauseUntil).toISOString()
            },
            'Rate limiter backing off after 429'
        );

        this.currentRate = newRate;
    }

    getState(): { currentRate: number; tokens: number; isPaused: boolean } {
        this.refillTokens();
        return {
            currentRate: this.currentRate,
            tokens: this.tokens,
            isPaused: this.isPaused,
        };
    }

    reset(): void {
        this.tokens = this.config.burstCapacity;
        this.lastRefill = Date.now();
        this.currentRate = this.config.initialRate;
        this.successStreak = 0;
        this.isPaused = false;
        this.pauseUntil = 0;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

let importRateLimiter: AdaptiveRateLimiter | null = null;

export function getImportRateLimiter(): AdaptiveRateLimiter {
    if (!importRateLimiter) {
        importRateLimiter = new AdaptiveRateLimiter();
    }
    return importRateLimiter;
}

export function resetImportRateLimiter(): void {
    if (importRateLimiter) {
        importRateLimiter.reset();
    }
}


import { redis } from './redis';
import { prisma } from './prisma';

// Exported constants for playlist rate limits
export const MAX_PENDING_JOBS = 5;
export const MAX_JOBS_PER_HOUR = 10;

// Redis key prefixes for playlist rate limiting
const PENDING_KEY_PREFIX = 'playlist_rate:pending:';
const HOURLY_KEY_PREFIX = 'playlist_rate:hourly:';
const PENDING_TTL = 3600; // 1 hour safety TTL

export interface PlaylistRateLimitResult {
    allowed: boolean;
    pendingCount?: number;
    hourlyCount?: number;
    error?: string;
}

/**
 * Atomically acquire a job slot for a user.
 * 
 * Uses Redis INCR which is atomic - no two requests can get the same count.
 * If the count exceeds the limit, we immediately decrement to rollback.
 * 
 * IMPORTANT: Call releaseJobSlot when the job completes or fails.
 */
export async function tryAcquireJobSlot(userId: string): Promise<PlaylistRateLimitResult> {
    try {
        const pendingKey = `${PENDING_KEY_PREFIX}${userId}`;
        const hourlyKey = `${HOURLY_KEY_PREFIX}${userId}`;

        // Atomic increment of pending count
        const newPendingCount = await redis.incr(pendingKey);

        // Set TTL on first increment
        if (newPendingCount === 1) {
            await redis.expire(pendingKey, PENDING_TTL);
        }

        // Check if we exceeded pending limit - rollback if so
        if (newPendingCount > MAX_PENDING_JOBS) {
            await redis.decr(pendingKey);
            logger.info({ userId, pendingCount: MAX_PENDING_JOBS }, 'Playlist rate limit hit: max pending');
            return {
                allowed: false,
                pendingCount: MAX_PENDING_JOBS,
                error: `Maximum ${MAX_PENDING_JOBS} pending jobs allowed`,
            };
        }

        // Atomic increment of hourly count
        const hourlyCount = await redis.incr(hourlyKey);
        if (hourlyCount === 1) {
            await redis.expire(hourlyKey, 3600);
        }

        // Check hourly limit - rollback both if exceeded
        if (hourlyCount > MAX_JOBS_PER_HOUR) {
            await redis.decr(pendingKey);
            await redis.decr(hourlyKey);
            logger.info({ userId, hourlyCount: MAX_JOBS_PER_HOUR }, 'Playlist rate limit hit: max hourly');
            return {
                allowed: false,
                hourlyCount: MAX_JOBS_PER_HOUR,
                error: `Maximum ${MAX_JOBS_PER_HOUR} jobs per hour`,
            };
        }

        logger.debug({ userId, pendingCount: newPendingCount, hourlyCount }, 'Playlist job slot acquired');
        return { allowed: true, pendingCount: newPendingCount, hourlyCount };

    } catch (error) {
        logger.warn({ error, userId }, 'Redis unavailable for playlist rate limiting, using database fallback');
        return checkPlaylistRateLimitsFallback(userId);
    }
}

/**
 * Release a job slot when a job completes or fails.
 */
export async function releaseJobSlot(userId: string): Promise<void> {
    try {
        const pendingKey = `${PENDING_KEY_PREFIX}${userId}`;
        const current = await redis.decr(pendingKey);

        // Prevent negative counts
        if (current < 0) {
            await redis.set(pendingKey, '0', 'EX', PENDING_TTL);
        }

        logger.debug({ userId, pendingCount: Math.max(0, current) }, 'Playlist job slot released');
    } catch (error) {
        logger.warn({ error, userId }, 'Failed to release playlist job slot in Redis');
    }
}

/**
 * Fallback rate limit check using database when Redis is unavailable.
 */
async function checkPlaylistRateLimitsFallback(userId: string): Promise<PlaylistRateLimitResult> {
    const pendingCount = await prisma.playlistJob.count({
        where: {
            userId,
            status: { in: ['PENDING', 'CREATING', 'ADDING_TRACKS', 'UPLOADING_IMAGE'] },
        },
    });

    if (pendingCount >= MAX_PENDING_JOBS) {
        return {
            allowed: false,
            pendingCount,
            error: `Maximum ${MAX_PENDING_JOBS} pending jobs allowed`,
        };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyCount = await prisma.playlistJob.count({
        where: { userId, createdAt: { gte: oneHourAgo } },
    });

    if (hourlyCount >= MAX_JOBS_PER_HOUR) {
        return {
            allowed: false,
            hourlyCount,
            error: `Maximum ${MAX_JOBS_PER_HOUR} jobs per hour`,
        };
    }

    return { allowed: true, pendingCount, hourlyCount };
}
