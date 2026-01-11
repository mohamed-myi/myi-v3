// Mock everything
jest.mock('../../src/lib/prisma', () => ({
    prisma: {
        playlistJob: {
            findUnique: jest.fn(),
        },
        user: { findUnique: jest.fn() },
    },
}));

// Mock redis + bullmq to prevent real Redis connections during unit tests.
// playlist-worker imports playlist-queue which constructs a BullMQ Queue at module load.
jest.mock('../../src/lib/redis', () => ({
    getRedisUrl: jest.fn().mockReturnValue('redis://mock:6379'),
    REDIS_CONNECTION_CONFIG: {},
    redis: {},
}));

jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: jest.fn(),
        getJob: jest.fn(),
        pause: jest.fn(),
        resume: jest.fn(),
        close: jest.fn(),
    })),
    Worker: jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        close: jest.fn(),
    })),
    UnrecoverableError: class UnrecoverableError extends Error { },
}));

jest.mock('../../src/services/playlist-service', () => ({
    resolveShuffleTracks: jest.fn(),
    resolveTop50Tracks: jest.fn(),
    resolveAllTimeTop50Tracks: jest.fn(),
    resolveRecentTracks: jest.fn(),
}));

import { prisma } from '../../src/lib/prisma';
import { resolveTrackUris } from '../../src/workers/playlist-worker';
import * as playlistService from '../../src/services/playlist-service';

describe('resolveTrackUris Refactor', () => {
    const jobId = 'test-job-id';
    const userId = 'test-user-id';
    const accessToken = 'test-token';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should call resolveShuffleTracks for SHUFFLE method', async () => {
        (prisma.playlistJob.findUnique as jest.Mock).mockResolvedValue({
            id: jobId,
            creationMethod: 'SHUFFLE',
            sourcePlaylistId: 'source-id',
            shuffleMode: 'TRULY_RANDOM',
        });
        (playlistService.resolveShuffleTracks as jest.Mock).mockResolvedValue(['uri1']);

        await resolveTrackUris(jobId, userId, accessToken);

        expect(playlistService.resolveShuffleTracks).toHaveBeenCalledWith(accessToken, 'source-id');
    });

    it('should call resolveTop50Tracks for TOP_50_SHORT', async () => {
        (prisma.playlistJob.findUnique as jest.Mock).mockResolvedValue({
            id: jobId,
            creationMethod: 'TOP_50_SHORT',
        });
        (playlistService.resolveTop50Tracks as jest.Mock).mockResolvedValue(['uri1']);

        await resolveTrackUris(jobId, userId, accessToken);

        expect(playlistService.resolveTop50Tracks).toHaveBeenCalledWith(userId, 'TOP_50_SHORT');
    });

    it('should call resolveAllTimeTop50Tracks for TOP_50_ALL_TIME', async () => {
        (prisma.playlistJob.findUnique as jest.Mock).mockResolvedValue({
            id: jobId,
            creationMethod: 'TOP_50_ALL_TIME',
        });
        (playlistService.resolveAllTimeTop50Tracks as jest.Mock).mockResolvedValue(['uri1']);

        await resolveTrackUris(jobId, userId, accessToken);

        expect(playlistService.resolveAllTimeTop50Tracks).toHaveBeenCalledWith(userId);
    });

    it('should call resolveRecentTracks for TOP_K_RECENT', async () => {
        const kValue = 50;
        const startDate = new Date();
        const endDate = new Date();

        (prisma.playlistJob.findUnique as jest.Mock).mockResolvedValue({
            id: jobId,
            creationMethod: 'TOP_K_RECENT',
            kValue,
            startDate,
            endDate,
        });
        (playlistService.resolveRecentTracks as jest.Mock).mockResolvedValue(['uri1']);

        await resolveTrackUris(jobId, userId, accessToken);

        expect(playlistService.resolveRecentTracks).toHaveBeenCalledWith(userId, kValue, startDate, endDate);
    });
});
