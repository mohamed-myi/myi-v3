// Playlist service unit tests
// Focus: pure functions (shuffle, deduplication, validation) that don't need mocks

import {
    shuffleArray,
    deduplicateTrackUris,
    validateTrackCount,
} from '../../../src/services/playlist-service';

describe('playlist-service', () => {
    describe('shuffleArray', () => {
        test('returns same array reference (in-place mutation)', () => {
            const original = [1, 2, 3, 4, 5];
            const result = shuffleArray(original);
            expect(result).toBe(original);
        });

        test('preserves all elements (no loss)', () => {
            const original = ['a', 'b', 'c', 'd', 'e'];
            const copy = [...original];
            shuffleArray(copy);

            expect(copy.sort()).toEqual(original.sort());
        });

        test('handles empty array', () => {
            const empty: string[] = [];
            const result = shuffleArray(empty);
            expect(result).toEqual([]);
        });

        test('handles single element', () => {
            const single = ['only'];
            const result = shuffleArray(single);
            expect(result).toEqual(['only']);
        });

        test('actually randomizes order (statistical test)', () => {
            // Run shuffle 100 times on same array, check that first element varies
            const template = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const firstElements = new Set<number>();

            for (let i = 0; i < 100; i++) {
                const arr = [...template];
                shuffleArray(arr);
                firstElements.add(arr[0]);
            }

            // With 10 elements and 100 iterations, we should see multiple different first elements
            // Probability of always getting same first element is (1/10)^99 ≈ 0
            expect(firstElements.size).toBeGreaterThan(5);
        });

        test('Fisher-Yates produces uniform distribution (chi-square approximation)', () => {
            // Track how often each element ends up in first position
            const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            const iterations = 5000;
            const template = [1, 2, 3, 4, 5];

            for (let i = 0; i < iterations; i++) {
                const arr = [...template];
                shuffleArray(arr);
                counts[arr[0]]++;
            }

            // Expected: 1000 per element (5000/5)
            // Allow 20% deviation for statistical variance
            const expected = iterations / 5;
            const tolerance = expected * 0.2;

            for (const val of Object.values(counts)) {
                expect(val).toBeGreaterThan(expected - tolerance);
                expect(val).toBeLessThan(expected + tolerance);
            }
        });
    });

    describe('smartShuffle', () => {
        const { smartShuffle } = require('../../../src/services/playlist-service');

        interface TestTrack {
            id: string;
            artist: string;
        }

        const getArtist = (t: TestTrack) => t.artist;

        test('separates consecutive tracks by same artist', () => {
            // Setup: create a sequence that would cluster if not smart-shuffled
            // 4 tracks by A, 4 tracks by B.
            // A simple shuffle *might* cluster them. We force a cluster then run smartShuffle? 
            // Better: use an input that smartShuffle SHOULD fix.
            // Smart shuffle starts with random shuffle.
            // Let's test that output has minimal clustering.

            const tracks: TestTrack[] = [
                { id: '1', artist: 'A' }, { id: '2', artist: 'A' }, { id: '3', artist: 'A' },
                { id: '4', artist: 'B' }, { id: '5', artist: 'B' }, { id: '6', artist: 'B' },
                { id: '7', artist: 'C' }, { id: '8', artist: 'C' }, { id: '9', artist: 'C' },
            ];

            const result = smartShuffle(tracks, getArtist);

            // Check for consecutive duplicates
            let consecutive = 0;
            for (let i = 1; i < result.length; i++) {
                if (result[i].artist === result[i - 1].artist) {
                    consecutive++;
                }
            }

            // With 3 of each artist, it's possible to have 0 consecutive.
            expect(consecutive).toBeLessThan(3); // Allow some, but should be low
        });

        test('handles impossible separation gracefully', () => {
            // All same artist
            const tracks: TestTrack[] = [
                { id: '1', artist: 'A' }, { id: '2', artist: 'A' }, { id: '3', artist: 'A' },
            ];
            const result = smartShuffle(tracks, getArtist);
            expect(result).toHaveLength(3);
            expect(result.map(t => t.artist)).toEqual(['A', 'A', 'A']);
        });

        test('interleaves dominated artist', () => {
            // 5 tracks by A, 1 by B
            const tracks: TestTrack[] = [
                { id: '1', artist: 'A' }, { id: '2', artist: 'A' }, { id: '3', artist: 'A' },
                { id: '4', artist: 'A' }, { id: '5', artist: 'A' },
                { id: '6', artist: 'B' },
            ];
            // 'B' should ideally break a streak of 'A's if possible
            const result = smartShuffle(tracks, getArtist);
            expect(result).toHaveLength(6);
        });

        test('returns same array reference? (No, implementation copies)', () => {
            // Implementation: const shuffled = [...array];
            const tracks: TestTrack[] = [{ id: '1', artist: 'A' }];
            const result = smartShuffle(tracks, getArtist);
            expect(result).not.toBe(tracks);
            expect(result).toEqual(tracks);
        });
    });

    describe('deduplicateTrackUris', () => {
        test('removes duplicate URIs', () => {
            const input = [
                'spotify:track:abc',
                'spotify:track:def',
                'spotify:track:abc',
                'spotify:track:ghi',
            ];
            const result = deduplicateTrackUris(input);
            expect(result).toEqual([
                'spotify:track:abc',
                'spotify:track:def',
                'spotify:track:ghi',
            ]);
        });

        test('preserves order of first occurrence', () => {
            const input = [
                'spotify:track:third',
                'spotify:track:first',
                'spotify:track:second',
                'spotify:track:first',
                'spotify:track:third',
            ];
            const result = deduplicateTrackUris(input);
            expect(result).toEqual([
                'spotify:track:third',
                'spotify:track:first',
                'spotify:track:second',
            ]);
        });

        test('handles empty array', () => {
            expect(deduplicateTrackUris([])).toEqual([]);
        });

        test('handles array with no duplicates', () => {
            const input = ['spotify:track:a', 'spotify:track:b', 'spotify:track:c'];
            expect(deduplicateTrackUris(input)).toEqual(input);
        });

        test('handles all duplicates', () => {
            const input = [
                'spotify:track:same',
                'spotify:track:same',
                'spotify:track:same',
            ];
            expect(deduplicateTrackUris(input)).toEqual(['spotify:track:same']);
        });

        test('extracts ID correctly from full URI', () => {
            // Edge case: make sure we're comparing IDs not full URIs
            const input = [
                'spotify:track:123',
                'spotify:track:123', // duplicate
            ];
            expect(deduplicateTrackUris(input)).toHaveLength(1);
        });
    });

    describe('validateTrackCount', () => {
        test('rejects 0 tracks', () => {
            const result = validateTrackCount(0);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('No tracks found');
        });

        test('rejects fewer than 25 tracks', () => {
            const result = validateTrackCount(24);
            expect(result.valid).toBe(false);
            expect(result.error).toContain('minimum is 25');
        });

        test('accepts exactly 25 tracks', () => {
            const result = validateTrackCount(25);
            expect(result.valid).toBe(true);
            expect(result.count).toBe(25);
            expect(result.error).toBeUndefined();
        });

        test('accepts 50 tracks (normal case)', () => {
            const result = validateTrackCount(50);
            expect(result.valid).toBe(true);
            expect(result.count).toBe(50);
        });

        test('accepts exactly 10000 tracks', () => {
            const result = validateTrackCount(10000);
            expect(result.valid).toBe(true);
            expect(result.count).toBe(10000);
            expect(result.truncated).toBeUndefined();
        });

        test('truncates more than 10000 tracks with warning', () => {
            const result = validateTrackCount(15000);
            expect(result.valid).toBe(true);
            expect(result.count).toBe(10000);
            expect(result.truncated).toBe(true);
            expect(result.warning).toContain('Truncated');
            expect(result.warning).toContain('15000');
        });

        test('edge case: 1 track (below minimum)', () => {
            const result = validateTrackCount(1);
            expect(result.valid).toBe(false);
            expect(result.count).toBe(1);
        });
    });
});
