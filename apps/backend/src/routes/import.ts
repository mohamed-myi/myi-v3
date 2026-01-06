import { randomUUID } from 'crypto';
import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getImportProgress, getImportProgressFromDB } from '../services/import';
import type { ImportJob } from '../workers/import-worker';
import { IMPORT_RATE_LIMIT } from '../middleware/rate-limit';
import { importQueue } from '../workers/queues';
import { JobStatus } from '@prisma/client';

const log = logger.child({ module: 'ImportRoutes' });

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

        // Use UUID for collision resistance while preserving userId prefix for ownership validation
        const jobId = `import_${userId}_${randomUUID()}`;

        try {
            // Create ImportJob record immediately with PENDING status
            // This ensures the job is visible in the UI before the worker picks it up
            await prisma.importJob.create({
                data: {
                    id: jobId,
                    userId,
                    fileName: data.filename,
                    status: JobStatus.PENDING,
                },
            });

            try {
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
            } catch (queueError) {
                // Queue failed after DB create; mark as failed immediately to avoid orphan
                log.error({ error: queueError, jobId }, 'Failed to add import job to queue');
                await prisma.importJob.update({
                    where: { id: jobId },
                    data: {
                        status: JobStatus.FAILED,
                        errorMessage: 'Failed to queue import job',
                        completedAt: new Date(),
                    },
                });
                throw queueError;
            }

            return {
                message: 'Import queued',
                jobId,
                statusUrl: `/api/me/import/status?jobId=${jobId}`
            };
        } catch (error) {
            log.error({ error, jobId }, 'Import upload failed');
            return reply.status(500).send({ error: 'Failed to start import' });
        }
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
            // Job IDs are formatted as: import_{userId}_{uuid}
            if (!jobId.startsWith(`import_${userId}_`)) {
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
