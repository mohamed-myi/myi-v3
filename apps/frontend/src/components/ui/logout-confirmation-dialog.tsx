"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { mutate } from "swr";

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="relative bg-zinc-900 border border-white/10 rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl">
                <h2 className="text-lg font-semibold text-white mb-4">
                    Are you sure you want to logout?
                </h2>

                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        disabled={isLoggingOut}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                        No
                    </button>
                    <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="px-4 py-2 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors disabled:opacity-50"
                    >
                        {isLoggingOut ? "Logging out..." : "Yes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
