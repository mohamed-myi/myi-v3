import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { redis, queueTrackForMetadata } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { parseEndsongRecord } from '../lib/import-parser';
import { insertListeningEventWithIds } from './ingestion';
import { updateStatsForEvents } from './aggregation';
import type { ParsedImportEvent, ImportProgress } from '../types/import';
import type { ParsedListeningEvent, InsertResultWithIds } from '../types/ingestion';
import { Transform } from 'stream';

const BATCH_SIZE = 100;
const DB_UPDATE_INTERVAL = 1000; // Update DB every 1000 records
const PROGRESS_KEY = (jobId: string) => `import_progress:${jobId}`;

// Process streaming JSON file
export async function processImportStream(
    userId: string,
    jobId: string,
    fileName: string,
    fileStream: NodeJS.ReadableStream
): Promise<void> {
    let batch: ParsedImportEvent[] = [];
    let totalRecords = 0;
    let processedRecords = 0;
    let addedRecords = 0;
    let skippedRecords = 0;

    // Get user timezone for aggregation
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { settings: { select: { timezone: true } } },
    });
    const userTimezone = user?.settings?.timezone ?? 'UTC';

    // Create or update ImportJob record in DB
    await prisma.importJob.upsert({
        where: { id: jobId },
        create: {
            id: jobId,
            userId,
            fileName,
            status: 'processing',
            startedAt: new Date(),
        },
        update: {
            status: 'processing',
            startedAt: new Date(),
        },
    });

    // Update progress in Redis
    const updateProgress = async (status: ImportProgress['status'], error?: string) => {
        await redis.set(PROGRESS_KEY(jobId), JSON.stringify({
            status,
            totalRecords,
            processedRecords,
            addedRecords,
            skippedRecords,
            errorMessage: error,
        }), 'EX', 86400); // 24h TTL
    };

    // Update progress in DB periodically
    const updateProgressDB = async () => {
        await prisma.importJob.update({
            where: { id: jobId },
            data: {
                totalEvents: totalRecords,
                processedEvents: processedRecords,
            },
        });
    };

    await updateProgress('processing');

    try {
        // Stream parse JSON array
        const jsonStream = fileStream
            .pipe(parser())
            .pipe(streamArray());

        for await (const { value } of jsonStream) {
            totalRecords++;
            const parsed = parseEndsongRecord(value);

            if (parsed) {
                batch.push(parsed);
            } else {
                skippedRecords++;
            }

            // Process batch
            if (batch.length >= BATCH_SIZE) {
                const results = await insertImportBatch(userId, batch, userTimezone);
                addedRecords += results.added;
                skippedRecords += results.skipped;
                processedRecords += batch.length;
                batch = [];
                await updateProgress('processing');

                // Periodically update DB
                if (processedRecords % DB_UPDATE_INTERVAL === 0) {
                    await updateProgressDB();
                }
            }
        }

        // Final batch
        if (batch.length > 0) {
            const results = await insertImportBatch(userId, batch, userTimezone);
            addedRecords += results.added;
            skippedRecords += results.skipped;
            processedRecords += batch.length;
        }

        await updateProgress('completed');

        // Update DB with final status
        await prisma.importJob.update({
            where: { id: jobId },
            data: {
                status: 'completed',
                totalEvents: totalRecords,
                processedEvents: processedRecords,
                completedAt: new Date(),
            },
        });
    } catch (error) {
        console.error('Import failed:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await updateProgress('failed', errorMessage);

        // Update DB with failure status
        await prisma.importJob.update({
            where: { id: jobId },
            data: {
                status: 'failed',
                errorMessage,
                completedAt: new Date(),
            },
        });

        throw error;
    }
}

// Insert batch of import events
async function insertImportBatch(
    userId: string,
    events: ParsedImportEvent[],
    userTimezone: string
): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;
    const aggregationEvents: InsertResultWithIds[] = [];

    for (const event of events) {
        const trackId = await upsertImportTrack(event);

        const existing = await prisma.listeningEvent.findUnique({
            where: {
                userId_trackId_playedAt: {
                    userId,
                    trackId,
                    playedAt: event.playedAt,
                },
            },
            select: { isEstimated: true, source: true },
        });

        if (!existing) {
            await prisma.listeningEvent.create({
                data: {
                    userId,
                    trackId,
                    playedAt: event.playedAt,
                    msPlayed: event.msPlayed,
                    isEstimated: false,
                    source: 'import',
                    isSkip: event.isSkip,
                },
            });
            added++;
            aggregationEvents.push({
                status: 'added',
                trackId,
                artistIds: [],
                playedAt: event.playedAt,
                msPlayed: event.msPlayed
            });
        } else {
            if (existing.isEstimated && existing.source !== 'import') {
                // Update estimated event
                await prisma.listeningEvent.update({
                    where: {
                        userId_trackId_playedAt: {
                            userId,
                            trackId,
                            playedAt: event.playedAt,
                        },
                    },
                    data: {
                        msPlayed: event.msPlayed,
                        isEstimated: false,
                        source: 'import',
                        isSkip: event.isSkip,
                    },
                });
                skipped++;
            } else {
                skipped++;
            }
        }
    }

    if (aggregationEvents.length > 0) {
        const trackIds = [...new Set(aggregationEvents.map(e => e.trackId))];
        const tracks = await prisma.track.findMany({
            where: { id: { in: trackIds } },
            select: { id: true, artists: { select: { artistId: true } } }
        });

        const trackArtistMap = new Map(tracks.map(t => [t.id, t.artists.map(a => a.artistId)]));

        const inputs = aggregationEvents.map(e => ({
            trackId: e.trackId,
            artistIds: trackArtistMap.get(e.trackId) || [],
            playedAt: e.playedAt,
            msPlayed: e.msPlayed,
        }));

        await updateStatsForEvents(userId, inputs, userTimezone);
    }

    return { added, skipped };
}

// Upsert minimal track from import
async function upsertImportTrack(event: ParsedImportEvent): Promise<string> {
    const existing = await prisma.track.findUnique({
        where: { spotifyId: event.trackSpotifyId },
        select: { id: true },
    });

    if (existing) {
        return existing.id;
    }

    const created = await prisma.track.create({
        data: {
            spotifyId: event.trackSpotifyId,
            name: event.trackName,
            durationMs: event.msPlayed,
        },
        select: { id: true },
    });

    await queueTrackForMetadata(event.trackSpotifyId);

    return created.id;
}

// Get import progress from Redis 
export async function getImportProgress(
    jobId: string
): Promise<ImportProgress | null> {
    const data = await redis.get(PROGRESS_KEY(jobId));
    return data ? JSON.parse(data) : null;
}

// Get import progress from DB 
export async function getImportProgressFromDB(
    jobId: string,
    userId: string
): Promise<ImportProgress | null> {
    const job = await prisma.importJob.findFirst({
        where: { id: jobId, userId },
    });

    if (!job) return null;

    return {
        status: job.status as ImportProgress['status'],
        totalRecords: job.totalEvents,
        processedRecords: job.processedEvents,
        addedRecords: job.processedEvents,
        skippedRecords: 0,
        errorMessage: job.errorMessage ?? undefined,
    };
}
