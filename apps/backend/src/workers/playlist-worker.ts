import { Worker, UnrecoverableError } from 'bullmq';
import Redis from 'ioredis';
import { getRedisUrl, REDIS_CONNECTION_CONFIG } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { workerLoggers } from '../lib/logger';
import { setPlaylistWorkerRunning } from './worker-status';
import { playlistQueue, PlaylistJobData } from './playlist-queue';
import { getValidAccessToken, recordTokenFailure } from '../lib/token-manager';
import {
    getUserPlaylists,
    getPlaylistTracks,
    createPlaylist,
    addTracksToPlaylist,
    uploadPlaylistCover,
} from '../lib/spotify-api';
import {
    SpotifyRateLimitError,
    SpotifyUnauthenticatedError,
    SpotifyForbiddenError,
} from '../lib/spotify-errors';
import { PlaylistJobStatus } from '@prisma/client';
import { releaseJobSlot } from '../lib/rate-limiter';
import { PLAYLIST_WORKER_CONFIG } from './worker-config';

const log = workerLoggers.playlist;

const JOB_TIMEOUT_MS = 300000; // 5 minutes max for playlist creation
const HEARTBEAT_INTERVAL_MS = 30000; // Update heartbeat every 30 seconds
const TRACKS_PER_BATCH = 100; // Spotify limit

// Create a dedicated Redis connection for the worker
let workerConnection: Redis | null = null;
export let playlistWorker: Worker<PlaylistJobData> | null = null;

// Redis key for coordinating queue pause across workers
const PAUSE_UNTIL_KEY = 'playlist_queue:pause_until';

async function updateJobStatus(
    jobId: string,
    status: PlaylistJobStatus,
    updates: Partial<{
        totalTracks: number;
        addedTracks: number;
        spotifyPlaylistId: string;
        spotifyPlaylistUrl: string;
        errorMessage: string;
        startedAt: Date;
        completedAt: Date;
        processingTimeMs: number;
        retryCount: number;
        rateLimitDelays: number;
    }> = {}
): Promise<void> {
    await prisma.playlistJob.update({
        where: { id: jobId },
        data: { status, ...updates },
    });
}

async function updateHeartbeat(jobId: string): Promise<void> {
    await prisma.playlistJob.update({
        where: { id: jobId },
        data: { lastHeartbeatAt: new Date() },
    });
}

import {
    resolveShuffleTracks,
    resolveTop50Tracks,
    resolveAllTimeTop50Tracks,
    resolveRecentTracks
} from '../services/playlist-service';

export async function resolveTrackUris(
    jobId: string,
    userId: string,
    accessToken: string
): Promise<string[]> {
    const job = await prisma.playlistJob.findUnique({
        where: { id: jobId },
        include: { user: true },
    });

    if (!job) {
        throw new UnrecoverableError(`Job ${jobId} not found`);
    }

    const { creationMethod, sourcePlaylistId, shuffleMode, kValue, startDate, endDate } = job;

    switch (creationMethod) {
        case 'SHUFFLE': {
            if (!sourcePlaylistId) {
                throw new UnrecoverableError('Source playlist ID required for shuffle');
            }
            return resolveShuffleTracks(accessToken, sourcePlaylistId);
        }

        case 'TOP_50_SHORT':
        case 'TOP_50_MEDIUM':
        case 'TOP_50_LONG': {
            const termMap = {
                TOP_50_SHORT: 'TOP_50_SHORT',
                TOP_50_MEDIUM: 'TOP_50_MEDIUM',
                TOP_50_LONG: 'TOP_50_LONG',
            } as const;
            return resolveTop50Tracks(userId, termMap[creationMethod]);
        }

        case 'TOP_50_ALL_TIME': {
            return resolveAllTimeTop50Tracks(userId);
        }

        case 'TOP_K_RECENT': {
            if (!kValue) {
                throw new UnrecoverableError('kValue required for TOP_K_RECENT');
            }
            return resolveRecentTracks(userId, kValue, startDate ? new Date(startDate) : undefined, endDate ? new Date(endDate) : undefined);
        }

        default:
            throw new UnrecoverableError(`Unknown creation method: ${creationMethod}`);
    }
}

async function processPlaylistJob(
    jobId: string,
    userId: string,
    accessToken: string,
    spotifyUserId: string,
    heartbeatInterval: NodeJS.Timeout
): Promise<void> {
    const startTime = Date.now();

    await updateJobStatus(jobId, 'CREATING', { startedAt: new Date() });

    // Resolve track URIs based on creation method
    log.info({ jobId }, 'Resolving track URIs');
    const trackUris = await resolveTrackUris(jobId, userId, accessToken);

    if (trackUris.length === 0) {
        throw new UnrecoverableError('No tracks found for playlist');
    }

    if (trackUris.length < 25) {
        throw new UnrecoverableError(`Only ${trackUris.length} tracks found; minimum is 25`);
    }

    // Truncate to Spotify limit
    const finalTracks = trackUris.slice(0, 10000);
    if (trackUris.length > 10000) {
        log.warn({ jobId, originalCount: trackUris.length }, 'Truncated tracks to 10000');
    }

    await updateJobStatus(jobId, 'CREATING', { totalTracks: finalTracks.length });

    // Load job details for playlist name
    const job = await prisma.playlistJob.findUnique({ where: { id: jobId } });
    if (!job) throw new UnrecoverableError(`Job ${jobId} disappeared`);

    // Check if playlist was already created in a previous attempt (to avoid duplicates on retry)
    let spotifyPlaylistId = job.spotifyPlaylistId;
    let spotifyPlaylistUrl = job.spotifyPlaylistUrl;

    if (!spotifyPlaylistId) {
        // Create the playlist on Spotify
        log.info({ jobId, name: job.name }, 'Creating playlist on Spotify');
        const playlist = await createPlaylist(accessToken, spotifyUserId, {
            name: job.name,
            isPublic: job.isPublic,
            description: `Created by MYI`,
        });
        spotifyPlaylistId = playlist.id;
        spotifyPlaylistUrl = playlist.external_urls.spotify;

        await updateJobStatus(jobId, 'ADDING_TRACKS', {
            spotifyPlaylistId,
            spotifyPlaylistUrl,
        });
    } else {
        log.info({ jobId, spotifyPlaylistId }, 'Reusing existing playlist from previous attempt');
        await updateJobStatus(jobId, 'ADDING_TRACKS');
    }

    // Add tracks in batches, resuming from where we left off on retry
    const alreadyAddedTracks = job.addedTracks || 0;
    const startBatch = Math.floor(alreadyAddedTracks / TRACKS_PER_BATCH);
    const batches = Math.ceil(finalTracks.length / TRACKS_PER_BATCH);

    if (alreadyAddedTracks > 0) {
        log.info({ jobId, alreadyAddedTracks, startBatch }, 'Resuming track addition from previous attempt');
    }

    for (let i = startBatch; i < batches; i++) {
        const batch = finalTracks.slice(i * TRACKS_PER_BATCH, (i + 1) * TRACKS_PER_BATCH);
        await addTracksToPlaylist(accessToken, spotifyPlaylistId, batch);

        const addedCount = (i + 1) * TRACKS_PER_BATCH;
        await updateJobStatus(jobId, 'ADDING_TRACKS', {
            addedTracks: Math.min(addedCount, finalTracks.length),
        });

        log.debug({ jobId, batch: i + 1, total: batches }, 'Added track batch');
    }

    // Upload cover image if provided
    if (job.coverImageBase64) {
        await updateJobStatus(jobId, 'UPLOADING_IMAGE');
        log.info({ jobId }, 'Uploading cover image');
        await uploadPlaylistCover(accessToken, spotifyPlaylistId, job.coverImageBase64);
    }

    // Mark complete
    const processingTimeMs = Date.now() - startTime;
    await updateJobStatus(jobId, 'COMPLETED', {
        completedAt: new Date(),
        processingTimeMs,
        addedTracks: finalTracks.length,
    });

    log.info({ jobId, trackCount: finalTracks.length, processingTimeMs }, 'Playlist creation completed');
}

export async function checkStaleJobs(): Promise<void> {
    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

    try {
        const result = await prisma.playlistJob.updateMany({
            where: {
                status: { in: ['CREATING', 'ADDING_TRACKS', 'UPLOADING_IMAGE'] },
                lastHeartbeatAt: {
                    lt: staleThreshold,
                },
            },
            data: {
                status: 'FAILED',
                errorMessage: 'Job stalled (no heartbeat for 5 minutes)',
                completedAt: new Date(),
            },
        });

        if (result.count > 0) {
            log.warn({ count: result.count }, 'Cleaned up stale playlist jobs');
        }
    } catch (error) {
        log.error({ error }, 'Failed to check stale jobs');
    }
}

export function setupPlaylistWorker() {
    if (playlistWorker) return playlistWorker;

    workerConnection = new Redis(getRedisUrl(), REDIS_CONNECTION_CONFIG);

    playlistWorker = new Worker<PlaylistJobData>(
        'create-playlist',
        async (bullJob) => {
            const { jobId, userId } = bullJob.data;
            log.info({ jobId, userId }, 'Processing playlist creation job');

            // Start heartbeat interval
            const heartbeatInterval = setInterval(async () => {
                try {
                    await updateHeartbeat(jobId);
                } catch (err) {
                    log.warn({ jobId, error: err }, 'Failed to update heartbeat');
                }
            }, HEARTBEAT_INTERVAL_MS);

            try {
                // Get user with Spotify ID
                const user = await prisma.user.findUnique({ where: { id: userId } });
                if (!user) {
                    throw new UnrecoverableError(`User ${userId} not found`);
                }

                // Get valid access token
                const tokenResult = await getValidAccessToken(userId);
                if (!tokenResult) {
                    throw new UnrecoverableError(`No valid token for user ${userId}`);
                }

                // Set timeout for entire job
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('Job timeout')), JOB_TIMEOUT_MS);
                });

                await Promise.race([
                    processPlaylistJob(jobId, userId, tokenResult.accessToken, user.spotifyId, heartbeatInterval),
                    timeoutPromise,
                ]);
            } catch (error) {
                // Handle Spotify-specific errors
                if (error instanceof SpotifyUnauthenticatedError) {
                    log.warn({ userId, jobId }, 'Token expired during playlist creation');
                    const invalidated = await recordTokenFailure(userId, 'spotify_401_playlist');
                    if (invalidated) {
                        await updateJobStatus(jobId, 'FAILED', {
                            errorMessage: 'Authentication expired - please reconnect Spotify',
                        });
                        throw new UnrecoverableError('Token invalidated');
                    }
                    throw error;
                }

                if (error instanceof SpotifyForbiddenError) {
                    log.error({ userId, jobId }, 'Forbidden - user may need to grant playlist permissions');
                    await recordTokenFailure(userId, 'spotify_403_playlist');
                    await updateJobStatus(jobId, 'FAILED', {
                        errorMessage: 'Permission denied - please reconnect Spotify with playlist permissions',
                    });
                    throw new UnrecoverableError('Missing playlist permissions');
                }

                if (error instanceof SpotifyRateLimitError) {
                    const delayMs = (error.retryAfterSeconds * 1000) + Math.floor(Math.random() * 3000);
                    log.warn({ jobId, retryAfter: error.retryAfterSeconds }, 'Rate limited, delaying job');

                    // Increment rate limit counter
                    const job = await prisma.playlistJob.findUnique({ where: { id: jobId } });
                    await prisma.playlistJob.update({
                        where: { id: jobId },
                        data: { rateLimitDelays: (job?.rateLimitDelays ?? 0) + 1 },
                    });

                    // Coordinate pause/resume across all workers
                    const pauseUntil = Date.now() + (error.retryAfterSeconds * 1000);
                    const existingPause = await workerConnection!.get(PAUSE_UNTIL_KEY);
                    const existingTime = existingPause ? parseInt(existingPause, 10) : 0;

                    if (pauseUntil > existingTime) {
                        await workerConnection!.set(PAUSE_UNTIL_KEY, pauseUntil.toString(), 'EX', error.retryAfterSeconds + 10);
                        await playlistQueue.pause();

                        setTimeout(async () => {
                            const currentPause = await workerConnection!.get(PAUSE_UNTIL_KEY);
                            const currentTime = currentPause ? parseInt(currentPause, 10) : 0;

                            // Only resume if our pause time is still the latest
                            if (Date.now() >= currentTime) {
                                await playlistQueue.resume();
                                await workerConnection!.del(PAUSE_UNTIL_KEY);
                                log.info('Playlist queue resumed after coordinated pause');
                            }
                        }, error.retryAfterSeconds * 1000);
                    }

                    await bullJob.moveToDelayed(Date.now() + delayMs, bullJob.token);
                    return;
                }

                // Update job with error
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                await updateJobStatus(jobId, 'FAILED', { errorMessage, completedAt: new Date() });

                throw error;
            } finally {
                clearInterval(heartbeatInterval);
            }
        },
        {
            connection: workerConnection,
            concurrency: PLAYLIST_WORKER_CONFIG.concurrency,
            limiter: PLAYLIST_WORKER_CONFIG.limiter,
        }
    );

    playlistWorker.on('completed', async (job) => {
        const { userId, jobId } = job.data;
        log.info({ jobId, userId }, 'Playlist job completed');
        // Release rate limit slot
        await releaseJobSlot(userId);
    });

    playlistWorker.on('failed', async (job, error) => {
        if (!job) return;
        const { userId, jobId } = job.data;
        log.error({
            jobId,
            userId,
            error: error.message,
            attempts: job.attemptsMade,
        }, 'Playlist job failed');
        // Release rate limit slot on final failure
        await releaseJobSlot(userId);
    });

    playlistWorker.on('error', (error) => {
        log.error({ error }, 'Playlist worker error');
    });

    // Start stale job cleanup interval (every 5 minutes)
    setInterval(() => {
        checkStaleJobs().catch(err => log.error({ error: err }, 'Failed to run stale job cleanup'));
    }, 5 * 60 * 1000);

    setPlaylistWorkerRunning(true);
    log.info('Playlist worker initialized with dedicated Redis connection');

    return playlistWorker;
}

export async function closePlaylistWorker(): Promise<void> {
    setPlaylistWorkerRunning(false);
    if (playlistWorker) {
        await playlistWorker.close();
        playlistWorker = null;
    }
    if (workerConnection) {
        await workerConnection.quit();
        workerConnection = null;
    }
}
