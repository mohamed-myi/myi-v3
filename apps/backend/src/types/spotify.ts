export interface SpotifyErrorResponse {
    error: string;
    error_description?: string;
}

export interface SpotifyTokenResponse {
    access_token: string;
    token_type: string;
    scope: string;
    expires_in: number;
    refresh_token?: string;
}

export interface SpotifyImage {
    url: string;
    height: number;
    width: number;
}

export interface SpotifyUserProfile {
    id: string;
    display_name: string | null;
    email: string;
    country: string;
    images: SpotifyImage[];
}

export interface SpotifyRecentlyPlayedResponse {
    items: {
        track: SpotifyTrack;
        played_at: string;
    }[];
    cursors?: {
        after: string;
        before: string;
    };
}

export interface SpotifyTrack {
    id: string;
    name: string;
    duration_ms: number;
    preview_url: string | null;
    album: SpotifyAlbum;
    artists: SpotifyArtist[];
    popularity?: number;
    explicit?: boolean;
}

export interface SpotifyAlbum {
    id: string;
    name: string;
    images: SpotifyImage[];
    release_date: string;
}

export interface SpotifyArtist {
    id: string;
    name: string;
}

export interface SpotifyPlayContext {
    type: 'album' | 'artist' | 'playlist';
    href: string;
    uri: string;
}

export interface SpotifyFullArtist {
    id: string;
    name: string;
    images: SpotifyImage[];
    genres: string[];
    popularity: number;
}

export interface SpotifyArtistsBatchResponse {
    artists: SpotifyFullArtist[];
}

export interface SpotifyPaginatedResponse<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
}

export type SpotifyTopTracksResponse = SpotifyPaginatedResponse<SpotifyTrack>;

export type SpotifyTopArtistsResponse = SpotifyPaginatedResponse<SpotifyFullArtist>;

export interface SpotifyTracksBatchResponse {
    tracks: SpotifyTrack[];
}

export interface SpotifyAlbumsBatchResponse {
    albums: SpotifyAlbum[];
}

// Playlist types

export interface SpotifyPlaylistOwner {
    id: string;
    display_name: string | null;
    type: 'user';
    uri: string;
}

export interface SpotifyPlaylistSimple {
    id: string;
    name: string;
    description: string | null;
    images: SpotifyImage[];
    owner: SpotifyPlaylistOwner;
    public: boolean | null;
    tracks: {
        total: number;
        href: string;
    };
    uri: string;
    snapshot_id: string;
}

export interface SpotifyPlaylistFull extends SpotifyPlaylistSimple {
    followers: {
        total: number;
    };
}

export interface SpotifyPlaylistTrackItem {
    added_at: string | null;
    added_by: SpotifyPlaylistOwner | null;
    is_local: boolean;
    track: SpotifyTrack | null;
}

export interface SpotifyPlaylistTracksResponse {
    items: SpotifyPlaylistTrackItem[];
    total: number;
    limit: number;
    offset: number;
    next: string | null;
    previous: string | null;
}

export type SpotifyUserPlaylistsResponse = SpotifyPaginatedResponse<SpotifyPlaylistSimple>;

export interface SpotifyCreatePlaylistResponse extends SpotifyPlaylistFull {
    external_urls: {
        spotify: string;
    };
}

export interface SpotifyAddTracksResponse {
    snapshot_id: string;
}
