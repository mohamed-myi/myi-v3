import { Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { processImportStream } from '../services/import';
import { Readable } from 'stream';
import { workerLoggers } from '../lib/logger';

const log = workerLoggers.import;

export interface ImportJob {
    userId: string;
    jobId: string;
    fileData: string;
    fileName: string;
}

const processImport = async (job: Job<ImportJob>): Promise<void> => {
    const { userId, jobId, fileData, fileName } = job.data;

    try {
        const buffer = Buffer.from(fileData, 'base64');
        const stream = Readable.from(buffer);

        await processImportStream(userId, jobId, fileName, stream);
    } catch (error) {
        log.error({ jobId, error }, 'Import job failed');
        throw error;
    }
};

export const importWorker = new Worker<ImportJob>(
    'import-history',
    processImport,
    {
        connection: redis,
        concurrency: 1,
        lockDuration: 300000,
    }
);

importWorker.on('completed', (job) => {
    log.info({ jobId: job.data.jobId }, 'Import job completed');
});

importWorker.on('failed', (job, err) => {
    log.error({ jobId: job?.data.jobId, error: err.message }, 'Import job failed');
});
