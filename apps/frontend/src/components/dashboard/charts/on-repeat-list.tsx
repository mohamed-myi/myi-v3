'use client';

import useSWR from 'swr';
import { api } from '@/lib/api';
import { Clock } from 'lucide-react';
import Image from 'next/image';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

function formatDuration(msStr: string | number) {
    const ms = typeof msStr === 'string' ? parseInt(msStr) : msStr;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

export function OnRepeatList() {
    const { data: tracks, isLoading } = useSWR('/me/stats/top/tracks?sortBy=time', fetcher);

    if (isLoading) {
        return (
            <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="h-[350px] w-full animate-pulse bg-white/5 rounded-xl" />
            </div>
        );
    }

    return (
        <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-white/10">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-400" />
                    <h3 className="text-xl font-semibold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
                        On Repeat
                    </h3>
                </div>
                <p className="text-white/50 text-sm mt-1">
                    Your favorite tracks by total time listened.
                </p>
            </div>

            {/* Track List */}
            <div className="p-6">
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                    {tracks?.slice(0, 50).map((track: { id: string; name: string; artists: { name: string }[]; album: { name: string; imageUrl: string }; totalMs: string; playCount: number }, i: number) => (
                        <div
                            key={track.id}
                            className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors group"
                        >
                            {/* Rank */}
                            <span className="text-lg font-bold text-white/30 w-6 text-center group-hover:text-orange-400 transition-colors">
                                {i + 1}
                            </span>

                            {/* Album Art */}
                            <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-white/5">
                                {track.album?.imageUrl && (
                                    <Image
                                        src={track.album.imageUrl}
                                        alt={track.album.name}
                                        fill
                                        sizes="40px"
                                        className="object-cover"
                                        unoptimized
                                    />
                                )}
                            </div>

                            {/* Track Info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-white truncate text-sm group-hover:text-orange-400 transition-colors">
                                    {track.name}
                                </p>
                                <p className="text-xs text-white/40 truncate">
                                    {track.artists?.map((a: { name?: string }) => a?.name).filter(Boolean).join(', ') || 'Unknown Artist'}
                                </p>
                            </div>

                            {/* Stats */}
                            <div className="text-right flex-shrink-0">
                                <span className="block font-mono text-sm font-semibold text-orange-400">
                                    {formatDuration(track.totalMs)}
                                </span>
                                <span className="text-xs text-white/30">
                                    {track.playCount} plays
                                </span>
                            </div>
                        </div>
                    ))}

                    {!tracks?.length && (
                        <div className="text-center text-white/40 py-8">
                            No listening history found yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
