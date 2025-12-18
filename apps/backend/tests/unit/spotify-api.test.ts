// Mock p-retry to avoid ESM issues
jest.mock('p-retry', () => ({
    __esModule: true,
    default: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { mockFetch, restoreFetch, createMockResponse } from '../mocks/fetch.mock';
import {
    getRecentlyPlayed,
    getTopTracks,
    getTopArtists,
    getTracksBatch,
    getAlbumsBatch,
    getAudioFeatures,
    getAudioFeaturesBatch,
} from '../../src/lib/spotify-api';
import {
    SpotifyUnauthenticatedError,
    SpotifyForbiddenError,
    SpotifyRateLimitError,
    SpotifyDownError,
    SpotifyApiError,
} from '../../src/lib/spotify-errors';

// Shared mock data
const mockTrack = {
    id: 'track-123',
    name: 'Test Track',
    duration_ms: 180000,
    preview_url: null,
    album: {
        id: 'album-123',
        name: 'Test Album',
        images: [],
        release_date: '2025-01-01',
    },
    artists: [{ id: 'artist-123', name: 'Test Artist' }],
};

const mockArtist = {
    id: 'artist-123',
    name: 'Test Artist',
    images: [{ url: 'https://example.com/img.jpg', height: 640, width: 640 }],
    genres: ['pop'],
    popularity: 80,
};

const mockAlbum = {
    id: 'album-123',
    name: 'Test Album',
    images: [{ url: 'https://example.com/album.jpg', height: 640, width: 640 }],
    release_date: '2025-01-01',
};

const mockAudioFeatures = {
    id: 'track-123',
    tempo: 120.5,
    energy: 0.8,
    danceability: 0.75,
    valence: 0.6,
    acousticness: 0.1,
    instrumentalness: 0.0,
    liveness: 0.15,
    speechiness: 0.05,
    loudness: -5.2,
    key: 5,
    mode: 1,
    duration_ms: 180000,
    time_signature: 4,
};

describe('spotify-api', () => {
    afterEach(() => {
        restoreFetch();
    });

    describe('getRecentlyPlayed', () => {
        const mockRecentlyPlayedResponse = {
            items: [{ played_at: '2025-01-01T12:00:00Z', track: mockTrack }],
            cursors: { after: '123', before: '456' },
        };

        test('returns parsed response on success', async () => {
            mockFetch(async () => createMockResponse(200, mockRecentlyPlayedResponse));
            const result = await getRecentlyPlayed('valid-token');
            expect(result.items).toHaveLength(1);
            expect(result.items[0].track.id).toBe('track-123');
        });

        test('passes limit parameter', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockRecentlyPlayedResponse);
            });
            await getRecentlyPlayed('token', { limit: 25 });
            expect(capturedUrl).toContain('limit=25');
        });

        test('passes after parameter', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockRecentlyPlayedResponse);
            });
            await getRecentlyPlayed('token', { after: 1234567890 });
            expect(capturedUrl).toContain('after=1234567890');
        });

        test('throws SpotifyUnauthenticatedError on 401', async () => {
            mockFetch(async () => createMockResponse(401, { error: 'Unauthorized' }));
            await expect(getRecentlyPlayed('bad-token')).rejects.toThrow(SpotifyUnauthenticatedError);
        });

        test('throws SpotifyForbiddenError on 403', async () => {
            mockFetch(async () => createMockResponse(403, { error: 'Forbidden' }));
            await expect(getRecentlyPlayed('token')).rejects.toThrow(SpotifyForbiddenError);
        });

        test('throws SpotifyRateLimitError on 429 with Retry-After header', async () => {
            mockFetch(async () =>
                createMockResponse(429, { error: 'Rate limited' }, { 'Retry-After': '120' })
            );
            try {
                await getRecentlyPlayed('token');
                fail('Expected SpotifyRateLimitError');
            } catch (error) {
                expect(error).toBeInstanceOf(SpotifyRateLimitError);
                expect((error as SpotifyRateLimitError).retryAfterSeconds).toBe(120);
            }
        });

        test('throws SpotifyDownError on 500', async () => {
            mockFetch(async () => createMockResponse(500, { error: 'Server error' }));
            await expect(getRecentlyPlayed('token')).rejects.toThrow(SpotifyDownError);
        });

        test('throws SpotifyDownError on 503', async () => {
            mockFetch(async () => createMockResponse(503, { error: 'Service unavailable' }));
            await expect(getRecentlyPlayed('token')).rejects.toThrow(SpotifyDownError);
        });

        test('throws SpotifyApiError on other 4xx errors', async () => {
            mockFetch(async () => createMockResponse(400, { error: 'Bad request' }));
            await expect(getRecentlyPlayed('token')).rejects.toThrow(SpotifyApiError);
        });
    });

    describe('getTopTracks', () => {
        const mockTopTracksResponse = {
            items: [mockTrack],
            total: 50,
            limit: 50,
            offset: 0,
        };

        test('returns top tracks on success', async () => {
            mockFetch(async () => createMockResponse(200, mockTopTracksResponse));
            const result = await getTopTracks('token');
            expect(result.items).toHaveLength(1);
            expect(result.items[0].id).toBe('track-123');
        });

        test('uses medium_term as default time range', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockTopTracksResponse);
            });
            await getTopTracks('token');
            expect(capturedUrl).toContain('time_range=medium_term');
        });

        test('passes time_range parameter', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockTopTracksResponse);
            });
            await getTopTracks('token', 'short_term');
            expect(capturedUrl).toContain('time_range=short_term');
        });

        test('passes limit parameter', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockTopTracksResponse);
            });
            await getTopTracks('token', 'medium_term', 20);
            expect(capturedUrl).toContain('limit=20');
        });

        test('caps limit at 50', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockTopTracksResponse);
            });
            await getTopTracks('token', 'medium_term', 100);
            expect(capturedUrl).toContain('limit=50');
        });

        test('throws SpotifyUnauthenticatedError on 401', async () => {
            mockFetch(async () => createMockResponse(401, { error: 'Unauthorized' }));
            await expect(getTopTracks('bad-token')).rejects.toThrow(SpotifyUnauthenticatedError);
        });
    });

    describe('getTopArtists', () => {
        const mockTopArtistsResponse = {
            items: [mockArtist],
            total: 50,
            limit: 50,
            offset: 0,
        };

        test('returns top artists on success', async () => {
            mockFetch(async () => createMockResponse(200, mockTopArtistsResponse));
            const result = await getTopArtists('token');
            expect(result.items).toHaveLength(1);
            expect(result.items[0].id).toBe('artist-123');
        });

        test('uses medium_term as default time range', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockTopArtistsResponse);
            });
            await getTopArtists('token');
            expect(capturedUrl).toContain('time_range=medium_term');
        });

        test('passes time_range parameter', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockTopArtistsResponse);
            });
            await getTopArtists('token', 'long_term');
            expect(capturedUrl).toContain('time_range=long_term');
        });

        test('passes limit parameter', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockTopArtistsResponse);
            });
            await getTopArtists('token', 'medium_term', 10);
            expect(capturedUrl).toContain('limit=10');
        });

        test('caps limit at 50', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockTopArtistsResponse);
            });
            await getTopArtists('token', 'medium_term', 999);
            expect(capturedUrl).toContain('limit=50');
        });

        test('throws SpotifyUnauthenticatedError on 401', async () => {
            mockFetch(async () => createMockResponse(401, { error: 'Unauthorized' }));
            await expect(getTopArtists('bad-token')).rejects.toThrow(SpotifyUnauthenticatedError);
        });
    });

    describe('getTracksBatch', () => {
        const mockTracksBatchResponse = { tracks: [mockTrack] };

        test('returns tracks on success', async () => {
            mockFetch(async () => createMockResponse(200, mockTracksBatchResponse));
            const result = await getTracksBatch('token', ['track-123']);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('track-123');
        });

        test('returns empty array for empty input', async () => {
            const result = await getTracksBatch('token', []);
            expect(result).toEqual([]);
        });

        test('throws error for more than 50 tracks', async () => {
            const ids = Array.from({ length: 51 }, (_, i) => `track-${i}`);
            await expect(getTracksBatch('token', ids)).rejects.toThrow(
                'Cannot fetch more than 50 tracks at once'
            );
        });

        test('passes track IDs in URL', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockTracksBatchResponse);
            });
            await getTracksBatch('token', ['t1', 't2', 't3']);
            expect(capturedUrl).toContain('ids=t1,t2,t3');
        });

        test('throws SpotifyUnauthenticatedError on 401', async () => {
            mockFetch(async () => createMockResponse(401, { error: 'Unauthorized' }));
            await expect(getTracksBatch('bad-token', ['t1'])).rejects.toThrow(
                SpotifyUnauthenticatedError
            );
        });
    });

    describe('getAlbumsBatch', () => {
        const mockAlbumsBatchResponse = { albums: [mockAlbum] };

        test('returns albums on success', async () => {
            mockFetch(async () => createMockResponse(200, mockAlbumsBatchResponse));
            const result = await getAlbumsBatch('token', ['album-123']);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('album-123');
        });

        test('returns empty array for empty input', async () => {
            const result = await getAlbumsBatch('token', []);
            expect(result).toEqual([]);
        });

        test('throws error for more than 20 albums', async () => {
            const ids = Array.from({ length: 21 }, (_, i) => `album-${i}`);
            await expect(getAlbumsBatch('token', ids)).rejects.toThrow(
                'Cannot fetch more than 20 albums at once'
            );
        });

        test('passes album IDs in URL', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockAlbumsBatchResponse);
            });
            await getAlbumsBatch('token', ['a1', 'a2']);
            expect(capturedUrl).toContain('ids=a1,a2');
        });

        test('throws SpotifyUnauthenticatedError on 401', async () => {
            mockFetch(async () => createMockResponse(401, { error: 'Unauthorized' }));
            await expect(getAlbumsBatch('bad-token', ['a1'])).rejects.toThrow(
                SpotifyUnauthenticatedError
            );
        });
    });

    describe('getAudioFeatures', () => {
        test('returns audio features on success', async () => {
            mockFetch(async () => createMockResponse(200, mockAudioFeatures));
            const result = await getAudioFeatures('token', 'track-123');
            expect(result.id).toBe('track-123');
            expect(result.tempo).toBe(120.5);
            expect(result.energy).toBe(0.8);
        });

        test('includes track ID in URL', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockAudioFeatures);
            });
            await getAudioFeatures('token', 'my-track-id');
            expect(capturedUrl).toContain('/audio-features/my-track-id');
        });

        test('throws SpotifyUnauthenticatedError on 401', async () => {
            mockFetch(async () => createMockResponse(401, { error: 'Unauthorized' }));
            await expect(getAudioFeatures('bad-token', 't1')).rejects.toThrow(
                SpotifyUnauthenticatedError
            );
        });

        test('throws SpotifyApiError on 404', async () => {
            mockFetch(async () => createMockResponse(404, { error: 'Not found' }));
            await expect(getAudioFeatures('token', 'invalid-track')).rejects.toThrow(SpotifyApiError);
        });
    });

    describe('getAudioFeaturesBatch', () => {
        const mockAudioFeaturesBatchResponse = {
            audio_features: [mockAudioFeatures, null],
        };

        test('returns audio features array on success', async () => {
            mockFetch(async () => createMockResponse(200, mockAudioFeaturesBatchResponse));
            const result = await getAudioFeaturesBatch('token', ['track-123', 'invalid']);
            expect(result).toHaveLength(2);
            expect(result[0]?.id).toBe('track-123');
            expect(result[1]).toBeNull();
        });

        test('returns empty array for empty input', async () => {
            const result = await getAudioFeaturesBatch('token', []);
            expect(result).toEqual([]);
        });

        test('throws error for more than 100 tracks', async () => {
            const ids = Array.from({ length: 101 }, (_, i) => `track-${i}`);
            await expect(getAudioFeaturesBatch('token', ids)).rejects.toThrow(
                'Cannot fetch more than 100 audio features at once'
            );
        });

        test('passes track IDs in URL', async () => {
            let capturedUrl = '';
            mockFetch(async (url) => {
                capturedUrl = url;
                return createMockResponse(200, mockAudioFeaturesBatchResponse);
            });
            await getAudioFeaturesBatch('token', ['t1', 't2', 't3']);
            expect(capturedUrl).toContain('ids=t1,t2,t3');
        });

        test('throws SpotifyUnauthenticatedError on 401', async () => {
            mockFetch(async () => createMockResponse(401, { error: 'Unauthorized' }));
            await expect(getAudioFeaturesBatch('bad-token', ['t1'])).rejects.toThrow(
                SpotifyUnauthenticatedError
            );
        });
    });
});
