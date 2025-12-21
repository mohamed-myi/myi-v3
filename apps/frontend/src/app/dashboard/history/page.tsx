"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { useRecentHistory } from "@/hooks/use-dashboard";
import { useState, useMemo } from "react";
import { ItemModal } from "@/components/dashboard/item-modal";
import Image from "next/image";

interface HistoryItem {
    id: string;
    name: string;
    artist: string;
    image?: string;
    playedAt: string;
    spotifyId?: string;
    artistSpotifyId?: string;
}

interface Section {
    title: string;
    items: HistoryItem[];
}

// Helper to check same day
const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
};

export default function HistoryPage() {
    const { history, isLoading, isError } = useRecentHistory(200);
    const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

    const groupedHistory = useMemo<Section[]>(() => {
        if (!history) return [];

        const sections: Section[] = [
            { title: "Today", items: [] },
            { title: "Yesterday", items: [] },
            { title: "Earlier this Month", items: [] },
            { title: "Older", items: [] }
        ];

        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);

        history.forEach((item: HistoryItem) => {
            const playedAt = new Date(item.playedAt);

            if (isSameDay(playedAt, now)) {
                sections[0].items.push(item);
            } else if (isSameDay(playedAt, yesterday)) {
                sections[1].items.push(item);
            } else if (playedAt.getMonth() === now.getMonth() && playedAt.getFullYear() === now.getFullYear()) {
                sections[2].items.push(item);
            } else {
                sections[3].items.push(item);
            }
        });

        return sections.filter(s => s.items.length > 0);
    }, [history]);

    return (
        <AppLayout>
            <div className="min-h-screen">
                <div className="w-[95%] max-w-[1920px] mx-auto px-4 md:px-6 py-8 md:py-16">
                    {/* Page Title - Large purple accent */}
                    <h1 className="text-5xl md:text-6xl tracking-tight text-purple-300 font-bold mb-8">
                        History
                    </h1>

                    {/* Loading State */}
                    {isLoading && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className="backdrop-blur-md bg-white/5 border border-white/10 rounded-lg p-4 animate-pulse">
                                    <div className="aspect-square rounded-md bg-white/10 mb-4" />
                                    <div className="h-4 bg-white/10 rounded mb-2" />
                                    <div className="h-3 bg-white/5 rounded w-2/3" />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Error State */}
                    {isError && (
                        <div className="backdrop-blur-md bg-red-500/10 border border-red-400/30 rounded-xl p-6 text-center">
                            <p className="text-red-300">Failed to load history. Please try again later.</p>
                        </div>
                    )}

                    {/* Empty State */}
                    {!isLoading && !isError && groupedHistory.length === 0 && (
                        <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-xl p-12 text-center">
                            <p className="text-white/60">No listening history found.</p>
                        </div>
                    )}

                    {/* History Sections */}
                    {!isLoading && groupedHistory.length > 0 && (
                        <div className="space-y-12">
                            {groupedHistory.map((section) => (
                                <section key={section.title}>
                                    {/* Section Header - Purple accent */}
                                    <h2 className="text-purple-200 text-xl font-medium mb-6">
                                        {section.title}
                                    </h2>

                                    {/* Cards Grid - 6 columns on desktop */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                        {section.items.map((item) => (
                                            <div
                                                key={item.id}
                                                className="group cursor-pointer"
                                                onClick={() => setSelectedItem(item)}
                                            >
                                                {/* Glassmorphic Card */}
                                                <div className="backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-4 transition-all duration-300 hover:scale-105 shadow-xl">
                                                    {/* Album Art */}
                                                    <div className="relative mb-4">
                                                        <div className="aspect-square rounded-md overflow-hidden bg-white/5">
                                                            {item.image ? (
                                                                <Image
                                                                    src={item.image}
                                                                    alt={item.name}
                                                                    fill
                                                                    className="object-cover"
                                                                    unoptimized
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full bg-white/10" />
                                                            )}
                                                        </div>
                                                        {/* Explicit Badge (simulated for some tracks) */}
                                                        {item.name.length % 4 === 0 && (
                                                            <div className="absolute top-2 right-2">
                                                                <span className="px-1.5 py-0.5 rounded backdrop-blur-md bg-black/60 border border-white/20 text-[10px] font-medium">
                                                                    E
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Track Info */}
                                                    <div>
                                                        <p className="text-sm truncate mb-1 text-white group-hover:text-purple-300 transition-colors">
                                                            {item.name}
                                                        </p>
                                                        <p className="text-xs text-white/50 truncate">
                                                            {item.artist}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <ItemModal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                item={selectedItem}
            />
        </AppLayout>
    );
}
