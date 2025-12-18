import { Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { processImportStream } from '../services/import';
import { Readable } from 'stream';

export interface ImportJob {
    userId: string;
    jobId: string;
    fileData: string;
}

const processImport = async (job: Job<ImportJob>): Promise<void> => {
    const { userId, jobId, fileData } = job.data;

    try {
        const buffer = Buffer.from(fileData, 'base64');
        const stream = Readable.from(buffer);

        await processImportStream(userId, jobId, stream);
    } catch (error) {
        console.error(`Import job ${jobId} failed:`, error);
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
    console.log(`Import job ${job.data.jobId} completed`);
});

importWorker.on('failed', (job, err) => {
    console.error(`Import job ${job?.data.jobId} failed: ${err.message}`);
});
