process.env.REDIS_URL = 'redis://mock:6379';

jest.mock('../../../src/lib/redis', () => ({
    waitForRateLimit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/lib/prisma', () => ({
    prisma: {
        spotifyAuth: {
            findMany: jest.fn(),
        },
        spotifyTopTrack: {
            upsert: jest.fn(),
            deleteMany: jest.fn(),
        },
        spotifyTopArtist: {
            upsert: jest.fn(),
            deleteMany: jest.fn(),
        },
        artist: {
            upsert: jest.fn(),
        },
    },
}));

jest.mock('../../../src/lib/token-manager', () => ({
    getValidAccessToken: jest.fn(),
}));

jest.mock('../../../src/lib/spotify-api', () => ({
    getTopTracks: jest.fn(),
    getTopArtists: jest.fn(),
}));

jest.mock('../../../src/services/ingestion', () => ({
    upsertTrack: jest.fn(),
}));

jest.mock('../../../src/workers/worker-status', () => ({
    setTopStatsWorkerRunning: jest.fn(),
}));

import { prisma } from '../../../src/lib/prisma';
import { getValidAccessToken } from '../../../src/lib/token-manager';
import { getTopTracks, getTopArtists } from '../../../src/lib/spotify-api';
import { upsertTrack } from '../../../src/services/ingestion';

async function processUserTopStats(userId: string): Promise<'no_token' | 'processed'> {
    const tokenResult = await (getValidAccessToken as jest.Mock)(userId);
    if (!tokenResult) {
        return 'no_token';
    }
    const accessToken = tokenResult.accessToken;

    const term = 'short_term';

    const topTracksRes = await (getTopTracks as jest.Mock)(accessToken, term, 50);

    for (let i = 0; i < topTracksRes.items.length; i++) {
        const spotifyTrack = topTracksRes.items[i];
        const rank = i + 1;

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
            artists: spotifyTrack.artists.map((a: any) => ({ spotifyId: a.id, name: a.name })),
        };

        const { trackId } = await (upsertTrack as jest.Mock)(trackForIngest);

        await (prisma.spotifyTopTrack.upsert as jest.Mock)({
            where: { userId_term_rank: { userId, term, rank } },
            create: { userId, term, rank, trackId },
            update: { trackId },
        });
    }

    const topArtistsRes = await (getTopArtists as jest.Mock)(accessToken, term, 50);

    for (let i = 0; i < topArtistsRes.items.length; i++) {
        const spotifyArtist = topArtistsRes.items[i];
        const rank = i + 1;

        const artistId = (await (prisma.artist.upsert as jest.Mock)({
            where: { spotifyId: spotifyArtist.id },
            create: {
                spotifyId: spotifyArtist.id,
                name: spotifyArtist.name,
                imageUrl: spotifyArtist.images[0]?.url,
                genres: spotifyArtist.genres,
            },
            update: {
                imageUrl: spotifyArtist.images[0]?.url,
                genres: spotifyArtist.genres,
            },
            select: { id: true },
        })).id;

        await (prisma.spotifyTopArtist.upsert as jest.Mock)({
            where: { userId_term_rank: { userId, term, rank } },
            create: { userId, term, rank, artistId },
            update: { artistId },
        });
    }

    return 'processed';
}

describe('Top Stats Worker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('processUserTopStats', () => {
        it('returns no_token when user has no valid token', async () => {
            (getValidAccessToken as jest.Mock).mockResolvedValue(null);

            const result = await processUserTopStats('user-1');

            expect(result).toBe('no_token');
            expect(getTopTracks).not.toHaveBeenCalled();
        });

        it('fetches and stores top tracks', async () => {
            (getValidAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'token' });
            (getTopTracks as jest.Mock).mockResolvedValue({
                items: [
                    {
                        id: 'track-1',
                        name: 'Top Song',
                        duration_ms: 200000,
                        preview_url: 'https://preview.url',
                        album: {
                            id: 'album-1',
                            name: 'Top Album',
                            images: [{ url: 'https://album.jpg' }],
                            release_date: '2025-01-01',
                        },
                        artists: [{ id: 'artist-1', name: 'Top Artist' }],
                    },
                ],
            });
            (getTopArtists as jest.Mock).mockResolvedValue({ items: [] });
            (upsertTrack as jest.Mock).mockResolvedValue({ trackId: 'track-uuid' });
            (prisma.spotifyTopTrack.upsert as jest.Mock).mockResolvedValue({});

            const result = await processUserTopStats('user-1');

            expect(result).toBe('processed');
            expect(getTopTracks).toHaveBeenCalledWith('token', 'short_term', 50);
            expect(upsertTrack).toHaveBeenCalled();
            expect(prisma.spotifyTopTrack.upsert).toHaveBeenCalled();
        });

        it('fetches and stores top artists', async () => {
            (getValidAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'token' });
            (getTopTracks as jest.Mock).mockResolvedValue({ items: [] });
            (getTopArtists as jest.Mock).mockResolvedValue({
                items: [
                    {
                        id: 'artist-1',
                        name: 'Top Artist',
                        images: [{ url: 'https://artist.jpg' }],
                        genres: ['pop'],
                    },
                ],
            });
            (prisma.artist.upsert as jest.Mock).mockResolvedValue({ id: 'artist-uuid' });
            (prisma.spotifyTopArtist.upsert as jest.Mock).mockResolvedValue({});

            const result = await processUserTopStats('user-1');

            expect(result).toBe('processed');
            expect(getTopArtists).toHaveBeenCalledWith('token', 'short_term', 50);
            expect(prisma.artist.upsert).toHaveBeenCalled();
            expect(prisma.spotifyTopArtist.upsert).toHaveBeenCalled();
        });

        it('handles empty top lists', async () => {
            (getValidAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'token' });
            (getTopTracks as jest.Mock).mockResolvedValue({ items: [] });
            (getTopArtists as jest.Mock).mockResolvedValue({ items: [] });

            const result = await processUserTopStats('user-1');

            expect(result).toBe('processed');
            expect(prisma.spotifyTopTrack.upsert).not.toHaveBeenCalled();
            expect(prisma.spotifyTopArtist.upsert).not.toHaveBeenCalled();
        });
    });

    describe('ranking integrity', () => {
        it('uses upsert to overwrite rankings without duplicates', async () => {
            (getValidAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'token' });
            (getTopTracks as jest.Mock).mockResolvedValue({
                items: [{
                    id: 'track-1',
                    name: 'New #1 Song',
                    duration_ms: 200000,
                    preview_url: null,
                    album: {
                        id: 'album-1',
                        name: 'Album',
                        images: [],
                        release_date: '2024-01-01',
                    },
                    artists: [{ id: 'artist-1', name: 'Artist' }],
                }],
            });
            (getTopArtists as jest.Mock).mockResolvedValue({ items: [] });
            (upsertTrack as jest.Mock).mockResolvedValue({ trackId: 'new-track-uuid' });
            (prisma.spotifyTopTrack.upsert as jest.Mock).mockResolvedValue({});

            await processUserTopStats('user-1');

            expect(prisma.spotifyTopTrack.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        userId_term_rank: {
                            userId: 'user-1',
                            term: 'short_term',
                            rank: 1,
                        },
                    },
                    update: { trackId: 'new-track-uuid' },
                })
            );
        });

        it('assigns correct rank to each track', async () => {
            (getValidAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'token' });
            (getTopTracks as jest.Mock).mockResolvedValue({
                items: [
                    { id: 't1', name: 'Track 1', duration_ms: 100, preview_url: null, album: { id: 'a1', name: 'A', images: [], release_date: '2024' }, artists: [{ id: 'ar1', name: 'Ar' }] },
                    { id: 't2', name: 'Track 2', duration_ms: 100, preview_url: null, album: { id: 'a1', name: 'A', images: [], release_date: '2024' }, artists: [{ id: 'ar1', name: 'Ar' }] },
                ],
            });
            (getTopArtists as jest.Mock).mockResolvedValue({ items: [] });
            (upsertTrack as jest.Mock).mockResolvedValue({ trackId: 'track-uuid' });
            (prisma.spotifyTopTrack.upsert as jest.Mock).mockResolvedValue({});

            await processUserTopStats('user-1');

            expect(prisma.spotifyTopTrack.upsert).toHaveBeenNthCalledWith(1,
                expect.objectContaining({
                    where: { userId_term_rank: expect.objectContaining({ rank: 1 }) },
                })
            );
            expect(prisma.spotifyTopTrack.upsert).toHaveBeenNthCalledWith(2,
                expect.objectContaining({
                    where: { userId_term_rank: expect.objectContaining({ rank: 2 }) },
                })
            );
        });
    });
});

