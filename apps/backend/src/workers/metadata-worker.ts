import pLimit from 'p-limit';
import { popArtistsForMetadata, popTracksForMetadata, queueArtistForMetadata, queueTrackForMetadata, waitForRateLimit, tryLockMetadata } from '../lib/redis';
import { getValidAccessToken } from '../lib/token-manager';
import { getArtistsBatch, getTracksBatch } from '../lib/spotify-api';
import { prisma } from '../lib/prisma';
import { workerLoggers } from '../lib/logger';
import { setMetadataWorkerRunning } from './worker-status';
import type { Prisma, PrismaClient } from '@prisma/client';

const log = workerLoggers.metadata;

const DB_CONCURRENCY = 5;
const LOCK_CONCURRENCY = 10;

const MIN_BACKOFF_MS = 10_000;
const MAX_BACKOFF_MS = 300_000;
const WARN_LOG_INTERVAL_MS = 60_000;

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

async function processArtists(accessToken: string): Promise<number> {
    const artistIds = await popArtistsForMetadata(50);
    if (artistIds.length === 0) return 0;

    const lockLimit = pLimit(LOCK_CONCURRENCY);
    const lockResults = await Promise.all(
        artistIds.map((id) => lockLimit(async () => ({ id, locked: await tryLockMetadata('artist', id) })))
    );
    const toProcess = lockResults.filter((r) => r.locked).map((r) => r.id);

    if (toProcess.length === 0) {
        log.info({ skipped: artistIds.length }, 'All artists already processed recently');
        return 0;
    }

    try {
        const artists = await getArtistsBatch(accessToken, toProcess);

        await prisma.$transaction(
            artists.map((artist) =>
                prisma.artist.update({
                    where: { spotifyId: artist.id },
                    data: {
                        imageUrl: artist.images[0]?.url || null,
                        genres: artist.genres || [],
                    },
                })
            )
        );

        log.info({ count: artists.length, skipped: artistIds.length - toProcess.length }, 'Updated metadata for artists');
        return artists.length;
    } catch (error) {
        const limit = pLimit(DB_CONCURRENCY);
        await Promise.all(toProcess.map((id) => limit(() => queueArtistForMetadata(id))));
        throw error;
    }
}

interface SpotifyAlbumData {
    id: string;
    name: string;
    images: Array<{ url: string }>;
    release_date?: string | null;
}

interface SpotifyArtistData {
    id: string;
    name: string;
}

interface TrackProcessingContext {
    spotifyTrack: {
        id: string;
        album: SpotifyAlbumData;
        artists: SpotifyArtistData[];
        duration_ms: number;
        preview_url: string | null;
    };
    dbTrackId: string;
}

async function upsertAlbumInTx(tx: TransactionClient, albumData: SpotifyAlbumData): Promise<string> {
    const album = await tx.album.upsert({
        where: { spotifyId: albumData.id },
        create: {
            spotifyId: albumData.id,
            name: albumData.name,
            imageUrl: albumData.images[0]?.url || null,
            releaseDate: albumData.release_date || null,
        },
        update: {
            name: albumData.name,
            imageUrl: albumData.images[0]?.url || null,
        },
        select: { id: true },
    });
    return album.id;
}

async function upsertArtistInTx(tx: TransactionClient, artistData: SpotifyArtistData): Promise<string> {
    const artist = await tx.artist.upsert({
        where: { spotifyId: artistData.id },
        create: { spotifyId: artistData.id, name: artistData.name },
        update: { name: artistData.name },
        select: { id: true },
    });
    return artist.id;
}

async function processTrackBatch(contexts: TrackProcessingContext[]): Promise<void> {
    if (contexts.length === 0) return;

    const uniqueAlbums = new Map<string, SpotifyAlbumData>();
    const uniqueArtists = new Map<string, SpotifyArtistData>();

    for (const ctx of contexts) {
        uniqueAlbums.set(ctx.spotifyTrack.album.id, ctx.spotifyTrack.album);
        for (const artist of ctx.spotifyTrack.artists) {
            uniqueArtists.set(artist.id, artist);
        }
    }

    await prisma.$transaction(async (tx) => {
        const limit = pLimit(DB_CONCURRENCY);

        const albumIdMap = new Map<string, string>();
        await Promise.all(
            Array.from(uniqueAlbums.entries()).map(([spotifyId, album]) =>
                limit(async () => {
                    const id = await upsertAlbumInTx(tx, album);
                    albumIdMap.set(spotifyId, id);
                })
            )
        );

        const artistIdMap = new Map<string, string>();
        await Promise.all(
            Array.from(uniqueArtists.entries()).map(([spotifyId, artist]) =>
                limit(async () => {
                    const id = await upsertArtistInTx(tx, artist);
                    artistIdMap.set(spotifyId, id);
                })
            )
        );

        const artistSpotifyIds = Array.from(uniqueArtists.keys());
        queueArtistsForMetadata(artistSpotifyIds).catch((err) =>
            log.warn({ error: err }, 'Failed to queue some artists for metadata')
        );

        await Promise.all(
            contexts.map((ctx) =>
                limit(async () => {
                    const albumId = albumIdMap.get(ctx.spotifyTrack.album.id);
                    if (!albumId) {
                        log.warn({ albumSpotifyId: ctx.spotifyTrack.album.id }, 'Album ID not found after upsert');
                        return;
                    }

                    await tx.track.update({
                        where: { id: ctx.dbTrackId },
                        data: {
                            albumId,
                            durationMs: ctx.spotifyTrack.duration_ms,
                            previewUrl: ctx.spotifyTrack.preview_url,
                        },
                    });

                    for (const spotifyArtist of ctx.spotifyTrack.artists) {
                        const artistId = artistIdMap.get(spotifyArtist.id);
                        if (!artistId) {
                            log.warn({ artistSpotifyId: spotifyArtist.id }, 'Artist ID not found after upsert');
                            continue;
                        }
                        await tx.trackArtist.upsert({
                            where: { trackId_artistId: { trackId: ctx.dbTrackId, artistId } },
                            create: { trackId: ctx.dbTrackId, artistId },
                            update: {},
                        });
                    }
                })
            )
        );
    }, {
        timeout: 30000, // 30s timeout for the batch
    });
}

async function queueArtistsForMetadata(artistSpotifyIds: string[]): Promise<void> {
    const limit = pLimit(LOCK_CONCURRENCY);
    await Promise.all(artistSpotifyIds.map((id) => limit(() => queueArtistForMetadata(id))));
}

async function processTracks(accessToken: string): Promise<number> {
    const trackSpotifyIds = await popTracksForMetadata(50);
    if (trackSpotifyIds.length === 0) return 0;

    const lockLimit = pLimit(LOCK_CONCURRENCY);
    const lockResults = await Promise.all(
        trackSpotifyIds.map((id) => lockLimit(async () => ({ id, locked: await tryLockMetadata('track', id) })))
    );
    const toProcess = lockResults.filter((r) => r.locked).map((r) => r.id);

    if (toProcess.length === 0) {
        log.info({ skipped: trackSpotifyIds.length }, 'All tracks already processed recently');
        return 0;
    }

    try {
        const spotifyTracks = await getTracksBatch(accessToken, toProcess);

        const validTracks = spotifyTracks.filter((t): t is NonNullable<typeof t> => t !== null);
        const existingTracks = await prisma.track.findMany({
            where: { spotifyId: { in: validTracks.map((t) => t.id) } },
            select: { id: true, spotifyId: true },
        });
        const trackIdMap = new Map(existingTracks.map((t) => [t.spotifyId, t.id]));

        const contexts: TrackProcessingContext[] = [];
        for (const spotifyTrack of validTracks) {
            const dbTrackId = trackIdMap.get(spotifyTrack.id);
            if (dbTrackId) {
                contexts.push({ spotifyTrack, dbTrackId });
            }
        }

        if (contexts.length > 0) {
            await processTrackBatch(contexts);
        }

        log.info({ count: contexts.length, skipped: trackSpotifyIds.length - toProcess.length }, 'Updated metadata for tracks');
        return contexts.length;
    } catch (error) {
        const limit = pLimit(DB_CONCURRENCY);
        await Promise.all(toProcess.map((id) => limit(() => queueTrackForMetadata(id))));
        log.error({ error }, 'Failed to process tracks, re-queued for retry');
        throw error;
    }
}

export async function metadataWorker() {
    log.info('Metadata worker started');
    setMetadataWorkerRunning(true);

    let backoff = MIN_BACKOFF_MS;
    let lastWarnAt = 0;

    while (true) {
        try {
            await waitForRateLimit();

            const user = await prisma.spotifyAuth.findFirst({
                where: { isValid: true },
                orderBy: { lastRefreshAt: 'desc' },
                select: { userId: true },
            });

            if (!user?.userId) {
                const now = Date.now();
                if (now - lastWarnAt >= WARN_LOG_INTERVAL_MS) {
                    log.warn({ backoffMs: backoff }, 'No valid user tokens found for metadata worker. Waiting with backoff...');
                    lastWarnAt = now;
                }
                await new Promise((r) => setTimeout(r, backoff));
                backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
                continue;
            }

            backoff = MIN_BACKOFF_MS;

            const tokenResult = await getValidAccessToken(user.userId);
            if (!tokenResult) {
                log.warn('Failed to refresh token for metadata worker');
                await new Promise((r) => setTimeout(r, 5000));
                continue;
            }

            const artistCount = await processArtists(tokenResult.accessToken);
            const trackCount = await processTracks(tokenResult.accessToken);

            if (artistCount === 0 && trackCount === 0) {
                await new Promise((r) => setTimeout(r, 5000));
            }

        } catch (error) {
            log.error({ error }, 'Error in metadata worker');
            await new Promise((r) => setTimeout(r, 5000));
        }
    }
}
