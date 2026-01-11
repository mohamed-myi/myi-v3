import { config } from 'dotenv';
import { resolve } from 'path';

// Load env vars
config({ path: resolve(__dirname, '../../../../.env') });

// Manually ensure critical env vars are set to satisfy Zod validation
process.env.NODE_ENV = 'test';
process.env.PORT = process.env.PORT || '3001';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://mock:5432/mock';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://mock:6379';
process.env.SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'mock_client_id';
process.env.SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'mock_client_secret';
// Must be 64 chars
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY?.length === 64
    ? process.env.ENCRYPTION_KEY
    : '0000000000000000000000000000000000000000000000000000000000000000';

// Mock Redis 
jest.mock('../../src/lib/redis', () => ({
    redis: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        on: jest.fn(),
        quit: jest.fn(),
    },
    closeRedis: jest.fn(),
}));

import { FastifyInstance } from 'fastify';
import { prisma } from '../../src/lib/prisma';

// Mock getValidAccessToken
jest.mock('../../src/lib/token-manager', () => ({
    getValidAccessToken: jest.fn().mockResolvedValue({ accessToken: 'fake-token' }),
}));

// Mock Prisma
jest.mock('../../src/lib/prisma', () => ({
    prisma: {
        user: {
            findUnique: jest.fn(),
        },
        spotifyTopTrack: {
            findMany: jest.fn().mockResolvedValue([]),
        },
        userTrackStats: {
            count: jest.fn().mockResolvedValue(100),
        },
        listeningEvent: {
            findMany: jest.fn().mockResolvedValue([]),
        }
    },
}));

// Mock Auth Middleware to bypass DB/Cookie logic
jest.mock('../../src/middleware/auth', () => ({
    authMiddleware: async (req: any) => {
        const sessionId = req.cookies.session;
        if (sessionId) {
            req.userId = sessionId;
            // Simple mock logic: if ID is 'demo-user-id', set isDemo.
            if (sessionId === 'demo-user-id') {
                req.isDemo = true;
            }
        }
    }
}));

describe('Demo Mode Restrictions', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        // Use require to ensure process.env is set before src/env.ts runs
        // Dynamic import() fails in Jest without experimental flags
        const { build } = require('../../src/index');
        app = await build();
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default demo user
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
            id: 'demo-user-id',
            isDemo: true
        });
    });

    // Test Validate Shuffle
    it('GET /playlists/validate/shuffle should return 403 in demo mode', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/playlists/validate/shuffle',
            cookies: { session: 'demo-user-id' },
            payload: {
                sourcePlaylistId: 'some-playlist',
                shuffleMode: 'truly_random'
            }
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('DEMO_MODE_RESTRICTED');
        expect(body.error).toBe('Demo Mode');
    });

    // Test Validate Top 50
    it('GET /playlists/validate/top50 should return 403 in demo mode', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/playlists/validate/top50',
            cookies: { session: 'demo-user-id' },
            payload: {
                term: 'short'
            }
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('DEMO_MODE_RESTRICTED');
        expect(body.error).toBe('Demo Mode');
    });

    // Test Validate Recent
    it('GET /playlists/validate/recent should return 403 in demo mode', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/playlists/validate/recent',
            cookies: { session: 'demo-user-id' },
            payload: {
                kValue: 50
            }
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('DEMO_MODE_RESTRICTED');
        expect(body.error).toBe('Demo Mode');
    });
});
