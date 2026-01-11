import pino from 'pino';
import { randomUUID } from 'crypto';

// Centralized logger for structured logging.
// Uses Pino for JSON output.

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
    level: isDev ? 'debug' : 'info',
    transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
});

// Generates a unique request ID for tracing.
export function generateRequestId(): string {
    return randomUUID().slice(0, 8);
}

// Creates a child logger with additional context.
// Useful for workers and services that need their own logging scope.
export function createChildLogger(context: Record<string, unknown>): pino.Logger {
    return logger.child(context);
}

// Pre-configured child loggers for workers
export const workerLoggers = {
    sync: createChildLogger({ worker: 'sync' }),
    audioFeatures: createChildLogger({ worker: 'audioFeatures' }),
    metadata: createChildLogger({ worker: 'metadata' }),
    topStats: createChildLogger({ worker: 'topStats' }),
    import: createChildLogger({ worker: 'import' }),
    playlist: createChildLogger({ worker: 'playlist' }),
};
