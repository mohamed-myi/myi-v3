import { JobStatus } from '@prisma/client';

export interface EndsongRecord {
    ts: string;
    ms_played: number;
    spotify_track_uri: string | null;
    master_metadata_track_name: string | null;
    master_metadata_album_artist_name: string | null;
    master_metadata_album_album_name: string | null;
    skipped: boolean | null;
    offline: boolean | null;
    reason_start: string | null;
    reason_end: string | null;
}

export interface ParsedImportEvent {
    trackUri: string;
    trackSpotifyId: string;
    playedAt: Date;
    msPlayed: number;
    isSkip: boolean;
    trackName: string;
    artistName: string;
    albumName: string;
}

export interface ImportProgress {
    status: JobStatus;
    totalRecords: number;
    processedRecords: number;
    addedRecords: number;
    skippedRecords: number;
    errorMessage?: string;
}
