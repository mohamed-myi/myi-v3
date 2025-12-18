import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root 
config({ path: resolve(__dirname, '../../../.env') });

import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { authRoutes } from './routes/auth';
import { cronRoutes } from './routes/cron';
import { importRoutes } from './routes/import';
import { statsRoutes } from './routes/stats';
import multipart from '@fastify/multipart';
import { authMiddleware } from './middleware/auth';
import { closeRedis } from './lib/redis';
import { closeSyncWorker } from './workers/sync-worker';

export const build = async () => {
  const server = Fastify({ logger: true });

  // Register plugins
  server.register(cookie);
  server.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB Limit
    }
  });

  // Auth middleware for protected routes
  server.addHook('preHandler', authMiddleware);

  // Register routes
  server.register(authRoutes);
  server.register(cronRoutes);
  server.register(importRoutes);
  server.register(statsRoutes);

  // Health check
  server.get('/health', async () => ({ status: 'ok' }));

  return server;
};

// Start server if main module
if (require.main === module) {
  const start = async () => {
    try {
      const server = await build();
      const port = Number(process.env.PORT) || 3001;
      await server.listen({ port, host: '0.0.0.0' });
      console.log('Sync worker started');

      const shutdown = async () => {
        console.log('Shutting down...');
        await closeSyncWorker();
        await closeRedis();
        await server.close();
        process.exit(0);
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  };

  start();
}
