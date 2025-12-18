import { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { redis } from '../lib/redis';

// Rate limit configurations for different endpoint types
export const AUTH_RATE_LIMIT = {
    max: 20,
    timeWindow: '1 minute',
};

export const IMPORT_RATE_LIMIT = {
    max: 5,
    timeWindow: '1 minute',
};

export async function registerRateLimiting(server: FastifyInstance) {
    // Use Redis for distributed rate limiting in production
    // Use in-memory store in test/dev
    const isTestEnv = process.env.NODE_ENV === 'test' || !redis.defineCommand;

    const rateLimitOptions: Parameters<typeof rateLimit>[1] = {
        global: true,
        max: 100,
        timeWindow: '1 minute',
        keyGenerator: (request: FastifyRequest) => {
            // Use user ID if authenticated, otherwise IP
            return request.userId || request.ip;
        },
        errorResponseBuilder: (_request, context) => ({
            statusCode: 429,
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${context.after}`,
            retryAfter: context.after,
        }),
        // Skip rate limiting for health checks
        allowList: (request: FastifyRequest) => {
            return request.url === '/health';
        },
    };

    // Only use Redis store in production
    if (!isTestEnv) {
        rateLimitOptions.redis = redis;
    }

    await server.register(rateLimit, rateLimitOptions);
}
