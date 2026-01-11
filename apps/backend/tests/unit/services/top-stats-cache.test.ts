// Top stats cache tests - testing isCacheFresh and ensureTopTracksCached
// These functions ensure cache freshness for TOP_50 playlist creation

// Note: Since ensureTopTracksCached calls processUserTopStats which has complex
// dependencies, we test the pure functions directly and mock at the prisma level.

beforeAll(() => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

const mockPrisma = {
    user: {
        findUnique: jest.fn(),
        update: jest.fn(),
    },
    spotifyTopTrack: {
        count: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
    },
    spotifyTopArtist: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
    },
    artist: {
        createMany: jest.fn(),
        findMany: jest.fn(),
    },
    album: {
        createMany: jest.fn(),
        findMany: jest.fn(),
    },
    track: {
        createMany: jest.fn(),
        findMany: jest.fn(),
    },
    trackArtist: {
        createMany: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockPrisma)),
    $executeRaw: jest.fn(),
};

jest.mock('../../../src/lib/prisma', () => ({
    prisma: mockPrisma,
}));

jest.mock('../../../src/lib/logger', () => ({
    workerLoggers: {
        topStats: {
            info: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
        },
    },
}));

jest.mock('../../../src/workers/top-stats-queue', () => ({
    topStatsQueue: {
        add: jest.fn(),
    },
}));

jest.mock('../../../src/lib/token-manager', () => ({
    getValidAccessToken: jest.fn(),
    resetTokenFailures: jest.fn(),
}));

jest.mock('../../../src/lib/spotify-api', () => ({
    getTopTracks: jest.fn(),
    getTopArtists: jest.fn(),
}));

import {
    isCacheFresh,
    CACHE_MAX_AGE_MS,
} from '../../../src/services/top-stats-service';

describe('TopStatsCache', () => {
    const userId = 'user-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('isCacheFresh', () => {
        it('returns true if topStatsRefreshedAt within max age', async () => {
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
            mockPrisma.user.findUnique.mockResolvedValue({
                topStatsRefreshedAt: thirtyMinutesAgo,
            });

            const result = await isCacheFresh(userId);

            expect(result).toBe(true);
        });

        it('returns false if topStatsRefreshedAt older than max age', async () => {
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            mockPrisma.user.findUnique.mockResolvedValue({
                topStatsRefreshedAt: twoHoursAgo,
            });

            const result = await isCacheFresh(userId);

            expect(result).toBe(false);
        });

        it('returns false if topStatsRefreshedAt is null', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                topStatsRefreshedAt: null,
            });

            const result = await isCacheFresh(userId);

            expect(result).toBe(false);
        });

        it('returns false if user not found', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const result = await isCacheFresh(userId);

            expect(result).toBe(false);
        });
    });

    describe('CACHE_MAX_AGE_MS', () => {
        it('is set to 1 hour', () => {
            expect(CACHE_MAX_AGE_MS).toBe(60 * 60 * 1000);
        });
    });
});
