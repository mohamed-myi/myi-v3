import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { toJSON } from '../lib/serialization';

const CACHE_TTL = 300;

export async function statsRoutes(fastify: FastifyInstance) {

    // GET /me/stats/overview
    fastify.get('/me/stats/overview', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const cacheKey = `stats:overview:${userId}`;
        const cached = await redis.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const [trackStats, topArtist] = await Promise.all([
            prisma.userTrackStats.aggregate({
                where: { userId },
                _sum: { totalMs: true },
                _count: { trackId: true },
            }),
            prisma.userArtistStats.findFirst({
                where: { userId },
                orderBy: { playCount: 'desc' },
                include: { artist: true },
            }),
        ]);

        const data = {
            totalPlayTimeMs: trackStats._sum.totalMs || 0n,
            totalTracks: trackStats._count.trackId || 0,
            topArtist: topArtist ? topArtist.artist.name : null,
        };

        const response = toJSON(data);
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(response));

        return response;
    });

    // GET /me/stats/top/tracks
    fastify.get<{ Querystring: { range?: string } }>('/me/stats/top/tracks', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const range = request.query.range || 'all';
        const cacheKey = `stats:tracks:${userId}:${range}`;

        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        let data;
        const limit = 50;

        if (range === 'all') {
            data = await prisma.userTrackStats.findMany({
                where: { userId },
                orderBy: { playCount: 'desc' },
                take: limit,
                include: { track: { include: { artists: { include: { artist: true } }, album: true } } },
            });
        } else {

            data = await prisma.userTrackStats.findMany({
                where: { userId },
                orderBy: { playCount: 'desc' },
                take: limit,
                include: { track: { include: { artists: { include: { artist: true } }, album: true } } },
            });
        }

        const serialized = toJSON(data);
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(serialized));

        return serialized;
    });

    // GET /me/stats/top/artists
    fastify.get<{ Querystring: { range?: string } }>('/me/stats/top/artists', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const range = request.query.range || 'all';
        const cacheKey = `stats:artists:${userId}:${range}`;

        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const data = await prisma.userArtistStats.findMany({
            where: { userId },
            orderBy: { playCount: 'desc' },
            take: 50,
            include: { artist: true },
        });

        const serialized = toJSON(data);
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(serialized));

        return serialized;
    });

    // GET /me/history
    fastify.get<{ Querystring: { page?: number; limit?: number } }>('/me/history', async (request, reply) => {
        const userId = request.userId;
        if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

        const page = request.query.page || 1;
        const limit = request.query.limit || 50;
        const skip = (page - 1) * limit;

        const [events, total] = await Promise.all([
            prisma.listeningEvent.findMany({
                where: { userId },
                orderBy: { playedAt: 'desc' },
                take: limit,
                skip,
                include: { track: { include: { artists: { include: { artist: true } }, album: true } } },
            }),
            prisma.listeningEvent.count({ where: { userId } }),
        ]);

        return toJSON({ events, total, page, limit });
    });
}
