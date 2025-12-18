import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { UserProfile, Artist, Track } from "@/lib/types";

export function useUser() {
    const { data, error, isLoading } = useSWR<UserProfile>("/auth/me", fetcher, {
        shouldRetryOnError: false,
    });

    return {
        user: data,
        isLoading,
        isError: error,
        isAuthenticated: !!data,
    };
}

export function useTopArtists(range: string = "4weeks") {
    const { data, error, isLoading } = useSWR<Artist[]>(`/me/stats/top/artists?range=${range}`, fetcher);

    // Backend returns Spotify's actual top artists with rank
    const mappedData = data?.map((item: any, index: number) => ({
        id: item.id,
        spotifyId: item.spotifyId,
        name: item.name,
        image: item.imageUrl || "",
        rank: item.rank || index + 1,
    }));

    return {
        artists: mappedData,
        isLoading,
        isError: error,
    };
}

export function useTopTracks(range: string = "4weeks") {
    const { data, error, isLoading } = useSWR<any[]>(`/me/stats/top/tracks?range=${range}`, fetcher);

    // Backend returns Spotify's actual top tracks with rank
    const mappedData = data?.map((item: any, index: number) => ({
        id: item.id,
        spotifyId: item.spotifyId,
        name: item.name,
        artist: item.artists?.[0]?.artist?.name || "Unknown",
        artistSpotifyId: item.artists?.[0]?.artist?.spotifyId,
        album: item.album?.name || "Unknown Album",
        image: item.album?.imageUrl || "",
        rank: item.rank || index + 1,
    }));

    return {
        tracks: mappedData,
        isLoading,
        isError: error,
    };
}

export function useRecentHistory(limit: number = 50) {
    const { data, error, isLoading } = useSWR<any>(`/me/history?limit=${limit}`, fetcher);

    const mappedData = data?.events?.map((event: any) => ({
        id: event.id,
        spotifyId: event.track.spotifyId,
        name: event.track.name,
        artist: event.track.artists[0]?.artist.name || "Unknown",
        artistSpotifyId: event.track.artists[0]?.artist.spotifyId,
        image: event.track.album?.imageUrl || "",
        playedAt: event.playedAt
    }));

    return {
        history: mappedData,
        isLoading,
        isError: error
    };
}
