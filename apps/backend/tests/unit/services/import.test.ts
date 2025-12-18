// Set env before imports
process.env.REDIS_URL = 'redis://mock:6379';

// Mock dependencies
const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
};

jest.mock('../../../src/lib/redis', () => ({
    redis: mockRedis,
    queueTrackForMetadata: jest.fn(),
}));

jest.mock('../../../src/lib/prisma', () => ({
    prisma: {
        user: { findUnique: jest.fn() },
        track: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
        listeningEvent: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    },
}));

jest.mock('../../../src/services/ingestion', () => ({
    insertListeningEventWithIds: jest.fn(),
}));

jest.mock('../../../src/services/aggregation', () => ({
    updateStatsForEvents: jest.fn(),
}));

// Mock stream-json to avoid actual streaming
jest.mock('stream-json', () => ({
    parser: jest.fn(() => ({
        pipe: jest.fn().mockReturnThis(),
    })),
}));

jest.mock('stream-json/streamers/StreamArray', () => ({
    streamArray: jest.fn(() => ({
        [Symbol.asyncIterator]: jest.fn(),
    })),
}));

import { getImportProgress } from '../../../src/services/import';
import { prisma } from '../../../src/lib/prisma';

describe('services/import', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getImportProgress', () => {
        it('returns null for missing job', async () => {
            mockRedis.get.mockResolvedValue(null);

            const result = await getImportProgress('nonexistent-job');
            expect(result).toBeNull();
        });

        it('returns parsed progress for existing job', async () => {
            const mockProgress = {
                status: 'processing',
                totalRecords: 100,
                processedRecords: 50,
                addedRecords: 45,
                skippedRecords: 5,
            };
            mockRedis.get.mockResolvedValue(JSON.stringify(mockProgress));

            const result = await getImportProgress('existing-job');
            expect(result).toEqual(mockProgress);
        });

        it('returns completed progress', async () => {
            const mockProgress = {
                status: 'completed',
                totalRecords: 200,
                processedRecords: 200,
                addedRecords: 180,
                skippedRecords: 20,
            };
            mockRedis.get.mockResolvedValue(JSON.stringify(mockProgress));

            const result = await getImportProgress('completed-job');
            expect(result).toEqual(mockProgress);
            expect(result?.status).toBe('completed');
        });

        it('returns failed progress with error message', async () => {
            const mockProgress = {
                status: 'failed',
                totalRecords: 50,
                processedRecords: 25,
                addedRecords: 20,
                skippedRecords: 5,
                errorMessage: 'Parse error at line 26',
            };
            mockRedis.get.mockResolvedValue(JSON.stringify(mockProgress));

            const result = await getImportProgress('failed-job');
            expect(result).toEqual(mockProgress);
            expect(result?.status).toBe('failed');
            expect(result?.errorMessage).toBe('Parse error at line 26');
        });
    });
});
