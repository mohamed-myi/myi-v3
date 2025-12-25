import { Source } from '@prisma/client';

export interface EmbeddedAlbum {
    spotifyId: string,
    name: string,
    imageUrl: string | null,
    releaseDate: string | null,
}

export interface EmbeddedArtist {
    spotifyId: string,
    name: string,
}

export interface EmbeddedTrack {
    spotifyId: string,
    name: string,
    durationMs: number,
    previewUrl: string | null,
    album: EmbeddedAlbum,
    artists: EmbeddedArtist[],
}

export interface ParsedListeningEvent {
    spotifyTrackId: string,
    playedAt: Date,
    msPlayed: number,
    isEstimated: boolean,
    source: Source,
    track: EmbeddedTrack,
}

export interface ArtistMetadataJob {
    spotifyId: string,
    addedAt: Date,
}

export interface SyncSummary {
    added: number,
    skipped: number,
    updated: number,
    errors: number,
}

export interface InsertResultWithIds {
    status: 'added' | 'skipped' | 'updated',
    trackId: string,
    artistIds: string[],
    playedAt: Date,
    msPlayed: number,
}

export interface SyncContext {
    albumCache: Map<string, string>,
    artistCache: Map<string, string>,
    trackCache: Map<string, string>,
}

export function createSyncContext(): SyncContext {
    return {
        albumCache: new Map(),
        artistCache: new Map(),
        trackCache: new Map(),
    };
}
