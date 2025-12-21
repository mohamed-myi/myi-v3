
// Test services/healing.ts

// Mocks setup
process.env.REDIS_URL = 'redis://mock:6379';

const mockPrisma = {
    track: {
        findMany: jest.fn(),
    },
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
    queueTrackForFeatures: jest.fn(),
    queueArtistForMetadata: jest.fn(),
}));

jest.mock('../../../src/workers/top-stats-queue', () => ({
    topStatsQueue: {
        addBulk: jest.fn(),
    },
}));

// Import after mocks
import { HealingService } from '../../../src/services/healing';
import { queueTrackForFeatures, queueArtistForMetadata } from '../../../src/lib/redis';
import { topStatsQueue } from '../../../src/workers/top-stats-queue';

describe('HealingService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('healAudioFeatures', () => {
        it('queues tracks with missing audio features', async () => {
            mockPrisma.track.findMany.mockResolvedValue([
                { spotifyId: 'track-1' },
                { spotifyId: 'track-2' },
            ]);

            await HealingService.healAudioFeatures();

            expect(mockPrisma.track.findMany).toHaveBeenCalledWith({
                where: { audioFeatures: null },
                select: { spotifyId: true },
                take: 1000,
            });
            expect(queueTrackForFeatures).toHaveBeenCalledTimes(2);
            expect(queueTrackForFeatures).toHaveBeenCalledWith('track-1');
            expect(queueTrackForFeatures).toHaveBeenCalledWith('track-2');
        });

        it('does nothing if no tracks found', async () => {
            mockPrisma.track.findMany.mockResolvedValue([]);

            await HealingService.healAudioFeatures();

            expect(queueTrackForFeatures).not.toHaveBeenCalled();
        });
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
            const spyFeatures = jest.spyOn(HealingService, 'healAudioFeatures').mockResolvedValue();
            const spyArtist = jest.spyOn(HealingService, 'healArtistMetadata').mockResolvedValue();
            const spyTopStats = jest.spyOn(HealingService, 'healTopStats').mockResolvedValue();

            await HealingService.healAll();

            expect(spyFeatures).toHaveBeenCalled();
            expect(spyArtist).toHaveBeenCalled();
            expect(spyTopStats).toHaveBeenCalled();
        });
    });
});
