process.env.REDIS_URL = 'redis://mock:6379';

jest.mock('../../../src/lib/redis', () => ({
    redis: {},
    queueArtistForMetadata: jest.fn(),
    queueTrackForFeatures: jest.fn(),
}));

const mockPrisma = {
    album: {
        findMany: jest.fn(),
        createMany: jest.fn(),
    },
    artist: {
        findMany: jest.fn(),
        createMany: jest.fn(),
    },
    track: {
        findMany: jest.fn(),
        createMany: jest.fn(),
    },
    trackArtist: {
        createMany: jest.fn(),
    },
    listeningEvent: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
    },
    user: {
        update: jest.fn(),
    },
    $transaction: jest.fn(),
};

jest.mock('../../../src/lib/prisma', () => ({
    prisma: mockPrisma,
}));

import { insertListeningEvents, insertListeningEventsWithIds } from '../../../src/services/ingestion';
import { queueArtistForMetadata } from '../../../src/lib/redis';
import { Source } from '@prisma/client';
import type { ParsedListeningEvent } from '../../../src/types/ingestion';

describe('services/ingestion', () => {
    const createTestEvent = (overrides: Partial<ParsedListeningEvent> = {}): ParsedListeningEvent => ({
        spotifyTrackId: 'spotify:track:test123',
        playedAt: new Date('2025-01-01T12:00:00Z'),
        msPlayed: 180000,
        isEstimated: true,
        source: Source.API,
        track: {
            spotifyId: 'test123',
            name: 'Test Track',
            durationMs: 180000,
            previewUrl: null,
            album: {
                spotifyId: 'album123',
                name: 'Test Album',
                imageUrl: 'https://example.com/album.jpg',
                releaseDate: '2025-01-01',
            },
            artists: [
                { spotifyId: 'artist123', name: 'Test Artist' },
            ],
        },
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();

        mockPrisma.album.createMany.mockResolvedValue({ count: 0 });
        mockPrisma.album.findMany.mockResolvedValue([{ id: 'album-uuid', spotifyId: 'album123' }]);
        mockPrisma.artist.createMany.mockResolvedValue({ count: 0 });
        mockPrisma.artist.findMany.mockResolvedValue([{ id: 'artist-uuid', spotifyId: 'artist123', imageUrl: null }]);
        mockPrisma.track.createMany.mockResolvedValue({ count: 0 });
        mockPrisma.track.findMany.mockResolvedValue([{ id: 'track-uuid', spotifyId: 'test123' }]);
        mockPrisma.trackArtist.createMany.mockResolvedValue({ count: 0 });
        mockPrisma.listeningEvent.findMany.mockResolvedValue([]);
        mockPrisma.listeningEvent.createMany.mockResolvedValue({ count: 0 });

        mockPrisma.$transaction.mockImplementation(async (arg: any) => {
            if (typeof arg === 'function') return arg(mockPrisma);
            return Promise.all(arg);
        });
    });

    describe('insertListeningEventsWithIds', () => {
        it('inserts new event and returns added status', async () => {
            const event = createTestEvent();
            const { summary, results } = await insertListeningEventsWithIds('user-123', [event]);

            expect(summary.added).toBe(1);
            expect(results[0].status).toBe('added');
            expect(results[0].trackId).toBe('track-uuid');
        });

        it('skips duplicate API events', async () => {
            mockPrisma.listeningEvent.findMany.mockResolvedValue([
                { trackId: 'track-uuid', playedAt: new Date('2025-01-01T12:00:00Z'), isEstimated: false, source: Source.API },
            ]);

            const event = createTestEvent({ source: Source.API });
            const { summary } = await insertListeningEventsWithIds('user-123', [event]);

            expect(summary.skipped).toBe(1);
            expect(summary.added).toBe(0);
        });

        it('updates estimated event when import arrives', async () => {
            mockPrisma.listeningEvent.findMany.mockResolvedValue([
                { trackId: 'track-uuid', playedAt: new Date('2025-01-01T12:00:00Z'), isEstimated: true, source: Source.API },
            ]);

            const event = createTestEvent({ source: Source.IMPORT, isEstimated: false, msPlayed: 195000 });
            const { summary } = await insertListeningEventsWithIds('user-123', [event]);

            expect(summary.updated).toBe(1);
            expect(mockPrisma.listeningEvent.update).toHaveBeenCalled();
        });

        it('processes multiple events in single batch', async () => {
            const events = [
                createTestEvent({ playedAt: new Date('2025-01-01T12:00:00Z') }),
                createTestEvent({ playedAt: new Date('2025-01-01T13:00:00Z') }),
            ];

            const { summary } = await insertListeningEventsWithIds('user-123', events);

            expect(summary.added).toBe(2);
            expect(mockPrisma.listeningEvent.createMany).toHaveBeenCalledTimes(1);
        });

        it('uses transaction for atomicity', async () => {
            const events = [createTestEvent()];
            await insertListeningEventsWithIds('user-123', events);

            expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
            expect(typeof mockPrisma.$transaction.mock.calls[0][0]).toBe('function');
        });

        it('handles bulk failure atomically', async () => {
            mockPrisma.album.createMany.mockRejectedValueOnce(new Error('DB error'));

            const events = [createTestEvent(), createTestEvent({ playedAt: new Date('2025-01-01T13:00:00Z') })];
            const { summary, results } = await insertListeningEventsWithIds('user-123', events);

            expect(summary.errors).toBe(2);
            expect(summary.added).toBe(0);
            expect(results).toHaveLength(0);
        });

        it('updates user stats in transaction', async () => {
            const events = [
                createTestEvent({ msPlayed: 180000 }),
                createTestEvent({ playedAt: new Date('2025-01-01T13:00:00Z'), msPlayed: 240000 }),
            ];

            await insertListeningEventsWithIds('user-123', events);

            expect(mockPrisma.user.update).toHaveBeenCalledWith({
                where: { id: 'user-123' },
                data: {
                    totalPlayCount: { increment: 2 },
                    totalListeningMs: { increment: 420000 },
                },
            });
        });

        it('returns empty results for empty input', async () => {
            const { summary, results } = await insertListeningEventsWithIds('user-123', []);

            expect(summary).toEqual({ added: 0, skipped: 0, updated: 0, errors: 0 });
            expect(results).toHaveLength(0);
        });
    });

    describe('insertListeningEvents', () => {
        it('returns summary only', async () => {
            const events = [createTestEvent()];
            const summary = await insertListeningEvents('user-123', events);

            expect(summary.added).toBe(1);
            expect(typeof summary).toBe('object');
            expect('results' in summary).toBe(false);
        });
    });

    describe('bulk catalog operations', () => {
        it('creates albums with createMany', async () => {
            const events = [createTestEvent()];
            await insertListeningEventsWithIds('user-123', events);

            expect(mockPrisma.album.createMany).toHaveBeenCalledWith({
                data: [{ spotifyId: 'album123', name: 'Test Album', imageUrl: 'https://example.com/album.jpg', releaseDate: '2025-01-01' }],
                skipDuplicates: true,
            });
        });

        it('creates artists with createMany', async () => {
            const events = [createTestEvent()];
            await insertListeningEventsWithIds('user-123', events);

            expect(mockPrisma.artist.createMany).toHaveBeenCalledWith({
                data: [{ spotifyId: 'artist123', name: 'Test Artist' }],
                skipDuplicates: true,
            });
        });

        it('queues artists without imageUrl for metadata', async () => {
            mockPrisma.artist.findMany.mockResolvedValue([{ id: 'artist-uuid', spotifyId: 'artist123', imageUrl: null }]);

            const events = [createTestEvent()];
            await insertListeningEventsWithIds('user-123', events);

            expect(queueArtistForMetadata).toHaveBeenCalledWith('artist123');
        });

        it('does not queue artists with imageUrl', async () => {
            mockPrisma.artist.findMany.mockResolvedValue([{ id: 'artist-uuid', spotifyId: 'artist123', imageUrl: 'https://example.com' }]);

            const events = [createTestEvent()];
            await insertListeningEventsWithIds('user-123', events);

            expect(queueArtistForMetadata).not.toHaveBeenCalled();
        });

        it('creates track-artist relationships', async () => {
            const events = [createTestEvent()];
            await insertListeningEventsWithIds('user-123', events);

            expect(mockPrisma.trackArtist.createMany).toHaveBeenCalledWith({
                data: [{ trackId: 'track-uuid', artistId: 'artist-uuid' }],
                skipDuplicates: true,
            });
        });

        it('deduplicates entities across events', async () => {
            const events = [
                createTestEvent({ playedAt: new Date('2025-01-01T12:00:00Z') }),
                createTestEvent({ playedAt: new Date('2025-01-01T13:00:00Z') }),
            ];

            await insertListeningEventsWithIds('user-123', events);

            // Same album/artist/track should only be created once
            expect(mockPrisma.album.createMany).toHaveBeenCalledTimes(1);
            expect(mockPrisma.artist.createMany).toHaveBeenCalledTimes(1);
            expect(mockPrisma.track.createMany).toHaveBeenCalledTimes(1);
        });
    });
});
