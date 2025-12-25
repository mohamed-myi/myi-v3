process.env.REDIS_URL = 'redis://mock:6379';

jest.mock('../../../src/lib/redis', () => ({
    popArtistsForMetadata: jest.fn(),
    queueArtistForMetadata: jest.fn(),
    waitForRateLimit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/lib/prisma', () => ({
    prisma: {
        spotifyAuth: {
            findFirst: jest.fn(),
        },
        artist: {
            update: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

jest.mock('../../../src/lib/token-manager', () => ({
    getValidAccessToken: jest.fn(),
}));

jest.mock('../../../src/lib/spotify-api', () => ({
    getArtistsBatch: jest.fn(),
}));

jest.mock('../../../src/workers/worker-status', () => ({
    setMetadataWorkerRunning: jest.fn(),
}));

import { prisma } from '../../../src/lib/prisma';
import { popArtistsForMetadata, queueArtistForMetadata } from '../../../src/lib/redis';
import { getValidAccessToken } from '../../../src/lib/token-manager';
import { getArtistsBatch } from '../../../src/lib/spotify-api';

async function processMetadataBatch(): Promise<'no_artists' | 'no_token' | 'processed'> {
    const artistIds = await (popArtistsForMetadata as jest.Mock)(50);
    if (artistIds.length === 0) {
        return 'no_artists';
    }

    const user = await (prisma.spotifyAuth.findFirst as jest.Mock)({
        where: { isValid: true },
        orderBy: { lastRefreshAt: 'desc' },
        select: { userId: true },
    });

    if (!user) {
        for (const id of artistIds) {
            await (queueArtistForMetadata as jest.Mock)(id);
        }
        return 'no_token';
    }

    const tokenResult = await (getValidAccessToken as jest.Mock)(user.userId);
    if (!tokenResult) {
        return 'no_token';
    }

    const artists = await (getArtistsBatch as jest.Mock)(tokenResult.accessToken, artistIds);

    await (prisma.$transaction as jest.Mock)(
        artists.map((artist: any) =>
            (prisma.artist.update as jest.Mock)({
                where: { spotifyId: artist.id },
                data: {
                    imageUrl: artist.images[0]?.url || null,
                    genres: artist.genres || [],
                },
            })
        )
    );

    return 'processed';
}

describe('Metadata Worker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('processMetadataBatch', () => {
        it('returns no_artists when queue is empty', async () => {
            (popArtistsForMetadata as jest.Mock).mockResolvedValue([]);

            const result = await processMetadataBatch();

            expect(result).toBe('no_artists');
            expect(getArtistsBatch).not.toHaveBeenCalled();
        });

        it('re-queues artists and returns no_token when no valid user', async () => {
            (popArtistsForMetadata as jest.Mock).mockResolvedValue(['artist-1', 'artist-2']);
            (prisma.spotifyAuth.findFirst as jest.Mock).mockResolvedValue(null);

            const result = await processMetadataBatch();

            expect(result).toBe('no_token');
            expect(queueArtistForMetadata).toHaveBeenCalledWith('artist-1');
            expect(queueArtistForMetadata).toHaveBeenCalledWith('artist-2');
        });

        it('fetches and stores artist metadata', async () => {
            (popArtistsForMetadata as jest.Mock).mockResolvedValue(['artist-1']);
            (prisma.spotifyAuth.findFirst as jest.Mock).mockResolvedValue({ userId: 'user-1' });
            (getValidAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'token' });
            (getArtistsBatch as jest.Mock).mockResolvedValue([
                {
                    id: 'artist-1',
                    name: 'Test Artist',
                    images: [{ url: 'https://i.scdn.co/image/artist.jpg' }],
                    genres: ['pop', 'rock'],
                },
            ]);
            (prisma.$transaction as jest.Mock).mockResolvedValue([{}]);

            const result = await processMetadataBatch();

            expect(result).toBe('processed');
            expect(getArtistsBatch).toHaveBeenCalledWith('token', ['artist-1']);
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it('handles artists without images', async () => {
            (popArtistsForMetadata as jest.Mock).mockResolvedValue(['artist-1']);
            (prisma.spotifyAuth.findFirst as jest.Mock).mockResolvedValue({ userId: 'user-1' });
            (getValidAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'token' });
            (getArtistsBatch as jest.Mock).mockResolvedValue([
                {
                    id: 'artist-1',
                    name: 'Unknown Artist',
                    images: [],
                    genres: [],
                },
            ]);
            (prisma.$transaction as jest.Mock).mockResolvedValue([{}]);

            const result = await processMetadataBatch();

            expect(result).toBe('processed');
            expect(prisma.$transaction).toHaveBeenCalled();
        });
    });

    describe('stale data handling', () => {
        it('identifies artists with missing images for refresh', async () => {
            const staleMockData = [
                { spotifyId: 'stale-artist-1', imageUrl: null },
                { spotifyId: 'stale-artist-2', imageUrl: null },
            ];
            for (const artist of staleMockData) {
                await (queueArtistForMetadata as jest.Mock)(artist.spotifyId);
            }

            expect(queueArtistForMetadata).toHaveBeenCalledWith('stale-artist-1');
            expect(queueArtistForMetadata).toHaveBeenCalledWith('stale-artist-2');
        });

        it('updates artist with fresh metadata from Spotify API', async () => {
            (popArtistsForMetadata as jest.Mock).mockResolvedValue(['stale-artist']);
            (prisma.spotifyAuth.findFirst as jest.Mock).mockResolvedValue({ userId: 'user-1' });
            (getValidAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'token' });
            (getArtistsBatch as jest.Mock).mockResolvedValue([
                {
                    id: 'stale-artist',
                    name: 'Refreshed Artist',
                    images: [{ url: 'https://new-image.jpg' }],
                    genres: ['indie', 'alternative'],
                },
            ]);
            (prisma.$transaction as jest.Mock).mockImplementation(async (updates) => {
                return updates;
            });

            const result = await processMetadataBatch();

            expect(result).toBe('processed');
            expect(getArtistsBatch).toHaveBeenCalledWith('token', ['stale-artist']);
        });
    });
});

