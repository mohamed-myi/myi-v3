import { Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { processImportStream } from '../services/import';
import { Readable } from 'stream';
import { workerLoggers } from '../lib/logger';

const log = workerLoggers.import;

const MAX_SAFE_PAYLOAD_SIZE = 10 * 1024 * 1024;

export interface ImportJob {
    userId: string;
    jobId: string;
    fileData: string;
    fileName: string;
}

export async function runImport(
    data: Pick<ImportJob, 'userId' | 'jobId' | 'fileData' | 'fileName'>
): Promise<void> {
    const buffer = Buffer.from(data.fileData, 'base64');
    const stream = Readable.from(buffer);
    await processImportStream(data.userId, data.jobId, data.fileName, stream);
}

async function updateImportJobStatus(
    jobId: string,
    status: 'FAILED',
    error: unknown
): Promise<void> {
    try {
        const { prisma } = await import('../lib/prisma.js');
        await prisma.importJob.update({
            where: { id: jobId },
            data: {
                status,
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                completedAt: new Date(),
            },
        });
    } catch (dbError) {
        log.error({ jobId, dbError }, 'Failed to update job status in DB');
    }
}

const processImport = async (job: Job<ImportJob>): Promise<void> => {
    const { jobId, fileData } = job.data;

    const estimatedDecodedSize = fileData.length * 0.75;
    if (estimatedDecodedSize > MAX_SAFE_PAYLOAD_SIZE) {
        log.warn(
            { jobId, payloadSizeMB: Math.round(estimatedDecodedSize / 1024 / 1024) },
            'Large import payload may cause memory pressure - consider S3 streaming'
        );
    }

    try {
        await runImport(job.data);
    } catch (error) {
        log.error({ jobId, error }, 'Import job failed');
        await updateImportJobStatus(jobId, 'FAILED', error);
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
        stalledInterval: 60000,
    }
);

importWorker.on('completed', (job) => {
    log.info({ jobId: job.data.jobId }, 'Import job completed');
});

importWorker.on('failed', (job, err) => {
    log.error({ jobId: job?.data.jobId, error: err.message }, 'Import job failed');
});

export async function closeImportWorker(): Promise<void> {
    await importWorker.close();
}

process.on('SIGTERM', async () => {
    log.info('SIGTERM received, closing import worker...');
    await closeImportWorker();
});

process.on('SIGINT', async () => {
    log.info('SIGINT received, closing import worker...');
    await closeImportWorker();
});
