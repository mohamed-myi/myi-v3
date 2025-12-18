import { FastifyInstance } from 'fastify';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { build } from '@/index';
import request from 'supertest';
import { createServer } from 'http';


jest.mock('@/lib/prisma', () => ({
    prisma: {
        userTrackStats: { aggregate: jest.fn(), findMany: jest.fn() },
        userArtistStats: { findFirst: jest.fn(), findMany: jest.fn() },
        listeningEvent: { findMany: jest.fn(), count: jest.fn() },
        user: { findUnique: jest.fn() } // For auth
    },
}));

jest.mock('@/lib/redis', () => ({
    redis: {
        get: jest.fn(),
        setex: jest.fn(),
    },
}));

// Mock auth middleware to bypass real cookie checks and inject userId
jest.mock('@/middleware/auth', () => ({
    authMiddleware: async (req: any, reply: any) => {
        req.userId = 'user-1'; // Authenticated
    },
}));

describe('Stats API', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = await build();
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /me/stats/overview', () => {
        it('should return stats from DB on cache miss', async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);

            // Mock Prisma response
            (prisma.userTrackStats.aggregate as jest.Mock).mockResolvedValue({
                _sum: { totalMs: BigInt(5000) },
                _count: { trackId: 10 },
            });
            (prisma.userArtistStats.findFirst as jest.Mock).mockResolvedValue({
                artist: { name: 'Top Artist' },
            });

            const response = await app.inject({
                method: 'GET',
                url: '/me/stats/overview',
            });

            expect(response.statusCode).toBe(200);
            const body = response.json();

            // Verify BigInt serialization
            expect(body.totalPlayTimeMs).toBe('5000');
            expect(body.totalTracks).toBe(10);
            expect(body.topArtist).toBe('Top Artist');

            // Verify Cache Set
            expect(redis.setex).toHaveBeenCalledWith(
                'stats:overview:user-1',
                300,
                expect.any(String)
            );
        });

        it('should return stats from Redis on cache hit', async () => {
            const cachedData = JSON.stringify({
                totalPlayTimeMs: '9999',
                totalTracks: 50,
                topArtist: 'Cached Artist',
            });
            (redis.get as jest.Mock).mockResolvedValue(cachedData);

            const response = await app.inject({
                method: 'GET',
                url: '/me/stats/overview',
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual(JSON.parse(cachedData));
            expect(prisma.userTrackStats.aggregate).not.toHaveBeenCalled();
        });
    });

    describe('GET /me/stats/top/tracks', () => {
        it('should return top tracks list', async () => {
            (redis.get as jest.Mock).mockResolvedValue(null);
            (prisma.userTrackStats.findMany as jest.Mock).mockResolvedValue([
                {
                    playCount: 10,
                    totalMs: BigInt(30000),
                    track: { name: 'Song 1', artists: [] }
                }
            ]);

            const response = await app.inject({
                method: 'GET',
                url: '/me/stats/top/tracks?range=all',
            });

            expect(response.statusCode).toBe(200);
            const body = response.json();
            expect(body).toHaveLength(1);
            expect(body[0].track.name).toBe('Song 1');
            expect(body[0].totalMs).toBe('30000');
        });
    });
});
