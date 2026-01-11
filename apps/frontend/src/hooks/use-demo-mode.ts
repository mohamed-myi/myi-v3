'use client';

import { useUser } from './use-dashboard';

export function useDemoMode() {
    const { user, isLoading } = useUser();

    return {
        isDemo: user?.isDemo ?? false,
        isLoading,
    };
}
