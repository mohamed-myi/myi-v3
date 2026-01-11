'use client';

import { useDemoMode } from '@/hooks/use-demo-mode';
import { Sparkles, LogIn } from 'lucide-react';

export function DemoBanner() {
    const { isDemo, isLoading } = useDemoMode();

    if (isLoading || !isDemo) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md border-b border-mint-500/30 py-2 px-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-mint-400">
                    <Sparkles className="w-4 h-4" />
                    <span>You are viewing demo data</span>
                </div>
                <a
                    href="/api/auth/login"
                    className="flex items-center gap-1.5 px-3 py-1 bg-mint-500/20 hover:bg-mint-500/30 rounded-full text-xs font-medium text-mint-300 transition-colors"
                >
                    <LogIn className="w-3 h-3" />
                    Sign in with Spotify
                </a>
            </div>
        </div>
    );
}
