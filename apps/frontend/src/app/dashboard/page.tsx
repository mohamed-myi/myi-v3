
"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Hero } from "@/components/dashboard/hero";
import { ContentRow } from "@/components/dashboard/content-row";
import { ItemModal } from "@/components/dashboard/item-modal";
import { useTopArtists, useTopTracks, useRecentHistory } from "@/hooks/use-dashboard";

export default function DashboardPage() {
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [artistRange, setArtistRange] = useState("all");
    const [trackRange, setTrackRange] = useState("4weeks");

    const { artists: topArtists, isLoading: artistsLoading } = useTopArtists(artistRange);
    const { tracks: topTracks, isLoading: tracksLoading } = useTopTracks(trackRange);
    const { history: recentHistory, isLoading: historyLoading } = useRecentHistory(20);

    const close = () => setSelectedItem(null);

    return (
        <AppLayout>
            <div className="min-h-screen bg-background pb-20">

                <Hero
                    title={topArtists?.[0]?.name || "Loading..."}
                    subtitle="#1 All-Time Artist"
                    description="Your top artist across all time."
                    image={topArtists?.[0]?.image || ""}
                />

                <div className="-mt-32 relative z-20 space-y-8">
                    <ContentRow
                        title="Top Artists"
                        items={topArtists || []}
                        type="artist"
                        showTimeRange
                        selectedRange={artistRange}
                        showRank={true}
                        onRangeChange={setArtistRange}
                        onItemClick={setSelectedItem}
                    />

                    <ContentRow
                        title="Recently Played"
                        items={recentHistory || []}
                        type="wide"
                        onItemClick={setSelectedItem}
                    />

                    <ContentRow
                        title="Top Tracks"
                        items={topTracks || []}
                        type="wide"
                        showTimeRange
                        selectedRange={trackRange}
                        showRank={true}
                        onRangeChange={setTrackRange}
                        onItemClick={setSelectedItem}
                    />


                </div>
            </div>

            <ItemModal
                isOpen={!!selectedItem}
                onClose={close}
                item={selectedItem}
            />
        </AppLayout>
    );
}
