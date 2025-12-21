import { popArtistsForMetadata, popTracksForMetadata, queueArtistForMetadata, waitForRateLimit, tryLockMetadata } from '../lib/redis';
import { getValidAccessToken } from '../lib/token-manager';
import { getArtistsBatch, getTracksBatch } from '../lib/spotify-api';
import { prisma } from '../lib/prisma';
import { workerLoggers } from '../lib/logger';
import { setMetadataWorkerRunning } from './worker-status';

const log = workerLoggers.metadata;

// Exponential backoff configuration for missing tokens
const MIN_BACKOFF_MS = 10_000;      // Start at 10 seconds
const MAX_BACKOFF_MS = 300_000;     // Max 5 minutes
const WARN_LOG_INTERVAL_MS = 60_000; // Only log warning once per minute

// Process pending artists; fetch metadata and update DB
async function processArtists(accessToken: string): Promise<number> {
    const artistIds = await popArtistsForMetadata(50);
    if (artistIds.length === 0) return 0;

    // Filter to only artists that haven't been processed recently
    const toProcess: string[] = [];
    for (const id of artistIds) {
        if (await tryLockMetadata('artist', id)) {
            toProcess.push(id);
        }
    }

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
        // Re-queue failed artists for retry, lock expires in 24h
        for (const id of toProcess) {
            await queueArtistForMetadata(id);
        }
        throw error;
    }
}

// Process pending tracks; fetch metadata, create albums, link artists
async function processTracks(accessToken: string): Promise<number> {
    const trackSpotifyIds = await popTracksForMetadata(50);
    if (trackSpotifyIds.length === 0) return 0;

    try {
        const spotifyTracks = await getTracksBatch(accessToken, trackSpotifyIds);

        for (const spotifyTrack of spotifyTracks) {
            if (!spotifyTrack) continue;

            // Find the track in our DB
            const track = await prisma.track.findUnique({
                where: { spotifyId: spotifyTrack.id },
                select: { id: true, albumId: true },
            });

            if (!track) continue;

            // Upsert album with image
            const album = await prisma.album.upsert({
                where: { spotifyId: spotifyTrack.album.id },
                create: {
                    spotifyId: spotifyTrack.album.id,
                    name: spotifyTrack.album.name,
                    imageUrl: spotifyTrack.album.images[0]?.url || null,
                    releaseDate: spotifyTrack.album.release_date || null,
                },
                update: {
                    name: spotifyTrack.album.name,
                    imageUrl: spotifyTrack.album.images[0]?.url || null,
                },
                select: { id: true },
            });

            // Upsert artists
            const artistIds: string[] = [];
            for (const spotifyArtist of spotifyTrack.artists) {
                const artist = await prisma.artist.upsert({
                    where: { spotifyId: spotifyArtist.id },
                    create: {
                        spotifyId: spotifyArtist.id,
                        name: spotifyArtist.name,
                    },
                    update: {
                        name: spotifyArtist.name,
                    },
                    select: { id: true },
                });
                artistIds.push(artist.id);

                // Queue artist for full metadata
                await queueArtistForMetadata(spotifyArtist.id);
            }

            // Update track with album and duration
            await prisma.track.update({
                where: { id: track.id },
                data: {
                    albumId: album.id,
                    durationMs: spotifyTrack.duration_ms,
                    previewUrl: spotifyTrack.preview_url,
                },
            });

            // Create artist associations if they don't exist
            for (const artistId of artistIds) {
                await prisma.trackArtist.upsert({
                    where: {
                        trackId_artistId: {
                            trackId: track.id,
                            artistId,
                        },
                    },
                    create: {
                        trackId: track.id,
                        artistId,
                    },
                    update: {},
                });
            }
        }

        log.info({ count: spotifyTracks.length }, 'Updated metadata for tracks');
        return spotifyTracks.length;
    } catch (error) {
        log.error({ error }, 'Failed to process tracks, will retry on next cycle');
        throw error;
    }
}

export async function metadataWorker() {
    log.info('Metadata worker started');
    setMetadataWorkerRunning(true);

    // Backoff state for missing tokens
    let currentBackoff = MIN_BACKOFF_MS;
    let lastWarnTime = 0;

    while (true) {
        try {
            await waitForRateLimit();

            // Get a valid access token
            const user = await prisma.spotifyAuth.findFirst({
                where: { isValid: true },
                orderBy: { lastRefreshAt: 'desc' },
                select: { userId: true },
            });

            if (!user?.userId) {
                // Rate-limit warning logs to once per minute
                const now = Date.now();
                if (now - lastWarnTime >= WARN_LOG_INTERVAL_MS) {
                    log.warn(
                        { backoffMs: currentBackoff },
                        'No valid user tokens found for metadata worker. Waiting with backoff...'
                    );
                    lastWarnTime = now;
                }
                await new Promise((resolve) => setTimeout(resolve, currentBackoff));
                // Exponential backoff with cap
                currentBackoff = Math.min(currentBackoff * 2, MAX_BACKOFF_MS);
                continue;
            }

            // Reset backoff on successful token acquisition
            currentBackoff = MIN_BACKOFF_MS;

            const tokenResult = await getValidAccessToken(user.userId);
            if (!tokenResult) {
                log.warn('Failed to refresh token for metadata worker');
                await new Promise((resolve) => setTimeout(resolve, 5000));
                continue;
            }

            // Process both artists and tracks
            const artistsProcessed = await processArtists(tokenResult.accessToken);
            const tracksProcessed = await processTracks(tokenResult.accessToken);

            // If nothing to process, sleep before checking again
            if (artistsProcessed === 0 && tracksProcessed === 0) {
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }

        } catch (error) {
            log.error({ error }, 'Error in metadata worker');
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}

