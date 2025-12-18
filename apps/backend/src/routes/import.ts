import { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { redis } from '../lib/redis';
import { getImportProgress } from '../services/import';
import type { ImportJob } from '../workers/import-worker';

export async function importRoutes(fastify: FastifyInstance) {
    const importQueue = new Queue<ImportJob>('import-history', { connection: redis });

    fastify.post('/me/import/spotify-history', async (request, reply) => {
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

    fastify.get('/me/import/status', async (request, reply) => {
        const userId = request.userId;
        if (!userId) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }

        const { jobId } = request.query as { jobId: string };
        if (!jobId) {
            return reply.status(400).send({ error: 'jobId required' });
        }

        const progress = await getImportProgress(jobId);
        if (!progress) {
            return reply.status(404).send({ error: 'Job not found' });
        }

        return progress;
    });
}
