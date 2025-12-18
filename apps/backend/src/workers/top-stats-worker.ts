import { prisma } from '../lib/prisma';
import { getValidAccessToken } from '../lib/token-manager';
import { getTopTracks, getTopArtists, TimeRange } from '../lib/spotify-api';
import { upsertTrack, upsertArtist } from '../services/ingestion';
import { waitForRateLimit } from '../lib/redis';
import { workerLoggers } from '../lib/logger';
import { setTopStatsWorkerRunning } from './worker-status';

const log = workerLoggers.topStats;

const TERMS: TimeRange[] = ['short_term', 'medium_term', 'long_term'];

async function processUserTopStats(userId: string) {
    const tokenResult = await getValidAccessToken(userId);
    if (!tokenResult) {
        log.info({ userId }, 'Skipping top stats: No valid token');
        return;
    }
    const accessToken = tokenResult.accessToken;

    for (const term of TERMS) {
        await waitForRateLimit();

        // Top Tracks
        try {
            const topTracksRes = await getTopTracks(accessToken, term, 50);

            // Upsert each rank.

            for (let i = 0; i < topTracksRes.items.length; i++) {
                const spotifyTrack = topTracksRes.items[i];
                const rank = i + 1;

                // Adapt to Ingestion format
                const trackForIngest = {
                    spotifyId: spotifyTrack.id,
                    name: spotifyTrack.name,
                    durationMs: spotifyTrack.duration_ms,
                    previewUrl: spotifyTrack.preview_url,
                    album: {
                        spotifyId: spotifyTrack.album.id,
                        name: spotifyTrack.album.name,
                        imageUrl: spotifyTrack.album.images[0]?.url || null,
                        releaseDate: spotifyTrack.album.release_date,
                    },
                    artists: spotifyTrack.artists.map(a => ({ spotifyId: a.id, name: a.name })),
                };

                // Ensure Track exists
                const { trackId } = await upsertTrack(trackForIngest);

                // Store Top Rank
                await prisma.spotifyTopTrack.upsert({
                    where: {
                        userId_term_rank: { userId, term, rank }
                    },
                    create: {
                        userId,
                        term,
                        rank,
                        trackId
                    },
                    update: {
                        trackId
                    }
                });
            }
            // "limit" is 50, usually providing 50. If less, we should delete the extras.
            if (topTracksRes.items.length < 50) {
                await prisma.spotifyTopTrack.deleteMany({
                    where: {
                        userId,
                        term,
                        rank: { gt: topTracksRes.items.length }
                    }
                });
            }

        } catch (err) {
            log.error({ term, userId, error: err }, 'Error fetching top tracks');
        }

        await waitForRateLimit();

        // 2. Top Artists
        try {
            const topArtistsRes = await getTopArtists(accessToken, term, 50);

            for (let i = 0; i < topArtistsRes.items.length; i++) {
                const spotifyArtist = topArtistsRes.items[i];
                const rank = i + 1;

                const artistData = {
                    spotifyId: spotifyArtist.id,
                    name: spotifyArtist.name,
                    imageUrl: spotifyArtist.images[0]?.url,
                    genres: spotifyArtist.genres
                };

                const artistId = (await prisma.artist.upsert({
                    where: { spotifyId: artistData.spotifyId },
                    create: artistData,
                    update: {
                        imageUrl: artistData.imageUrl,
                        genres: artistData.genres
                    },
                    select: { id: true }
                })).id;

                await prisma.spotifyTopArtist.upsert({
                    where: {
                        userId_term_rank: { userId, term, rank }
                    },
                    create: {
                        userId,
                        term,
                        rank,
                        artistId
                    },
                    update: {
                        artistId
                    }
                });
            }
            if (topArtistsRes.items.length < 50) {
                await prisma.spotifyTopArtist.deleteMany({
                    where: {
                        userId,
                        term,
                        rank: { gt: topArtistsRes.items.length }
                    }
                });
            }

        } catch (err) {
            log.error({ term, userId, error: err }, 'Error fetching top artists');
        }
    }
}

export async function topStatsWorker() {
    log.info('Top stats worker started');
    setTopStatsWorkerRunning(true);

    // Hourly loop
    const ONE_HOUR_MS = 60 * 60 * 1000;

    while (true) {
        try {
            const start = Date.now();

            // Get all users with valid tokens
            // Ideally we'd stagger this or have a "next_sync_at" field.
            // For now, just grab everyone.
            const users = await prisma.spotifyAuth.findMany({
                where: { isValid: true },
                select: { userId: true }
            });

            log.info({ userCount: users.length }, 'Syncing top stats for users');

            for (const user of users) {
                try {
                    await processUserTopStats(user.userId);
                } catch (userError) {
                    log.error({ userId: user.userId, error: userError }, 'Error processing top stats for user');
                }
            }

            const elapsed = Date.now() - start;
            const sleepTime = Math.max(0, ONE_HOUR_MS - elapsed);

            log.info({ sleepMinutes: Math.round(sleepTime / 1000 / 60) }, 'Top stats sync complete');
            await new Promise(resolve => setTimeout(resolve, sleepTime));

        } catch (error) {
            log.error({ error }, 'Top stats worker crashed');
            await new Promise(resolve => setTimeout(resolve, 60000)); // Sleep 1 min on crash
        }
    }
}
