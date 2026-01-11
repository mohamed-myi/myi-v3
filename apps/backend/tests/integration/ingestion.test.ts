import { prisma } from '../../src/lib/prisma';
import { insertListeningEvent } from '../../src/services/ingestion';
import { Source } from '@prisma/client';
import type { ParsedListeningEvent } from '../../src/types/ingestion';
import { createMockPrisma } from '../mocks/prisma.mock';

// Explicitly mock Prisma
jest.mock('../../src/lib/prisma', () => {
    const { createMockPrisma } = jest.requireActual('../mocks/prisma.mock');
    return {
        prisma: createMockPrisma(),
    };
});

// Mock partition setup to avoid raw SQL errors
jest.mock('../setup', () => ({
    ensurePartitionForDate: jest.fn().mockResolvedValue(undefined),
}));

let testTrackData: ParsedListeningEvent['track'];

const TEST_DATE_1 = new Date('2025-01-01T12:00:00Z');

// Helpers
const createTestEvent = (overrides: Partial<ParsedListeningEvent> = {}): ParsedListeningEvent => ({
    spotifyTrackId: 'test-track-id',
    playedAt: TEST_DATE_1,
    msPlayed: 180000,
    isEstimated: true,
    source: Source.API,
    track: testTrackData,
    ...overrides,
});

describe('Ingestion Service', () => {
    beforeAll(() => {
        testTrackData = {
            spotifyId: `test-track-id`,
            name: 'Test Track',
            durationMs: 180000,
            previewUrl: null,
            album: {
                spotifyId: 'album-id',
                name: 'Test Album',
                imageUrl: null,
                releaseDate: null,
            },
            artists: [
                {
                    spotifyId: 'artist-id',
                    name: 'Test Artist',
                },
            ],
        };
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mocks for dependency upserts (Album, Artist, Track)
        // Assume they exist or are created successfully
        (prisma.album.findUnique as jest.Mock).mockResolvedValue({ id: 'db-album-id' });
        (prisma.artist.findUnique as jest.Mock).mockResolvedValue({ id: 'db-artist-id' });

        // Track upsert mocks
        (prisma.track.findUnique as jest.Mock).mockResolvedValue({ id: 'db-track-id' });
        (prisma.track.update as jest.Mock).mockResolvedValue({ id: 'db-track-id' });

        // Transaction mock for inserting event + updating user stats
        (prisma.$transaction as jest.Mock).mockImplementation((args) => Promise.all(args));
    });

    test('inserts new record when not existing', async () => {
        // Mock: Record does NOT exist
        (prisma.listeningEvent.findUnique as jest.Mock).mockResolvedValue(null);
        (prisma.listeningEvent.create as jest.Mock).mockResolvedValue({ id: 'new-event-id' });

        const event = createTestEvent();
        const result = await insertListeningEvent('user-id', event);

        expect(result).toBe('added');
        expect(prisma.listeningEvent.create).toHaveBeenCalled();
    });

    test('skips duplicate API record if exists', async () => {
        // Mock: Record exists
        (prisma.listeningEvent.findUnique as jest.Mock).mockResolvedValue({
            isEstimated: true,
            source: Source.API,
        });

        const event = createTestEvent();
        const result = await insertListeningEvent('user-id', event);

        expect(result).toBe('skipped');
        expect(prisma.listeningEvent.create).not.toHaveBeenCalled();
    });

    test('import claims estimated record (update)', async () => {
        // Mock: Record exists and is estimated
        (prisma.listeningEvent.findUnique as jest.Mock).mockResolvedValue({
            isEstimated: true,
            source: Source.API, // was originally API
        });

        const importEvent = createTestEvent({
            isEstimated: false,
            source: Source.IMPORT,
            msPlayed: 45000,
        });

        const result = await insertListeningEvent('user-id', importEvent);

        expect(result).toBe('updated');
        expect(prisma.listeningEvent.update).toHaveBeenCalled();
    });

    test('import does not overwrite ground truth (existing import)', async () => {
        // Mock: Record exists and is NOT estimated
        (prisma.listeningEvent.findUnique as jest.Mock).mockResolvedValue({
            isEstimated: false,
            source: Source.IMPORT,
        });

        const secondImport = createTestEvent({
            source: Source.IMPORT,
        });

        const result = await insertListeningEvent('user-id', secondImport);

        expect(result).toBe('skipped');
        expect(prisma.listeningEvent.update).not.toHaveBeenCalled();
    });
});
