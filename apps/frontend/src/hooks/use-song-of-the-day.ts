import useSWR from "swr";
import { fetcher } from "@/lib/api";

interface SongOfTheDayResponse {
    id: string | null;
    spotifyId: string | null;
    name: string;
    artist: string;
    artistSpotifyId: string | null;
    image: string | null;
    playCount: number;
    isFallback: boolean;
    context: string;
}

export function useSongOfTheDay() {
    const { data, error, isLoading } = useSWR<SongOfTheDayResponse>(
        "/me/stats/song-of-the-day",
        fetcher
    );

    return {
        track: data,
        image: data?.image || "",
        isLoading,
        isError: error,
    };
}
