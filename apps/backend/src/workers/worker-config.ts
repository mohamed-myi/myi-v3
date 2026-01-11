export const DEFAULT_RETRY_OPTIONS = {
    attempts: 5,
    backoff: {
        type: 'exponential' as const,
        delay: 1000,
    },
};

export const DEFAULT_JOB_OPTIONS = {
    ...DEFAULT_RETRY_OPTIONS,
    removeOnComplete: 100,
    removeOnFail: false,
};

export const ARTIST_METADATA_JOB_OPTIONS = {
    attempts: 2,
    backoff: { type: 'fixed' as const, delay: 60000 },
    removeOnComplete: 50,
    removeOnFail: 100,
};

export const DLQ_SUFFIX = ':dlq';

/**
 * Playlist worker concurrency is kept low (2) because each job makes many
 * Spotify API calls: 1 create + N add tracks batches + 1 cover upload.
 * With 10K track playlists, that's 100+ API calls per job.
 */
export const PLAYLIST_WORKER_CONFIG = {
    concurrency: 2,
    limiter: {
        max: 10,           // Max 10 jobs per duration
        duration: 60000,   // Per minute
    },
};

