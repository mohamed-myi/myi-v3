import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { PlaylistCreationMethod } from '@prisma/client';

export interface PlaylistJobData {
    jobId: string;
    userId: string;
    creationMethod: PlaylistCreationMethod;
}

// Playlist creation queue
// Longer retention than other queues for audit trail
export const playlistQueue = new Queue<PlaylistJobData>('create-playlist', {
    connection: redis,
    defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 86400 * 30 }, // 30 days
        removeOnFail: { age: 86400 * 7 },      // 7 days
    },
});
