"use client";

import * as React from "react";

// Extensible array of background modes
export const BACKGROUND_MODES = [
    { id: "top-artist", label: "Top Artist" },
    { id: "song-of-the-day", label: "Song of the Day" },
] as const;

export type BackgroundModeId = (typeof BACKGROUND_MODES)[number]["id"];

interface BackgroundModeContextValue {
    mode: BackgroundModeId;
    currentIndex: number;
    totalModes: number;
    currentLabel: string;
    next: () => void;
    previous: () => void;
}

const BackgroundModeContext = React.createContext<BackgroundModeContextValue | null>(null);

const STORAGE_KEY = "myi-background-mode";

export function BackgroundModeProvider({ children }: { children: React.ReactNode }) {
    const [currentIndex, setCurrentIndex] = React.useState(0);

    // Load from localStorage on mount
    React.useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const index = BACKGROUND_MODES.findIndex((m) => m.id === stored);
            if (index >= 0) {
                setCurrentIndex(index);
            }
        }
    }, []);

    // Persist to localStorage on change
    React.useEffect(() => {
        localStorage.setItem(STORAGE_KEY, BACKGROUND_MODES[currentIndex].id);
    }, [currentIndex]);

    const next = React.useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % BACKGROUND_MODES.length);
    }, []);

    const previous = React.useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + BACKGROUND_MODES.length) % BACKGROUND_MODES.length);
    }, []);

    const value: BackgroundModeContextValue = {
        mode: BACKGROUND_MODES[currentIndex].id,
        currentIndex,
        totalModes: BACKGROUND_MODES.length,
        currentLabel: BACKGROUND_MODES[currentIndex].label,
        next,
        previous,
    };

    return (
        <BackgroundModeContext.Provider value={value}>
            {children}
        </BackgroundModeContext.Provider>
    );
}

export function useBackgroundMode() {
    const context = React.useContext(BackgroundModeContext);
    if (!context) {
        throw new Error("useBackgroundMode must be used within BackgroundModeProvider");
    }
    return context;
}
