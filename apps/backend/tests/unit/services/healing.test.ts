
// Test services/healing.ts

// Mocks setup
process.env.REDIS_URL = 'redis://mock:6379';

const mockPrisma = {
    artist: {
        findMany: jest.fn(),
    },
    user: {
        findMany: jest.fn(),
    },
};

jest.mock('../../../src/lib/prisma', () => ({
    prisma: mockPrisma,
}));

jest.mock('../../../src/lib/redis', () => ({
    queueArtistForMetadata: jest.fn(),
}));

jest.mock('../../../src/workers/top-stats-queue', () => ({
    topStatsQueue: {
        addBulk: jest.fn(),
    },
}));

// Import after mocks
import { HealingService } from '../../../src/services/healing';
import { queueArtistForMetadata } from '../../../src/lib/redis';
import { topStatsQueue } from '../../../src/workers/top-stats-queue';

describe('HealingService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('healArtistMetadata', () => {
        it('queues artists with missing image url', async () => {
            mockPrisma.artist.findMany.mockResolvedValue([
                { spotifyId: 'artist-1' },
            ]);

            await HealingService.healArtistMetadata();

            expect(mockPrisma.artist.findMany).toHaveBeenCalledWith({
                where: { imageUrl: null },
                select: { spotifyId: true },
                take: 1000,
            });
            expect(queueArtistForMetadata).toHaveBeenCalledWith('artist-1');
        });
    });

    describe('healTopStats', () => {
        it('queues top stats refresh for eligible users', async () => {
            mockPrisma.user.findMany.mockResolvedValue([
                { id: 'user-1' },
            ]);

            await HealingService.healTopStats();

            expect(mockPrisma.user.findMany).toHaveBeenCalled();
            expect(topStatsQueue.addBulk).toHaveBeenCalledWith([
                expect.objectContaining({
                    name: 'heal-top-stats-user-1',
                    data: { userId: 'user-1', priority: 'high' },
                }),
            ]);
        });
    });

    describe('healAll', () => {
        it('calls all heal methods', async () => {
            const spyArtist = jest.spyOn(HealingService, 'healArtistMetadata').mockResolvedValue();
            const spyTopStats = jest.spyOn(HealingService, 'healTopStats').mockResolvedValue();

            await HealingService.healAll();

            expect(spyArtist).toHaveBeenCalled();
            expect(spyTopStats).toHaveBeenCalled();
        });
    });
});
