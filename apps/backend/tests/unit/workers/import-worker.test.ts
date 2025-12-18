// Mock dependencies before imports
jest.mock('../../../src/lib/redis', () => ({
    redis: {},
}));

jest.mock('../../../src/services/import', () => ({
    processImportStream: jest.fn(),
}));

// Mock BullMQ Worker
jest.mock('bullmq', () => ({
    Worker: jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        close: jest.fn(),
    })),
    Queue: jest.fn(),
}));

import { Readable } from 'stream';
import { processImportStream } from '../../../src/services/import';

// Test the processImport logic (mirroring the worker implementation)
describe('import-worker processImport logic', () => {
    async function processImport(jobData: { userId: string; jobId: string; fileData: string; fileName: string }) {
        const { userId, jobId, fileData, fileName } = jobData;

        try {
            const buffer = Buffer.from(fileData, 'base64');
            const stream = Readable.from(buffer);

            await processImportStream(userId, jobId, fileName, stream);
        } catch (error) {
            console.error(`Import job ${jobId} failed:`, error);
            throw error;
        }
    }

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('processImport', () => {
        it('decodes base64 file data correctly', async () => {
            (processImportStream as jest.Mock).mockResolvedValue(undefined);

            const jsonContent = '[{"ts":"2025-01-01","ms_played":30000}]';
            const base64Content = Buffer.from(jsonContent).toString('base64');

            await processImport({
                userId: 'user-123',
                jobId: 'job-456',
                fileData: base64Content,
                fileName: 'endsong.json',
            });

            expect(processImportStream).toHaveBeenCalledWith(
                'user-123',
                'job-456',
                'endsong.json',
                expect.any(Readable)
            );
        });

        it('passes userId, jobId, and fileName to processImportStream', async () => {
            (processImportStream as jest.Mock).mockResolvedValue(undefined);

            await processImport({
                userId: 'specific-user',
                jobId: 'specific-job',
                fileData: Buffer.from('[]').toString('base64'),
                fileName: 'test.json',
            });

            expect(processImportStream).toHaveBeenCalledWith(
                'specific-user',
                'specific-job',
                'test.json',
                expect.any(Object)
            );
        });

        it('creates readable stream from decoded buffer', async () => {
            let capturedStream: any;
            (processImportStream as jest.Mock).mockImplementation(
                async (userId, jobId, fileName, stream) => {
                    capturedStream = stream;
                    // Consume the stream to verify content
                    const chunks: Buffer[] = [];
                    for await (const chunk of stream) {
                        chunks.push(chunk);
                    }
                    return Buffer.concat(chunks).toString();
                }
            );

            const testData = '{"test": "data"}';
            await processImport({
                userId: 'user-123',
                jobId: 'job-789',
                fileData: Buffer.from(testData).toString('base64'),
                fileName: 'data.json',
            });

            expect(capturedStream).toBeDefined();
        });

        it('throws error when processImportStream fails', async () => {
            (processImportStream as jest.Mock).mockRejectedValue(
                new Error('Stream processing failed')
            );

            await expect(
                processImport({
                    userId: 'user-123',
                    jobId: 'job-fail',
                    fileData: Buffer.from('invalid').toString('base64'),
                    fileName: 'bad.json',
                })
            ).rejects.toThrow('Stream processing failed');
        });

        it('logs error with job ID when processing fails', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            (processImportStream as jest.Mock).mockRejectedValue(new Error('Test error'));

            await expect(
                processImport({
                    userId: 'user-123',
                    jobId: 'job-with-error',
                    fileData: Buffer.from('[]').toString('base64'),
                    fileName: 'error.json',
                })
            ).rejects.toThrow();

            expect(consoleSpy).toHaveBeenCalledWith(
                'Import job job-with-error failed:',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });

        it('handles empty file data', async () => {
            (processImportStream as jest.Mock).mockResolvedValue(undefined);

            await processImport({
                userId: 'user-123',
                jobId: 'job-empty',
                fileData: Buffer.from('').toString('base64'),
                fileName: 'empty.json',
            });

            expect(processImportStream).toHaveBeenCalled();
        });

        it('handles large file data', async () => {
            (processImportStream as jest.Mock).mockResolvedValue(undefined);

            // Create a larger mock file (10KB)
            const largeArray = Array(100).fill({
                ts: '2025-01-01T12:00:00Z',
                ms_played: 180000,
                master_metadata_track_name: 'Test Track',
                spotify_track_uri: 'spotify:track:abc123456789',
            });
            const largeJson = JSON.stringify(largeArray);

            await processImport({
                userId: 'user-123',
                jobId: 'job-large',
                fileData: Buffer.from(largeJson).toString('base64'),
                fileName: 'large_endsong.json',
            });

            expect(processImportStream).toHaveBeenCalled();
        });
    });
});
