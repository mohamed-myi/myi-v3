import { EndsongRecord, ParsedImportEvent } from '../types/import';

const MIN_PLAY_MS = 5000;       // Minimum 5 seconds to import
const SKIP_THRESHOLD_MS = 30000; // < 30s flagged as skip

// Validate and parse a single endsong record
export function parseEndsongRecord(
    record: EndsongRecord
): ParsedImportEvent | null {
    // Must be a track (not podcast)
    if (!record.spotify_track_uri?.startsWith('spotify:track:')) {
        return null;
    }

    // Must have minimum play time
    if (record.ms_played < MIN_PLAY_MS) {
        return null;
    }

    // Must have metadata
    if (!record.master_metadata_track_name ||
        !record.master_metadata_album_artist_name) {
        return null;
    }

    // Extract Spotify ID from URI
    const trackSpotifyId = record.spotify_track_uri.replace('spotify:track:', '');

    // Calculate start time from end time
    const endTime = new Date(record.ts);
    const playedAt = new Date(endTime.getTime() - record.ms_played);

    return {
        trackUri: record.spotify_track_uri,
        trackSpotifyId,
        playedAt,
        msPlayed: record.ms_played,
        isSkip: record.ms_played < SKIP_THRESHOLD_MS,
        trackName: record.master_metadata_track_name,
        artistName: record.master_metadata_album_artist_name,
        albumName: record.master_metadata_album_album_name ?? 'Unknown Album',
    };
}
