import { FastifyInstance } from 'fastify';
import { checkDatabaseHealth } from '../lib/db';
import { pingRedis } from '../lib/redis';
import {
    isSyncWorkerRunning,
    isMetadataWorkerRunning,
    isTopStatsWorkerRunning,
    isPlaylistWorkerRunning,
} from '@/workers/worker-status';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
type CheckStatus = 'up' | 'down';
type WorkerStatus = 'running' | 'stopped';

interface DetailedHealthResponse {
    status: HealthStatus;
    timestamp: string;
    checks: {
        database: { status: CheckStatus; latencyMs?: number };
        redis: { status: CheckStatus; latencyMs?: number };
        workers: {
            sync: WorkerStatus;
            metadata: WorkerStatus;
            topStats: WorkerStatus;
            playlist: WorkerStatus;
        };
    };
}

export async function healthRoutes(server: FastifyInstance) {
    // Simple health check
    server.get('/health', async () => ({ status: 'ok' }));

    // Detailed health check with dependency status
    server.get('/health/detailed', async (): Promise<DetailedHealthResponse> => {
        // Check database
        const dbStart = Date.now();
        const dbResult = await checkDatabaseHealth();
        const dbLatency = Date.now() - dbStart;

        // Check Redis
        const redisStart = Date.now();
        const redisOk = await pingRedis();
        const redisLatency = Date.now() - redisStart;

        // Check workers
        const workers = {
            sync: isSyncWorkerRunning() ? 'running' as const : 'stopped' as const,
            metadata: isMetadataWorkerRunning() ? 'running' as const : 'stopped' as const,
            topStats: isTopStatsWorkerRunning() ? 'running' as const : 'stopped' as const,
            playlist: isPlaylistWorkerRunning() ? 'running' as const : 'stopped' as const,
        };

        // Determine overall status
        const dbUp = dbResult.ok;
        const redisUp = redisOk;
        const allWorkersRunning = Object.values(workers).every((s) => s === 'running');

        let status: HealthStatus;
        if (!dbUp || !redisUp) {
            status = 'unhealthy';
        } else if (!allWorkersRunning) {
            status = 'degraded';
        } else {
            status = 'healthy';
        }

        return {
            status,
            timestamp: new Date().toISOString(),
            checks: {
                database: { status: dbUp ? 'up' : 'down', latencyMs: dbLatency },
                redis: { status: redisUp ? 'up' : 'down', latencyMs: redisLatency },
                workers,
            },
        };
    });
}
