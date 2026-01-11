// Playlist service - contains business logic extracted from the worker.
// The worker calls these functions; tests can call them directly with mocked dependencies.

import { prisma } from '../lib/prisma';
import { getPlaylistTracks } from '../lib/spotify-api';
import type { PlaylistCreationMethod } from '@prisma/client';

// Fisher-Yates shuffle - in-place, O(n) time, O(1) space
// Returns the same array reference, mutated
export function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Smart shuffle - Fisher-Yates + artist spreading to reduce repetition
// First does random shuffle, then spreads out same-artist songs
export function smartShuffle<T>(array: T[], getArtist: (item: T) => string): T[] {
    const shuffled = [...array];

    // Fisher-Yates
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Spread out same-artist songs
    for (let i = 1; i < shuffled.length - 1; i++) {
        if (getArtist(shuffled[i]) === getArtist(shuffled[i - 1])) {
            // Find a different artist to swap with
            for (let j = i + 1; j < shuffled.length; j++) {
                if (getArtist(shuffled[j]) !== getArtist(shuffled[i - 1])) {
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    break;
                }
            }
        }
    }
    return shuffled;
}

// Deduplicates track URIs by spotify ID, preserving order of first occurrence
export function deduplicateTrackUris(trackUris: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const uri of trackUris) {
        const id = uri.split(':').pop() || uri;
        if (!seen.has(id)) {
            seen.add(id);
            result.push(uri);
        }
    }

    return result;
}

// Validates track count against minimum/maximum requirements
export interface TrackCountValidation {
    valid: boolean;
    count: number;
    error?: string;
    warning?: string;
    truncated?: boolean;
}

export function validateTrackCount(count: number): TrackCountValidation {
    if (count === 0) {
        return { valid: false, count, error: 'No tracks found for playlist' };
    }

    if (count < 25) {
        return { valid: false, count, error: `Only ${count} tracks found; minimum is 25` };
    }

    if (count > 10000) {
        return {
            valid: true,
            count: 10000,
            warning: `Truncated from ${count} to 10,000 tracks (Spotify limit)`,
            truncated: true,
        };
    }

    return { valid: true, count };
}

// Resolves track URIs for shuffle method - fetches all tracks from source playlist
export async function resolveShuffleTracks(
    accessToken: string,
    sourcePlaylistId: string
): Promise<string[]> {
    const trackUris: string[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const response = await getPlaylistTracks(accessToken, sourcePlaylistId, 100, offset);
        const validTracks = response.items
            .filter(item => item.track && !item.is_local)
            .map(item => `spotify:track:${item.track!.id}`);
        trackUris.push(...validTracks);

        hasMore = response.next !== null;
        offset += 100;
    }

    return shuffleArray(trackUris);
}

// Resolves track URIs for top-50 methods
export async function resolveTop50Tracks(
    userId: string,
    method: Extract<PlaylistCreationMethod, 'TOP_50_SHORT' | 'TOP_50_MEDIUM' | 'TOP_50_LONG'>
): Promise<string[]> {
    const termMap = {
        TOP_50_SHORT: 'SHORT_TERM',
        TOP_50_MEDIUM: 'MEDIUM_TERM',
        TOP_50_LONG: 'LONG_TERM',
    } as const;
    const term = termMap[method];

    const topTracks = await prisma.spotifyTopTrack.findMany({
        where: { userId, term },
        include: { track: true },
        orderBy: { rank: 'asc' },
        take: 50,
    });

    return topTracks.map(t => `spotify:track:${t.track.spotifyId}`);
}

// Resolves track URIs for all-time top 50 - based on play count
export async function resolveAllTimeTop50Tracks(userId: string): Promise<string[]> {
    const topStats = await prisma.userTrackStats.findMany({
        where: { userId },
        include: { track: true },
        orderBy: [
            { playCount: 'desc' },
            { totalMs: 'desc' },
        ],
        take: 50,
    });

    return topStats.map(s => `spotify:track:${s.track.spotifyId}`);
}

// Resolves track URIs for recent listening - deduplicates by track
export async function resolveRecentTracks(
    userId: string,
    kValue: number,
    startDate?: Date,
    endDate?: Date
): Promise<string[]> {
    const where: {
        userId: string;
        playedAt?: { gte?: Date; lte?: Date };
    } = { userId };

    if (startDate || endDate) {
        where.playedAt = {};
        if (startDate) where.playedAt.gte = startDate;
        if (endDate) where.playedAt.lte = endDate;
    }

    // Fetch more events than needed to account for duplicates
    const events = await prisma.listeningEvent.findMany({
        where,
        include: { track: true },
        orderBy: { playedAt: 'desc' },
        take: kValue * 3,
    });

    // Deduplicate by track spotifyId, preserving order
    const seenIds = new Set<string>();
    const trackUris: string[] = [];

    for (const event of events) {
        if (!seenIds.has(event.track.spotifyId) && trackUris.length < kValue) {
            seenIds.add(event.track.spotifyId);
            trackUris.push(`spotify:track:${event.track.spotifyId}`);
        }
    }

    return trackUris;
}
