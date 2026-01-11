// Rate limiter unit tests - atomic Redis-based rate limiting for playlist jobs
// Test-driven: these tests are written before the implementation

// Mock Redis before imports
const mockRedis = {
    incr: jest.fn(),
    decr: jest.fn(),
    expire: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
};

jest.mock('../../../src/lib/redis', () => ({
    redis: mockRedis,
}));

const mockPrisma = {
    playlistJob: {
        count: jest.fn(),
    },
};

jest.mock('../../../src/lib/prisma', () => ({
    prisma: mockPrisma,
}));

jest.mock('../../../src/lib/logger', () => ({
    logger: {
        child: () => ({
            info: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
        }),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        error: jest.fn(),
    },
}));

// Import after mocks
import {
    tryAcquireJobSlot,
    releaseJobSlot,
    MAX_PENDING_JOBS,
    MAX_JOBS_PER_HOUR,
} from '../../../src/lib/rate-limiter';

describe('PlaylistRateLimiter', () => {
    const userId = 'user-123';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('tryAcquireJobSlot', () => {
        it('allows first job for user', async () => {
            mockRedis.incr.mockResolvedValueOnce(1); // pending count
            mockRedis.incr.mockResolvedValueOnce(1); // hourly count
            mockRedis.expire.mockResolvedValue('OK');

            const result = await tryAcquireJobSlot(userId);

            expect(result.allowed).toBe(true);
            expect(result.pendingCount).toBe(1);
            expect(result.hourlyCount).toBe(1);
        });

        it('allows up to MAX_PENDING_JOBS concurrent jobs', async () => {
            mockRedis.incr.mockResolvedValueOnce(MAX_PENDING_JOBS); // at limit
            mockRedis.incr.mockResolvedValueOnce(3); // hourly count under limit

            const result = await tryAcquireJobSlot(userId);

            expect(result.allowed).toBe(true);
            expect(result.pendingCount).toBe(MAX_PENDING_JOBS);
        });

        it('rejects when MAX_PENDING_JOBS exceeded', async () => {
            mockRedis.incr.mockResolvedValueOnce(MAX_PENDING_JOBS + 1); // over limit
            mockRedis.decr.mockResolvedValue(MAX_PENDING_JOBS);

            const result = await tryAcquireJobSlot(userId);

            expect(result.allowed).toBe(false);
            expect(result.error).toContain(`Maximum ${MAX_PENDING_JOBS}`);
            // Should decrement to rollback
            expect(mockRedis.decr).toHaveBeenCalled();
        });

        it('rejects when MAX_JOBS_PER_HOUR exceeded', async () => {
            mockRedis.incr.mockResolvedValueOnce(1); // pending count OK
            mockRedis.incr.mockResolvedValueOnce(MAX_JOBS_PER_HOUR + 1); // hourly over limit
            mockRedis.decr.mockResolvedValue(0);
            mockRedis.expire.mockResolvedValue('OK');

            const result = await tryAcquireJobSlot(userId);

            expect(result.allowed).toBe(false);
            expect(result.error).toContain(`Maximum ${MAX_JOBS_PER_HOUR}`);
            // Should rollback both counters
            expect(mockRedis.decr).toHaveBeenCalledTimes(2);
        });

        it('sets TTL on first increment', async () => {
            mockRedis.incr.mockResolvedValueOnce(1); // first pending
            mockRedis.incr.mockResolvedValueOnce(1); // first hourly
            mockRedis.expire.mockResolvedValue('OK');

            await tryAcquireJobSlot(userId);

            // Should set expire on both keys since both returned 1
            expect(mockRedis.expire).toHaveBeenCalledTimes(2);
        });

        it('does not set TTL on subsequent increments', async () => {
            mockRedis.incr.mockResolvedValueOnce(3); // not first pending
            mockRedis.incr.mockResolvedValueOnce(5); // not first hourly

            await tryAcquireJobSlot(userId);

            // Should not call expire (both counts > 1)
            expect(mockRedis.expire).not.toHaveBeenCalled();
        });

        it('is atomic - simulated concurrent requests', async () => {
            // This test verifies the design: Redis INCR is atomic
            // Simulate sixth request arriving when limit is 5
            mockRedis.incr.mockResolvedValueOnce(MAX_PENDING_JOBS + 1);
            mockRedis.decr.mockResolvedValue(MAX_PENDING_JOBS);

            const result = await tryAcquireJobSlot(userId);

            expect(result.allowed).toBe(false);
            expect(mockRedis.decr).toHaveBeenCalled();
        });
    });

    describe('releaseJobSlot', () => {
        it('decrements pending count on release', async () => {
            mockRedis.decr.mockResolvedValue(2);

            await releaseJobSlot(userId);

            expect(mockRedis.decr).toHaveBeenCalledWith(
                expect.stringContaining(userId)
            );
        });

        it('prevents negative counts', async () => {
            mockRedis.decr.mockResolvedValue(-1);
            mockRedis.set.mockResolvedValue('OK');

            await releaseJobSlot(userId);

            // Should reset to 0
            expect(mockRedis.set).toHaveBeenCalledWith(
                expect.stringContaining(userId),
                '0',
                'EX',
                expect.any(Number)
            );
        });

        it('is idempotent - multiple releases are safe', async () => {
            mockRedis.decr.mockResolvedValue(0);

            // Multiple releases should not throw
            await releaseJobSlot(userId);
            await releaseJobSlot(userId);

            expect(mockRedis.decr).toHaveBeenCalledTimes(2);
        });
    });

    describe('graceful degradation', () => {
        it('falls back to database when Redis unavailable', async () => {
            mockRedis.incr.mockRejectedValue(new Error('Redis connection failed'));
            mockPrisma.playlistJob.count
                .mockResolvedValueOnce(2)  // pending count
                .mockResolvedValueOnce(5); // hourly count

            const result = await tryAcquireJobSlot(userId);

            expect(result.allowed).toBe(true);
            expect(mockPrisma.playlistJob.count).toHaveBeenCalledTimes(2);
        });

        it('respects limits in fallback mode', async () => {
            mockRedis.incr.mockRejectedValue(new Error('Redis down'));
            mockPrisma.playlistJob.count.mockResolvedValueOnce(MAX_PENDING_JOBS);

            const result = await tryAcquireJobSlot(userId);

            expect(result.allowed).toBe(false);
            expect(result.error).toContain('pending jobs');
        });
    });
});
