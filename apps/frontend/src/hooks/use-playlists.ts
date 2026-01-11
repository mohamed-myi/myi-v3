import useSWR from 'swr';
import { api } from '@/lib/api';

export interface PlaylistJob {
    id: string;
    name: string;
    status: 'PENDING' | 'CREATING' | 'ADDING_TRACKS' | 'UPLOADING_IMAGE' | 'COMPLETED' | 'FAILED';
    creationMethod: 'SHUFFLE' | 'TOP_50_SHORT' | 'TOP_50_MEDIUM' | 'TOP_50_LONG' | 'TOP_50_ALL_TIME' | 'TOP_K_RECENT';
    totalTracks: number;
    addedTracks: number;
    spotifyPlaylistUrl?: string;
    errorMessage?: string;
    createdAt: string;
}

export interface UserPlaylist {
    id: string;
    name: string;
    trackCount: number;
    imageUrl: string | null;
    isOwn: boolean;
}

export function usePlaylistJobs(limit = 10, offset = 0) {
    const { data, error, mutate } = useSWR<{ jobs: PlaylistJob[]; total: number }>(
        `/playlists/jobs?limit=${limit}&offset=${offset}`,
        async (url: string) => {
            const res = await api.get(url);
            return res.data;
        },
        {
            refreshInterval: 5000, // Poll every 5s for job updates
        }
    );

    return {
        jobs: data?.jobs || [],
        total: data?.total || 0,
        isLoading: !error && !data,
        isError: error,
        mutate,
    };
}

export function useUserPlaylists(limit = 50, offset = 0) {
    const { data, error, isLoading } = useSWR<{ playlists: UserPlaylist[] }>(
        `/playlists/user?limit=${limit}&offset=${offset}`,
        async (url: string) => {
            const res = await api.get(url);
            return res.data;
        }
    );

    return {
        playlists: data?.playlists || [],
        isLoading,
        isError: error,
    };
}

// Validation APIs
export async function validateShuffle(sourcePlaylistId: string, shuffleMode: string) {
    const res = await api.post('/playlists/validate/shuffle', { sourcePlaylistId, shuffleMode });
    return res.data;
}

export async function validateTop50(term: string) {
    const res = await api.post('/playlists/validate/top50', { term });
    return res.data;
}

export async function validateRecent(kValue: number, startDate?: string, endDate?: string) {
    const res = await api.post('/playlists/validate/recent', { kValue, startDate, endDate });
    return res.data;
}

export interface CreateShufflePayload {
    sourcePlaylistId: string;
    shuffleMode: string;
    isPublic?: boolean;
    name?: string;
    description?: string;
    confirmationToken?: string;
    coverImageBase64?: string;
}

export interface CreateTop50Payload {
    term: string;
    isPublic?: boolean;
    name?: string;
    description?: string;
    confirmationToken?: string;
    coverImageBase64?: string;
}

export interface CreateRecentPayload {
    kValue: number;
    startDate?: string;
    endDate?: string;
    isPublic?: boolean;
    name?: string;
    description?: string;
    confirmationToken?: string;
    coverImageBase64?: string;
}

// Creation APIs
export async function createShufflePlaylist(data: CreateShufflePayload) {
    const res = await api.post('/playlists/create/shuffle', data);
    return res.data;
}

export async function createTop50Playlist(data: CreateTop50Payload) {
    const res = await api.post('/playlists/create/top50', data);
    return res.data;
}

export async function createRecentPlaylist(data: CreateRecentPayload) {
    const res = await api.post('/playlists/create/recent', data);
    return res.data;
}
