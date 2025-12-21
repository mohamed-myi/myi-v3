"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { X, LogOut } from "lucide-react";

interface LogoutConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export function LogoutConfirmationDialog({ isOpen, onClose }: LogoutConfirmationDialogProps) {
    const router = useRouter();
    const [isLoggingOut, setIsLoggingOut] = React.useState(false);

    const handleLogout = async () => {
        setIsLoggingOut(true);
        try {
            await api.post("/auth/logout");
            // Clear all SWR cache to prevent stale user data
            await mutate(() => true, undefined, { revalidate: false });
            router.push("/");
        } catch (err) {
            console.error("Logout failed", err);
        } finally {
            setIsLoggingOut(false);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
            {/* Backdrop - Glassmorphic */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Dialog - Glassmorphic */}
            <div className="relative max-w-sm w-full backdrop-blur-2xl bg-gradient-to-b from-white/10 to-white/5 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-400/30 flex items-center justify-center">
                            <LogOut className="w-5 h-5 text-red-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-white">
                            Logout
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 rounded-full backdrop-blur-md bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center transition-all"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-white/70">
                        Are you sure you want to sign out of your account?
                    </p>
                </div>

                {/* Footer Actions */}
                <div className="flex gap-3 p-6 pt-0">
                    <button
                        onClick={onClose}
                        disabled={isLoggingOut}
                        className="flex-1 px-4 py-3 rounded-xl backdrop-blur-md bg-white/10 hover:bg-white/20 border border-white/20 text-sm font-medium text-white transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="flex-1 px-4 py-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-sm font-medium text-red-400 transition-all disabled:opacity-50"
                    >
                        {isLoggingOut ? "Signing out..." : "Sign Out"}
                    </button>
                </div>
            </div>
        </div>
    );
}
