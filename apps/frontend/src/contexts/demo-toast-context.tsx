'use client';

import * as React from 'react';
import { Sparkles, X, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DemoToastContextType {
    showDemoToast: () => void;
}

const DemoToastContext = React.createContext<DemoToastContextType | null>(null);

export function useDemoToast() {
    const context = React.useContext(DemoToastContext);
    if (!context) {
        throw new Error('useDemoToast must be used within DemoToastProvider');
    }
    return context;
}

export function DemoToastProvider({ children }: { children: React.ReactNode }) {
    const [isVisible, setIsVisible] = React.useState(false);

    const showDemoToast = React.useCallback(() => {
        setIsVisible(true);
        // Auto-hide after 5 seconds
        setTimeout(() => setIsVisible(false), 5000);
    }, []);

    // Listen for demo-mode-blocked events from API interceptor
    React.useEffect(() => {
        const handleDemoBlocked = () => showDemoToast();
        window.addEventListener('demo-mode-blocked', handleDemoBlocked);
        return () => window.removeEventListener('demo-mode-blocked', handleDemoBlocked);
    }, [showDemoToast]);

    return (
        <DemoToastContext.Provider value={{ showDemoToast }}>
            {children}
            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 50 }}
                        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-4"
                    >
                        <div className="backdrop-blur-2xl bg-gradient-to-r from-mint-950/95 to-mint-900/95 border border-mint-500/30 rounded-2xl shadow-2xl shadow-mint-500/20 p-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-mint-500/20 flex items-center justify-center flex-shrink-0">
                                    <Sparkles className="w-5 h-5 text-mint-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white">
                                        Demo Mode
                                    </p>
                                    <p className="text-xs text-white/60 mt-0.5">
                                        This action is disabled in demo mode. Sign in with Spotify to unlock all features.
                                    </p>
                                    <a
                                        href="/api/auth/login"
                                        className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-mint-500/20 hover:bg-mint-500/30 rounded-full text-xs font-medium text-mint-300 transition-colors"
                                    >
                                        <LogIn className="w-3 h-3" />
                                        Sign in with Spotify
                                    </a>
                                </div>
                                <button
                                    onClick={() => setIsVisible(false)}
                                    className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </DemoToastContext.Provider>
    );
}
