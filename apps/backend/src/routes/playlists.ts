import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { generateConfirmationToken, verifyConfirmationToken, verifyConfirmationTokenWithParams } from '../lib/confirmation-token';
import { getValidAccessToken } from '../lib/token-manager';
import { getUserPlaylists, getPlaylistTracks, getTopTracks, TimeRange } from '../lib/spotify-api';
import { playlistQueue, PlaylistJobData } from '../workers/playlist-queue';
import { PlaylistCreationMethod, PlaylistJobStatus } from '@prisma/client';
import { validateImageMagicBytes } from '../lib/image-validation';
import { tryAcquireJobSlot } from '../lib/rate-limiter';
import { ensureTopTracksCached } from '../services/top-stats-service';
import { generateIdempotencyKey } from '../lib/idempotency';

const log = logger.child({ module: 'PlaylistRoutes' });

// Validation schemas
const shuffleValidateSchema = z.object({
    sourcePlaylistId: z.string().min(1),
    shuffleMode: z.enum(['truly_random', 'less_repetition']).optional().default('truly_random'),
});

const recentValidateSchema = z.object({
    kValue: z.number().int().min(25).max(10000),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

const top50ValidateSchema = z.object({
    term: z.enum(['short', 'medium', 'long', 'all_time']),
});

const shuffleCreateSchema = z.object({
    name: z.string().min(1).max(100),
    sourcePlaylistId: z.string().min(1),
    shuffleMode: z.enum(['truly_random', 'less_repetition']).optional().default('truly_random'),
    isPublic: z.boolean().optional().default(false),
    coverImageBase64: z.string().max(341000).optional(), // 256KB raw = ~341KB base64
    confirmationToken: z.string(),
});

const top50CreateSchema = z.object({
    name: z.string().min(1).max(100),
    term: z.enum(['short', 'medium', 'long', 'all_time']),
    isPublic: z.boolean().optional().default(false),
    coverImageBase64: z.string().max(341000).optional(), // 256KB raw = ~341KB base64
    confirmationToken: z.string(),
});

const recentCreateSchema = z.object({
    name: z.string().min(1).max(100),
    kValue: z.number().int().min(25).max(10000),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    isPublic: z.boolean().optional().default(false),
    coverImageBase64: z.string().max(341000).optional(), // 256KB raw = ~341KB base64
    confirmationToken: z.string(),
});

const jobsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
    offset: z.coerce.number().int().min(0).optional().default(0),
});

const playlistsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
});

// Helper to count tracks for recent
async function countRecentTracks(
    userId: string,
    kValue: number,
    startDate?: Date,
    endDate?: Date
): Promise<{ count: number; warnings: string[] }> {
    const where: { userId: string; playedAt?: { gte?: Date; lte?: Date } } = { userId };
    const warnings: string[] = [];

    if (startDate || endDate) {
        where.playedAt = {};
        if (startDate) where.playedAt.gte = startDate;
        if (endDate) where.playedAt.lte = endDate;
    }

    // Get unique track count
    const events = await prisma.listeningEvent.findMany({
        where,
        select: { track: { select: { spotifyId: true } } },
        orderBy: { playedAt: 'desc' },
        take: kValue * 3,
    });

    const uniqueIds = new Set(events.map(e => e.track.spotifyId));
    const count = Math.min(uniqueIds.size, kValue);

    if (count < kValue) {
        warnings.push(`Only ${count} unique tracks available (requested ${kValue})`);
    }

    return { count, warnings };
}

export async function playlistRoutes(fastify: FastifyInstance) {
    // Validate shuffle: check source playlist track count
    fastify.post('/playlists/validate/shuffle', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const parsed = shuffleValidateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.message });
        }

        if (request.isDemo) {
            return reply.status(403).send({
                error: 'Demo Mode',
                message: 'Sorry, this feature is disabled in demo mode.',
                code: 'DEMO_MODE_RESTRICTED'
            });
        }

        const { sourcePlaylistId, shuffleMode } = parsed.data;
        const warnings: string[] = [];

        const tokenResult = await getValidAccessToken(userId);
        if (!tokenResult) {
            return reply.status(401).send({ error: 'Spotify token expired - please reconnect' });
        }

        try {
            // Fetch first page to get total
            const response = await getPlaylistTracks(tokenResult.accessToken, sourcePlaylistId, 1, 0);
            const trackCount = response.total;

            if (trackCount < 25) {
                warnings.push(`Playlist has only ${trackCount} tracks (minimum 25 required)`);
            }

            if (trackCount > 10000) {
                warnings.push(`Playlist has ${trackCount} tracks; will be truncated to 10,000`);
            }

            const confirmationToken = generateConfirmationToken(userId, {
                method: 'shuffle',
                sourcePlaylistId,
                shuffleMode,
                trackCount,
            });

            return {
                trackCount,
                warnings,
                confirmationToken,
            };
        } catch (error) {
            log.error({ error, sourcePlaylistId }, 'Failed to validate shuffle playlist');
            return reply.status(400).send({ error: 'Failed to access playlist' });
        }
    });

    // Validate recent: check available tracks
    fastify.post('/playlists/validate/recent', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const parsed = recentValidateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.message });
        }

        if (request.isDemo) {
            return reply.status(403).send({
                error: 'Demo Mode',
                message: 'Sorry, this feature is disabled in demo mode.',
                code: 'DEMO_MODE_RESTRICTED'
            });
        }

        const { kValue, startDate, endDate } = parsed.data;

        // Validate date range
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

            if (daysDiff > 365) {
                return reply.status(400).send({ error: 'Date range cannot exceed 365 days' });
            }
            if (start >= end) {
                return reply.status(400).send({ error: 'Start date must be before end date' });
            }
        }

        const { count, warnings } = await countRecentTracks(
            userId,
            kValue,
            startDate ? new Date(startDate) : undefined,
            endDate ? new Date(endDate) : undefined
        );

        if (count < 25) {
            return reply.status(400).send({
                error: `Only ${count} unique tracks available (minimum 25 required)`,
            });
        }

        const confirmationToken = generateConfirmationToken(userId, {
            method: 'recent',
            kValue,
            startDate,
            endDate,
            trackCount: count,
        });

        return {
            trackCount: count,
            warnings,
            confirmationToken,
        };
    });

    // Validate top50: check available top tracks for the selected term
    fastify.post('/playlists/validate/top50', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const parsed = top50ValidateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.message });
        }

        if (request.isDemo) {
            return reply.status(403).send({
                error: 'Demo Mode',
                message: 'Sorry, this feature is disabled in demo mode.',
                code: 'DEMO_MODE_RESTRICTED'
            });
        }

        const { term } = parsed.data;
        const warnings: string[] = [];
        let trackCount: number;

        if (term === 'all_time') {
            // Query database for all-time top tracks (from UserTrackStats)
            trackCount = await prisma.userTrackStats.count({
                where: { userId },
            });

            // Cap at 50 for playlist
            trackCount = Math.min(trackCount, 50);
        } else {
            // Use cached top tracks, refreshing if stale (ISSUE-004 fix)
            // This ensures the worker will have the same data we're counting
            try {
                const cacheResult = await ensureTopTracksCached(userId, term as 'short' | 'medium' | 'long');
                trackCount = cacheResult.trackCount;

                if (cacheResult.cacheRefreshed) {
                    log.info({ userId, term }, 'Top stats cache refreshed during validation');
                }
            } catch (error) {
                log.error({ error, term }, 'Failed to ensure top tracks cache');
                return reply.status(400).send({ error: 'Failed to fetch top tracks from Spotify' });
            }
        }

        if (trackCount === 0) {
            return reply.status(400).send({
                error: 'No top tracks available for this time range',
            });
        }

        if (trackCount < 50) {
            warnings.push(`Only ${trackCount} tracks available (less than 50)`);
        }

        const confirmationToken = generateConfirmationToken(userId, {
            method: 'top50',
            term,
            trackCount,
        });

        return {
            trackCount,
            warnings,
            confirmationToken,
        };
    });

    // Create shuffle playlist
    fastify.post('/playlists/create/shuffle', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const parsed = shuffleCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.message });
        }

        const { name, sourcePlaylistId, shuffleMode, isPublic, coverImageBase64, confirmationToken } = parsed.data;

        // Validate image if provided
        if (coverImageBase64 && !validateImageMagicBytes(coverImageBase64)) {
            return reply.status(400).send({ error: 'Invalid image format. Only JPEG and PNG are supported.' });
        }

        // Verify token and ensure request params match token params
        const tokenResult = verifyConfirmationTokenWithParams(
            confirmationToken,
            userId,
            { method: 'shuffle', sourcePlaylistId, shuffleMode },
            ['method', 'sourcePlaylistId', 'shuffleMode']
        );
        if (!tokenResult.valid) {
            return reply.status(400).send({
                error: tokenResult.error || 'Invalid confirmation token',
                details: tokenResult.paramMismatch,
            });
        }

        // Check for existing job with same idempotency key (prevents duplicate jobs on network retries)
        const idempotencyKey = generateIdempotencyKey(confirmationToken);
        const existingJob = await prisma.playlistJob.findFirst({
            where: { idempotencyKey },
            select: { id: true, status: true },
        });

        if (existingJob) {
            log.info({ jobId: existingJob.id, userId }, 'Returning existing job due to idempotency');
            return {
                jobId: existingJob.id,
                message: 'Playlist creation already in progress',
                statusUrl: `/api/playlists/jobs/${existingJob.id}`,
                idempotent: true,
            };
        }

        // Check rate limits
        const rateCheck = await tryAcquireJobSlot(userId);
        if (!rateCheck.allowed) {
            return reply.status(429).send({ error: rateCheck.error });
        }

        // Create job in database
        const shuffleModeEnum = shuffleMode === 'less_repetition' ? 'LESS_REPETITION' : 'TRULY_RANDOM';
        const job = await prisma.playlistJob.create({
            data: {
                userId,
                idempotencyKey,
                creationMethod: 'SHUFFLE',
                name,
                isPublic,
                sourcePlaylistId,
                shuffleMode: shuffleModeEnum,
                coverImageBase64,
                estimatedTracks: (tokenResult.params?.trackCount as number) || undefined,
            },
        });

        // Enqueue worker job
        await playlistQueue.add('create-playlist', {
            jobId: job.id,
            userId,
            creationMethod: 'SHUFFLE',
        } satisfies PlaylistJobData, { jobId: job.id });

        log.info({ jobId: job.id, userId, method: 'SHUFFLE' }, 'Playlist job enqueued');

        return {
            jobId: job.id,
            message: 'Playlist creation started',
            statusUrl: `/api/playlists/jobs/${job.id}`,
        };
    });

    // Create top-50 playlist
    fastify.post('/playlists/create/top50', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const parsed = top50CreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.message });
        }

        const { name, term, isPublic, coverImageBase64, confirmationToken } = parsed.data;

        // Validate image if provided
        if (coverImageBase64 && !validateImageMagicBytes(coverImageBase64)) {
            return reply.status(400).send({ error: 'Invalid image format. Only JPEG and PNG are supported.' });
        }

        // Verify token and ensure request params match token params
        const tokenResult = verifyConfirmationTokenWithParams(
            confirmationToken,
            userId,
            { method: 'top50', term },
            ['method', 'term']
        );
        if (!tokenResult.valid) {
            return reply.status(400).send({
                error: tokenResult.error || 'Invalid confirmation token',
                details: tokenResult.paramMismatch,
            });
        }

        // Map term to creation method
        const methodMap: Record<string, PlaylistCreationMethod> = {
            short: 'TOP_50_SHORT',
            medium: 'TOP_50_MEDIUM',
            long: 'TOP_50_LONG',
            all_time: 'TOP_50_ALL_TIME',
        };
        const creationMethod = methodMap[term];

        // Check for existing job with same idempotency key (prevents duplicate jobs on network retries)
        const idempotencyKey = generateIdempotencyKey(confirmationToken);
        const existingJob = await prisma.playlistJob.findFirst({
            where: { idempotencyKey },
            select: { id: true, status: true },
        });

        if (existingJob) {
            log.info({ jobId: existingJob.id, userId }, 'Returning existing job due to idempotency');
            return {
                jobId: existingJob.id,
                message: 'Playlist creation already in progress',
                statusUrl: `/api/playlists/jobs/${existingJob.id}`,
                idempotent: true,
            };
        }

        // Check rate limits
        const rateCheck = await tryAcquireJobSlot(userId);
        if (!rateCheck.allowed) {
            return reply.status(429).send({ error: rateCheck.error });
        }

        // Create job in database
        const job = await prisma.playlistJob.create({
            data: {
                userId,
                idempotencyKey,
                creationMethod,
                name,
                isPublic,
                coverImageBase64,
                estimatedTracks: 50,
            },
        });

        // Enqueue worker job
        await playlistQueue.add('create-playlist', {
            jobId: job.id,
            userId,
            creationMethod,
        } satisfies PlaylistJobData, { jobId: job.id });

        log.info({ jobId: job.id, userId, method: creationMethod }, 'Playlist job enqueued');

        return {
            jobId: job.id,
            message: 'Playlist creation started',
            statusUrl: `/api/playlists/jobs/${job.id}`,
        };
    });

    // Create recent playlist
    fastify.post('/playlists/create/recent', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const parsed = recentCreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.message });
        }

        const { name, kValue, startDate, endDate, isPublic, coverImageBase64, confirmationToken } = parsed.data;

        // Validate image if provided
        if (coverImageBase64 && !validateImageMagicBytes(coverImageBase64)) {
            return reply.status(400).send({ error: 'Invalid image format. Only JPEG and PNG are supported.' });
        }

        // Verify token and ensure request params match token params
        const tokenResult = verifyConfirmationTokenWithParams(
            confirmationToken,
            userId,
            { method: 'recent', kValue, startDate, endDate },
            ['method', 'kValue', 'startDate', 'endDate']
        );
        if (!tokenResult.valid) {
            return reply.status(400).send({
                error: tokenResult.error || 'Invalid confirmation token',
                details: tokenResult.paramMismatch,
            });
        }

        // Check for existing job with same idempotency key (prevents duplicate jobs on network retries)
        const idempotencyKey = generateIdempotencyKey(confirmationToken);
        const existingJob = await prisma.playlistJob.findFirst({
            where: { idempotencyKey },
            select: { id: true, status: true },
        });

        if (existingJob) {
            log.info({ jobId: existingJob.id, userId }, 'Returning existing job due to idempotency');
            return {
                jobId: existingJob.id,
                message: 'Playlist creation already in progress',
                statusUrl: `/api/playlists/jobs/${existingJob.id}`,
                idempotent: true,
            };
        }

        // Check rate limits
        const rateCheck = await tryAcquireJobSlot(userId);
        if (!rateCheck.allowed) {
            return reply.status(429).send({ error: rateCheck.error });
        }

        // Create job in database
        const job = await prisma.playlistJob.create({
            data: {
                userId,
                idempotencyKey,
                creationMethod: 'TOP_K_RECENT',
                name,
                isPublic,
                kValue,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                coverImageBase64,
                estimatedTracks: (tokenResult.params?.trackCount as number) || kValue,
            },
        });

        // Enqueue worker job
        await playlistQueue.add('create-playlist', {
            jobId: job.id,
            userId,
            creationMethod: 'TOP_K_RECENT',
        } satisfies PlaylistJobData, { jobId: job.id });

        log.info({ jobId: job.id, userId, method: 'TOP_K_RECENT' }, 'Playlist job enqueued');

        return {
            jobId: job.id,
            message: 'Playlist creation started',
            statusUrl: `/api/playlists/jobs/${job.id}`,
        };
    });

    // List user's playlist jobs
    fastify.get('/playlists/jobs', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const parsed = jobsQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.message });
        }

        const { limit, offset } = parsed.data;

        const jobs = await prisma.playlistJob.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                name: true,
                creationMethod: true,
                status: true,
                totalTracks: true,
                addedTracks: true,
                spotifyPlaylistId: true,
                spotifyPlaylistUrl: true,
                errorMessage: true,
                createdAt: true,
                startedAt: true,
                completedAt: true,
            },
        });

        const total = await prisma.playlistJob.count({ where: { userId } });

        return {
            jobs,
            pagination: { total, limit, offset },
        };
    });

    // Get single job status
    fastify.get('/playlists/jobs/:id', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const { id } = request.params as { id: string };

        const job = await prisma.playlistJob.findUnique({
            where: { id },
            select: {
                id: true,
                userId: true,
                name: true,
                creationMethod: true,
                status: true,
                totalTracks: true,
                addedTracks: true,
                estimatedTracks: true,
                spotifyPlaylistId: true,
                spotifyPlaylistUrl: true,
                errorMessage: true,
                retryCount: true,
                rateLimitDelays: true,
                processingTimeMs: true,
                createdAt: true,
                startedAt: true,
                completedAt: true,
            },
        });

        if (!job) {
            return reply.status(404).send({ error: 'Job not found' });
        }

        if (job.userId !== userId) {
            return reply.status(403).send({ error: 'Access denied' });
        }

        // Remove userId from response
        const { userId: _, ...jobData } = job;
        return jobData;
    });

    // Cancel a job
    fastify.post('/playlists/jobs/:id/cancel', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const { id } = request.params as { id: string };

        const job = await prisma.playlistJob.findUnique({ where: { id } });

        if (!job) {
            return reply.status(404).send({ error: 'Job not found' });
        }

        if (job.userId !== userId) {
            return reply.status(403).send({ error: 'Access denied' });
        }

        // Can only cancel pending jobs
        if (job.status !== 'PENDING') {
            return reply.status(400).send({
                error: `Cannot cancel job in ${job.status} status`,
            });
        }

        // Remove from queue
        const bullJob = await playlistQueue.getJob(id);
        if (bullJob) {
            await bullJob.remove();
        }

        // Update database
        await prisma.playlistJob.update({
            where: { id },
            data: {
                status: 'FAILED',
                errorMessage: 'Cancelled by user',
                completedAt: new Date(),
            },
        });

        log.info({ jobId: id, userId }, 'Playlist job cancelled');

        return { message: 'Job cancelled' };
    });

    // Get user's Spotify playlists (for UI selection)
    fastify.get('/playlists/user', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const parsed = playlistsQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return reply.status(400).send({ error: parsed.error.message });
        }

        const { limit, offset } = parsed.data;

        const tokenResult = await getValidAccessToken(userId);
        if (!tokenResult) {
            return reply.status(401).send({ error: 'Spotify token expired - please reconnect' });
        }

        try {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { spotifyId: true },
            });

            if (!user?.spotifyId) {
                // Should not happen if token is valid, but handle gracefully
                log.warn({ userId }, 'User has no spotifyId in database');
            }

            const response = await getUserPlaylists(tokenResult.accessToken, limit, offset);

            return {
                playlists: response.items.map(p => ({
                    id: p.id,
                    name: p.name,
                    imageUrl: p.images[0]?.url || null,
                    trackCount: p.tracks.total,
                    isOwn: user?.spotifyId ? p.owner.id === user.spotifyId : false,
                })),
                pagination: {
                    total: response.total,
                    limit: response.limit,
                    offset: response.offset,
                },
            };
        } catch (error) {
            log.error({ error, userId }, 'Failed to fetch user playlists');
            return reply.status(500).send({ error: 'Failed to fetch playlists' });
        }
    });
}
