export interface EndsongRecord {
    ts: string;                              // End timestamp (UTC)
    ms_played: number;
    spotify_track_uri: string | null;        // null for podcasts
    master_metadata_track_name: string | null;
    master_metadata_album_artist_name: string | null;
    master_metadata_album_album_name: string | null;
    skipped: boolean | null;
    offline: boolean | null;
    reason_start: string | null;
    reason_end: string | null;
}

export interface ParsedImportEvent {
    trackUri: string;                        // spotify:track:ABC123
    trackSpotifyId: string;                  // ABC123 (extracted)
    playedAt: Date;                          // Calculated: ts - ms_played
    msPlayed: number;
    isSkip: boolean;
    trackName: string;
    artistName: string;
    albumName: string;
}

export interface ImportProgress {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    totalRecords: number;
    processedRecords: number;
    addedRecords: number;
    skippedRecords: number;
    errorMessage?: string;
}
