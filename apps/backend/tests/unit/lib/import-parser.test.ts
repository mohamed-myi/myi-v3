import { parseEndsongRecord } from '@/lib/import-parser';
import { EndsongRecord } from '@/types/import';

describe('Import Parser', () => {
    const validRecord: EndsongRecord = {
        ts: '2023-10-27T10:05:00Z',
        ms_played: 300000, // 5 min
        spotify_track_uri: 'spotify:track:abc12345',
        master_metadata_track_name: 'Test Song',
        master_metadata_album_artist_name: 'Test Artist',
        master_metadata_album_album_name: 'Test Album',
        skipped: false,
        offline: false,
        reason_start: 'trackdone',
        reason_end: 'trackdone',
    };

    it('should parse a valid music record', () => {
        const result = parseEndsongRecord(validRecord);
        if (!result) throw new Error('Result should is null');

        expect(result.trackSpotifyId).toBe('abc12345');
        expect(result.trackName).toBe('Test Song');
        expect(result.artistName).toBe('Test Artist');
        expect(result.msPlayed).toBe(300000);
        expect(result.isSkip).toBe(false);

        expect(result.playedAt.toISOString()).toBe('2023-10-27T10:00:00.000Z');
    });

    it('should filter out podcasts (no spotify:track: uri)', () => {
        const podcastRecord = { ...validRecord, spotify_track_uri: 'spotify:episode:xyz' };
        const result = parseEndsongRecord(podcastRecord);
        expect(result).toBeNull();
    });

    it('should filter out short plays (< 5s)', () => {
        const shortRecord = { ...validRecord, ms_played: 4000 };
        const result = parseEndsongRecord(shortRecord);
        expect(result).toBeNull();
    });

    it('should flag skips (< 30s)', () => {
        const skipRecord = { ...validRecord, ms_played: 29000 };
        const result = parseEndsongRecord(skipRecord);
        if (!result) throw new Error('Result should is null');
        expect(result.isSkip).toBe(true);
    });

    it('should handle missing metadata gracefully', () => {
        const badRecord = { ...validRecord, master_metadata_track_name: null };
        const result = parseEndsongRecord(badRecord as any);
        expect(result).toBeNull();
    });
});
