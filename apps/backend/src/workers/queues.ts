import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { DEFAULT_JOB_OPTIONS } from './worker-config';

// Queue for syncing individual users' listening history
export const syncUserQueue = new Queue('sync-user', {
    connection: redis,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

// Queue for artist metadata enrichment
export const artistMetadataQueue = new Queue('artist-metadata', {
    connection: redis,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 60000 },
        removeOnComplete: 50,
        removeOnFail: 100,
    },
});

// Queue for import jobs
export const importQueue = new Queue('import-history', {
    connection: redis,
    defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        attempts: 3, // Fewer retries for imports
    },
});
