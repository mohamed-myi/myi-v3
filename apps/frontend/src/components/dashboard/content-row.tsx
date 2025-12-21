"use client";

import { useState } from "react";
import { ChevronRight, RefreshCw } from "lucide-react";
import Image from "next/image";

interface ContentItem {
    id: string;
    name: string;
    image?: string;
    artist?: string;
    spotifyId?: string;
    artistSpotifyId?: string;
}

interface ContentRowProps {
    title: string;
    items: ContentItem[];
    type: "track" | "artist" | "wide";
    showTimeRange?: boolean;
    selectedRange?: string;
    showRank?: boolean;
    onRangeChange?: (range: string) => void;
    onItemClick?: (item: ContentItem) => void;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    hasImportedHistory?: boolean;
}

export function ContentRow({
    title,
    items,
    type,
    showTimeRange = false,
    selectedRange = "year",
    showRank = false,
    onRangeChange,
    onItemClick,
    onRefresh,
    isRefreshing = false,
    hasImportedHistory = false
}: ContentRowProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const baseRanges = [
        { label: "Last 4 Weeks", value: "4weeks" },
        { label: "Last 6 Months", value: "6months" },
        { label: "Last 1 Year", value: "year" }
    ];
    const ranges = hasImportedHistory
        ? [...baseRanges, { label: "All Time", value: "alltime" }]
        : baseRanges;

    const currentLabel = ranges.find(r => r.value === selectedRange)?.label || "Last 1 Year";

    return (
        <div className="w-[95%] max-w-[1920px] mx-auto px-4 md:px-6 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    {/* Section Title - Purple accent */}
                    <h2 className="text-purple-300 text-xl font-medium">
                        {title}
                    </h2>

                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            className="p-1.5 rounded-full text-white/40 hover:text-white/70 disabled:opacity-50 transition-colors"
                            title="Refresh data"
                        >
                            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>

                {/* Time Range Selector */}
                {showTimeRange && (
                    <div className="relative">
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="text-white/60 hover:text-white text-sm transition-colors flex items-center gap-1"
                        >
                            {currentLabel}
                            <ChevronRight className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-90' : ''}`} />
                        </button>

                        {isDropdownOpen && (
                            <>
                                {/* Backdrop to close dropdown */}
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setIsDropdownOpen(false)}
                                />
                                {/* Dropdown - Glassmorphic */}
                                <div className="absolute top-full right-0 mt-2 w-40 backdrop-blur-xl bg-white/10 border border-white/20 rounded-lg shadow-xl z-50 overflow-hidden">
                                    {ranges.map((range) => (
                                        <button
                                            key={range.value}
                                            onClick={() => {
                                                onRangeChange?.(range.value);
                                                setIsDropdownOpen(false);
                                            }}
                                            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/10 transition-colors ${selectedRange === range.value ? 'text-purple-300' : 'text-white/70'
                                                }`}
                                        >
                                            {range.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Grid Layout - Responsive */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {items.map((item, i) => (
                    <div
                        key={item.id}
                        className="group cursor-pointer"
                        onClick={() => onItemClick?.(item)}
                    >
                        {/* Glassmorphic Card */}
                        <div className="backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-4 transition-all duration-300 hover:scale-105 shadow-xl">
                            {/* Image Container */}
                            <div className="relative mb-4">
                                {type === "artist" ? (
                                    // Circular for artists
                                    <div className="aspect-square rounded-full overflow-hidden bg-white/5 border-2 border-white/10">
                                        <div className="relative w-full h-full">
                                            <Image
                                                src={item.image || '/placeholder.png'}
                                                alt={item.name}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    // Square for tracks
                                    <div className="aspect-square rounded-md overflow-hidden bg-white/5">
                                        <div className="relative w-full h-full">
                                            <Image
                                                src={item.image || '/placeholder.png'}
                                                alt={item.name}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* TOP Badge for #1 Artist */}
                                {type === "artist" && i === 0 && (
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                                        <span className="px-2 py-0.5 rounded backdrop-blur-md bg-green-500/30 border border-green-400/40 text-[10px] text-green-200 font-medium">
                                            TOP
                                        </span>
                                    </div>
                                )}

                                {/* Explicit Badge for tracks (simulated) */}
                                {type !== "artist" && i % 3 === 0 && (
                                    <div className="absolute top-2 right-2">
                                        <span className="px-1.5 py-0.5 rounded backdrop-blur-md bg-black/60 border border-white/20 text-[10px] font-medium">
                                            E
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Text Content */}
                            <div>
                                <p className="text-sm truncate mb-1 text-white">{item.name}</p>
                                {type === "artist" && showRank ? (
                                    <p className="text-xs text-purple-400">Rank #{i + 1}</p>
                                ) : item.artist ? (
                                    <p className="text-xs text-white/50 truncate">{item.artist}</p>
                                ) : showRank ? (
                                    <p className="text-xs text-white/40">#{i + 1}</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
