import { popArtistsForMetadata, queueArtistForMetadata, waitForRateLimit, checkRateLimit } from '../lib/redis';
import { getValidAccessToken } from '../lib/token-manager';
import { getArtistsBatch } from '../lib/spotify-api';
import { prisma } from '../lib/prisma';
import { workerLoggers } from '../lib/logger';
import { setMetadataWorkerRunning } from './worker-status';

const log = workerLoggers.metadata;

export async function metadataWorker() {
    log.info('Metadata worker started');
    setMetadataWorkerRunning(true);

    while (true) {
        try {
            await waitForRateLimit();

            const artistIds = await popArtistsForMetadata(50);
            if (artistIds.length === 0) {
                await new Promise((resolve) => setTimeout(resolve, 5000));
                continue;
            }

            const user = await prisma.spotifyAuth.findFirst({
                where: { isValid: true },
                orderBy: { lastRefreshAt: 'desc' },
                select: { userId: true },
            });

            if (!user) {
                log.warn('No valid user tokens found for metadata worker. Retrying...');
                for (const id of artistIds) {
                    await queueArtistForMetadata(id);
                }
                await new Promise((resolve) => setTimeout(resolve, 10000));
                continue;
            }

            if (!user.userId) { throw new Error("User ID missing"); }
            const tokenResult = await getValidAccessToken(user.userId);

            if (!tokenResult) {
                log.warn('Failed to refresh token for metadata worker');
                continue;
            }

            const artists = await getArtistsBatch(tokenResult.accessToken, artistIds);

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

            log.info({ count: artists.length }, 'Processed metadata for artists');

        } catch (error) {
            log.error({ error }, 'Error in metadata worker');
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
}
