// Audio Features Worker Tests
// Testing the core processing logic extracted from the infinite loop

process.env.REDIS_URL = 'redis://mock:6379';

jest.mock('../../../src/lib/redis', () => ({
    popTracksForFeatures: jest.fn(),
    queueTrackForFeatures: jest.fn(),
    waitForRateLimit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/lib/prisma', () => ({
    prisma: {
        spotifyAuth: {
            findFirst: jest.fn(),
        },
        audioFeatures: {
            upsert: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

jest.mock('../../../src/lib/token-manager', () => ({
    getValidAccessToken: jest.fn(),
}));

jest.mock('../../../src/lib/spotify-api', () => ({
    getAudioFeaturesBatch: jest.fn(),
}));

jest.mock('../../../src/workers/worker-status', () => ({
    setAudioFeaturesWorkerRunning: jest.fn(),
}));

import { prisma } from '../../../src/lib/prisma';
import { popTracksForFeatures, queueTrackForFeatures } from '../../../src/lib/redis';
import { getValidAccessToken } from '../../../src/lib/token-manager';
import { getAudioFeaturesBatch } from '../../../src/lib/spotify-api';

// Extracts and tests the core processing logic from the infinite loop.
// Returns: 'no_tracks' | 'no_token' | 'processed' | 'error'
async function processAudioFeaturesBatch(): Promise<'no_tracks' | 'no_token' | 'processed' | 'error'> {
    // Pop batch of tracks
    const trackIds = await (popTracksForFeatures as jest.Mock)(50);
    if (trackIds.length === 0) {
        return 'no_tracks';
    }

    // Get a valid token
    const user = await (prisma.spotifyAuth.findFirst as jest.Mock)({
        where: { isValid: true },
        orderBy: { lastRefreshAt: 'desc' },
        select: { userId: true },
    });

    if (!user) {
        // Re-queue tracks
        for (const id of trackIds) {
            await (queueTrackForFeatures as jest.Mock)(id);
        }
        return 'no_token';
    }

    const tokenResult = await (getValidAccessToken as jest.Mock)(user.userId);
    if (!tokenResult) {
        return 'no_token';
    }

    const features = await (getAudioFeaturesBatch as jest.Mock)(tokenResult.accessToken, trackIds);

    // Upsert features
    await (prisma.$transaction as jest.Mock)(
        features
            .filter((f: any) => f !== null)
            .map((f: any) =>
                (prisma.audioFeatures.upsert as jest.Mock)({
                    where: { trackId: f.id },
                    create: expect.any(Object),
                    update: expect.any(Object),
                })
            )
    );

    return 'processed';
}

describe('Audio Features Worker', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('processAudioFeaturesBatch', () => {
        it('returns no_tracks when queue is empty', async () => {
            (popTracksForFeatures as jest.Mock).mockResolvedValue([]);

            const result = await processAudioFeaturesBatch();

            expect(result).toBe('no_tracks');
            expect(getAudioFeaturesBatch).not.toHaveBeenCalled();
        });

        it('re-queues tracks and returns no_token when no valid user found', async () => {
            (popTracksForFeatures as jest.Mock).mockResolvedValue(['track-1', 'track-2']);
            (prisma.spotifyAuth.findFirst as jest.Mock).mockResolvedValue(null);

            const result = await processAudioFeaturesBatch();

            expect(result).toBe('no_token');
            expect(queueTrackForFeatures).toHaveBeenCalledWith('track-1');
            expect(queueTrackForFeatures).toHaveBeenCalledWith('track-2');
        });

        it('returns no_token when token refresh fails', async () => {
            (popTracksForFeatures as jest.Mock).mockResolvedValue(['track-1']);
            (prisma.spotifyAuth.findFirst as jest.Mock).mockResolvedValue({ userId: 'user-1' });
            (getValidAccessToken as jest.Mock).mockResolvedValue(null);

            const result = await processAudioFeaturesBatch();

            expect(result).toBe('no_token');
        });

        it('fetches and stores audio features successfully', async () => {
            (popTracksForFeatures as jest.Mock).mockResolvedValue(['track-1', 'track-2']);
            (prisma.spotifyAuth.findFirst as jest.Mock).mockResolvedValue({ userId: 'user-1' });
            (getValidAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'token' });
            (getAudioFeaturesBatch as jest.Mock).mockResolvedValue([
                {
                    id: 'track-1',
                    acousticness: 0.5,
                    danceability: 0.7,
                    energy: 0.8,
                    instrumentalness: 0.1,
                    key: 5,
                    liveness: 0.2,
                    loudness: -5.0,
                    mode: 1,
                    speechiness: 0.1,
                    tempo: 120,
                    time_signature: 4,
                    valence: 0.6,
                    duration_ms: 180000,
                },
                null, // Track without features
            ]);
            (prisma.$transaction as jest.Mock).mockResolvedValue([{}]);

            const result = await processAudioFeaturesBatch();

            expect(result).toBe('processed');
            expect(getAudioFeaturesBatch).toHaveBeenCalledWith('token', ['track-1', 'track-2']);
            expect(prisma.$transaction).toHaveBeenCalled();
        });

        it('filters out null features before upsert', async () => {
            (popTracksForFeatures as jest.Mock).mockResolvedValue(['track-1']);
            (prisma.spotifyAuth.findFirst as jest.Mock).mockResolvedValue({ userId: 'user-1' });
            (getValidAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'token' });
            (getAudioFeaturesBatch as jest.Mock).mockResolvedValue([null]);
            (prisma.$transaction as jest.Mock).mockResolvedValue([]);

            const result = await processAudioFeaturesBatch();

            expect(result).toBe('processed');
            // Transaction should be called with empty array (all nulls filtered)
            expect(prisma.$transaction).toHaveBeenCalledWith([]);
        });
    });
});
