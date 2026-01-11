import { prisma } from '../../src/lib/prisma';
import { checkStaleJobs } from '../../src/workers/playlist-worker';
import { workerLoggers } from '../../src/lib/logger';

// Mock prisma
jest.mock('../../src/lib/prisma', () => ({
    prisma: {
        playlistJob: {
            updateMany: jest.fn(),
        },
    },
}));

// Mock logger
jest.mock('../../src/lib/logger', () => ({
    workerLoggers: {
        playlist: {
            warn: jest.fn(),
            error: jest.fn(),
        },
    },
}));

describe('checkStaleJobs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('should mark jobs as FAILED if heartbeat is older than 5 minutes', async () => {
        const now = new Date('2024-01-01T12:00:00Z');
        jest.setSystemTime(now);

        const staleThreshold = new Date(now.getTime() - 5 * 60 * 1000);

        // Mock successful update
        (prisma.playlistJob.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

        await checkStaleJobs();

        expect(prisma.playlistJob.updateMany).toHaveBeenCalledWith({
            where: {
                status: { in: ['CREATING', 'ADDING_TRACKS', 'UPLOADING_IMAGE'] },
                lastHeartbeatAt: {
                    lt: staleThreshold,
                },
            },
            data: {
                status: 'FAILED',
                errorMessage: 'Job stalled (no heartbeat for 5 minutes)',
                completedAt: now,
            },
        });

        // Check that we logged the cleanup count
        expect(workerLoggers.playlist.warn).toHaveBeenCalledWith(
            { count: 2 },
            expect.stringContaining('Cleaned up stale')
        );
    });

    it('should handle database errors gracefully', async () => {
        (prisma.playlistJob.updateMany as jest.Mock).mockRejectedValue(new Error('DB Error'));

        await expect(checkStaleJobs()).resolves.not.toThrow();

        expect(workerLoggers.playlist.error).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.any(Error) }),
            expect.stringContaining('Failed to check stale jobs')
        );
    });
});
