import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { getImportProgress, getImportProgressFromDB } from '../services/import';
import type { ImportJob } from '../workers/import-worker';
import { IMPORT_RATE_LIMIT } from '../middleware/rate-limit';
import { importQueue } from '../workers/queues';

// JSON Schema for status endpoint
const statusSchema = {
    querystring: {
        type: 'object',
        required: ['jobId'],
        properties: {
            jobId: { type: 'string', minLength: 1, maxLength: 100 }
        }
    }
};

// JSON Schema for jobs listing endpoint
const jobsSchema = {
    querystring: {
        type: 'object',
        properties: {
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            offset: { type: 'integer', minimum: 0, default: 0 }
        }
    }
};

export async function importRoutes(fastify: FastifyInstance) {
    // Upload and start import job (stricter rate limit: 5/minute)
    fastify.post('/me/import/spotify-history', { config: { rateLimit: IMPORT_RATE_LIMIT } }, async (request, reply) => {
        const userId = request.userId;
        if (!userId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const data = await request.file();
        if (!data) {
            return reply.status(400).send({ error: 'No file uploaded' });
        }

        if (!data.filename.endsWith('.json')) {
            return reply.status(400).send({ error: 'File must be a JSON file' });
        }

        const buffer = await data.toBuffer();
        const fileData = buffer.toString('base64');

        const jobId = `import_${userId}_${Date.now()}`;

        await importQueue.add('import-endsong', {
            userId,
            jobId,
            fileData,
            fileName: data.filename,
        }, {
            jobId,
            removeOnComplete: true,
            removeOnFail: 24 * 3600,
        });

        return {
            message: 'Import started',
            jobId,
            statusUrl: `/api/me/import/status?jobId=${jobId}`
        };
    });

    // Get import job status
    fastify.get('/me/import/status', { schema: statusSchema }, async (request, reply) => {
        const userId = request.userId;
        if (!userId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const { jobId } = request.query as { jobId: string };

        // Try Redis first (real-time progress)
        let progress = await getImportProgress(jobId);

        // If Redis has data, validate ownership via jobId format
        if (progress) {
            // Job IDs are formatted as: import_{userId}_{timestamp}
            if (!jobId.includes(`import_${userId}_`)) {
                return reply.status(403).send({ error: 'Access denied' });
            }
            return progress;
        }

        // Fallback to DB
        progress = await getImportProgressFromDB(jobId, userId);

        if (!progress) {
            return reply.status(404).send({ error: 'Job not found' });
        }

        return progress;
    });

    // List all import jobs for user
    fastify.get('/me/import/jobs', { schema: jobsSchema }, async (request, reply) => {
        const userId = request.userId;
        if (!userId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const query = request.query as { limit?: number; offset?: number };
        const limit = query.limit ?? 10;
        const offset = query.offset ?? 0;

        const jobs = await prisma.importJob.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
                id: true,
                fileName: true,
                status: true,
                totalEvents: true,
                processedEvents: true,
                errorMessage: true,
                createdAt: true,
                startedAt: true,
                completedAt: true,
            },
        });

        const total = await prisma.importJob.count({ where: { userId } });

        return {
            jobs,
            pagination: {
                total,
                limit,
                offset,
            },
        };
    });
}
