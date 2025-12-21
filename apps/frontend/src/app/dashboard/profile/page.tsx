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
                <div className="min-h-screen">
                    <div className="w-[95%] max-w-[1920px] mx-auto px-4 md:px-6 py-8">
                        <div className="animate-pulse space-y-6">
                            <div className="h-40 bg-white/5 rounded-2xl" />
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="h-24 bg-white/5 rounded-xl" />
                                ))}
                            </div>
                            <div className="h-80 bg-white/5 rounded-2xl" />
                        </div>
                    </div>
                </div>
            </AppLayout>
        );
    }

    if (profileError || !profile) {
        return (
            <AppLayout>
                <div className="min-h-screen">
                    <div className="w-[95%] max-w-[1920px] mx-auto px-4 md:px-6 py-8">
                        <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                            <h1 className="text-2xl font-bold text-white mb-4">Unable to load profile</h1>
                            <p className="text-white/50">Please try refreshing the page.</p>
                        </div>
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout>
            <div className="min-h-screen">
                <div className="w-[95%] max-w-[1920px] mx-auto px-4 md:px-6 py-8 space-y-8">
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
                    <div className="pt-6 border-t border-white/10">
                        <button
                            onClick={() => setIsLogoutOpen(true)}
                            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-400/30 text-red-400 transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>Sign Out</span>
                        </button>
                    </div>

                    <LogoutConfirmationDialog isOpen={isLogoutOpen} onClose={() => setIsLogoutOpen(false)} />
                </div>
            </div>
        </AppLayout>
    );
}
