"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { ProfileHeader } from "@/components/dashboard/profile/profile-header";
import { ListeningStats } from "@/components/dashboard/profile/listening-stats";
import { SettingsPanel } from "@/components/dashboard/profile/settings-panel";
import { useProfile, useListeningStats } from "@/hooks/use-profile";
import { LogOut } from "lucide-react";
import { LogoutConfirmationDialog } from "@/components/ui/logout-confirmation-dialog";
import * as React from "react";

export default function ProfilePage() {
    const { profile, isLoading: profileLoading, isError: profileError } = useProfile();
    const { stats, formattedTime, isLoading: statsLoading } = useListeningStats();
    const [isLogoutOpen, setIsLogoutOpen] = React.useState(false);

    if (profileLoading) {
        return (
            <AppLayout>
                <div className="container mx-auto px-6 pt-8 pb-20">
                    <div className="animate-pulse space-y-6">
                        <div className="h-40 bg-zinc-800 rounded-2xl" />
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-24 bg-zinc-800 rounded-xl" />
                            ))}
                        </div>
                        <div className="h-80 bg-zinc-800 rounded-xl" />
                    </div>
                </div>
            </AppLayout>
        );
    }

    if (profileError || !profile) {
        return (
            <AppLayout>
                <div className="container mx-auto px-6 pt-8 pb-20">
                    <div className="text-center py-20">
                        <h1 className="text-2xl font-bold text-white mb-4">Unable to load profile</h1>
                        <p className="text-zinc-400">Please try refreshing the page.</p>
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="container mx-auto px-6 pt-8 pb-20 space-y-8">
                {/* Profile Header */}
                <ProfileHeader
                    displayName={profile.displayName}
                    spotifyId={profile.spotifyId}
                    imageUrl={profile.imageUrl}
                    country={profile.country}
                    memberSince={profile.createdAt}
                />

                {/* Listening Stats */}
                {!statsLoading && stats && (
                    <ListeningStats
                        totalPlays={stats.totalPlays}
                        formattedTime={formattedTime}
                        uniqueTracks={stats.uniqueTracks}
                        uniqueArtists={stats.uniqueArtists}
                    />
                )}

                {/* Settings Panel */}
                <SettingsPanel />

                {/* Account Actions */}
                <div className="pt-6 border-t border-zinc-800">
                    <button
                        onClick={() => setIsLogoutOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        <span>Sign Out</span>
                    </button>
                </div>

                <LogoutConfirmationDialog isOpen={isLogoutOpen} onClose={() => setIsLogoutOpen(false)} />
            </div>
        </AppLayout>
    );
}
