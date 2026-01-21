import { Source, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { queueArtistForMetadata } from '../lib/redis';
import type { ParsedListeningEvent, SyncSummary, InsertResultWithIds, SyncContext } from '../types/ingestion';

// Bulk catalog result containing ID maps for relationship linking
interface BulkCatalogResult {
    albumIdMap: Map<string, string>;
    artistIdMap: Map<string, string>;
    trackIdMap: Map<string, string>;
    trackArtistMap: Map<string, string[]>;
}

interface UniqueAlbum {
    spotifyId: string;
    name: string;
    imageUrl: string | null;
    releaseDate: string | null;
}

interface UniqueArtist {
    spotifyId: string;
    name: string;
}

interface UniqueTrack {
    spotifyId: string;
    name: string;
    durationMs: number;
    previewUrl: string | null;
    albumSpotifyId: string;
    artistSpotifyIds: string[];
}

/**
 * Bulk upsert all catalog entities (albums, artists, tracks) for a batch of events.
 * Uses createMany + findMany pattern to minimize queries regardless of batch size.
 */
async function bulkUpsertCatalog(events: ParsedListeningEvent[]): Promise<BulkCatalogResult> {
    // Collect unique entities from all events
    const uniqueAlbums = new Map<string, UniqueAlbum>();
    const uniqueArtists = new Map<string, UniqueArtist>();
    const uniqueTracks = new Map<string, UniqueTrack>();

    for (const event of events) {
        const { track } = event;

        if (!uniqueAlbums.has(track.album.spotifyId)) {
            uniqueAlbums.set(track.album.spotifyId, {
                spotifyId: track.album.spotifyId,
                name: track.album.name,
                imageUrl: track.album.imageUrl,
                releaseDate: track.album.releaseDate,
            });
        }

        for (const artist of track.artists) {
            if (!uniqueArtists.has(artist.spotifyId)) {
                uniqueArtists.set(artist.spotifyId, {
                    spotifyId: artist.spotifyId,
                    name: artist.name,
                });
            }
        }

        if (!uniqueTracks.has(track.spotifyId)) {
            uniqueTracks.set(track.spotifyId, {
                spotifyId: track.spotifyId,
                name: track.name,
                durationMs: track.durationMs,
                previewUrl: track.previewUrl,
                albumSpotifyId: track.album.spotifyId,
                artistSpotifyIds: track.artists.map(a => a.spotifyId),
            });
        }
    }

    // Bulk create missing entities
    if (uniqueAlbums.size > 0) {
        await prisma.album.createMany({
            data: Array.from(uniqueAlbums.values()),
            skipDuplicates: true,
        });
    }

    if (uniqueArtists.size > 0) {
        await prisma.artist.createMany({
            data: Array.from(uniqueArtists.values()),
            skipDuplicates: true,
        });
    }

    // Fetch album IDs
    const albumSpotifyIds = Array.from(uniqueAlbums.keys());
    const albumRecords = await prisma.album.findMany({
        where: { spotifyId: { in: albumSpotifyIds } },
        select: { id: true, spotifyId: true },
    });
    const albumIdMap = new Map(albumRecords.map(a => [a.spotifyId, a.id]));

    // Fetch artist IDs and queue those missing metadata
    const artistSpotifyIds = Array.from(uniqueArtists.keys());
    const artistRecords = await prisma.artist.findMany({
        where: { spotifyId: { in: artistSpotifyIds } },
        select: { id: true, spotifyId: true, imageUrl: true },
    });
    const artistIdMap = new Map(artistRecords.map(a => [a.spotifyId, a.id]));

    const artistsNeedingMetadata = artistRecords.filter(a => !a.imageUrl);
    await Promise.all(artistsNeedingMetadata.map(a => queueArtistForMetadata(a.spotifyId)));

    // Create tracks with album references
    if (uniqueTracks.size > 0) {
        await prisma.track.createMany({
            data: Array.from(uniqueTracks.values()).map(t => ({
                spotifyId: t.spotifyId,
                name: t.name,
                durationMs: t.durationMs,
                previewUrl: t.previewUrl,
                albumId: albumIdMap.get(t.albumSpotifyId) || null,
            })),
            skipDuplicates: true,
        });
    }

    // Fetch track IDs
    const trackSpotifyIds = Array.from(uniqueTracks.keys());
    const trackRecords = await prisma.track.findMany({
        where: { spotifyId: { in: trackSpotifyIds } },
        select: { id: true, spotifyId: true },
    });
    const trackIdMap = new Map(trackRecords.map(t => [t.spotifyId, t.id]));

    // Create track-artist relationships
    const trackArtistPairs: Array<{ trackId: string; artistId: string }> = [];
    const trackArtistMap = new Map<string, string[]>();

    for (const track of uniqueTracks.values()) {
        const trackId = trackIdMap.get(track.spotifyId);
        if (!trackId) continue;

        const artistIds: string[] = [];
        for (const artistSpotifyId of track.artistSpotifyIds) {
            const artistId = artistIdMap.get(artistSpotifyId);
            if (artistId) {
                trackArtistPairs.push({ trackId, artistId });
                artistIds.push(artistId);
            }
        }
        trackArtistMap.set(track.spotifyId, artistIds);
    }

    if (trackArtistPairs.length > 0) {
        await prisma.trackArtist.createMany({
            data: trackArtistPairs,
            skipDuplicates: true,
        });
    }

    return { albumIdMap, artistIdMap, trackIdMap, trackArtistMap };
}

/**
 * Insert multiple listening events in a single batch.
 * Returns summary statistics only.
 */
export async function insertListeningEvents(
    userId: string,
    events: ParsedListeningEvent[],
    _ctx?: SyncContext
): Promise<SyncSummary> {
    const { summary } = await insertListeningEventsWithIds(userId, events, _ctx);
    return summary;
}

/**
 * Insert multiple listening events with full result details.
 * Uses bulk operations for catalog entities and wraps event insertion in a transaction.
 */
export async function insertListeningEventsWithIds(
    userId: string,
    events: ParsedListeningEvent[],
    _ctx?: SyncContext
): Promise<{ summary: SyncSummary; results: InsertResultWithIds[] }> {
    if (events.length === 0) {
        return { summary: { added: 0, skipped: 0, updated: 0, errors: 0 }, results: [] };
    }

    const summary: SyncSummary = { added: 0, skipped: 0, updated: 0, errors: 0 };
    const results: InsertResultWithIds[] = [];

    try {
        const catalog = await bulkUpsertCatalog(events);

        // Build event keys with internal track IDs
        const eventKeys: Array<{
            trackSpotifyId: string;
            trackId: string;
            playedAt: Date;
            event: ParsedListeningEvent;
        }> = [];

        for (const event of events) {
            const trackId = catalog.trackIdMap.get(event.track.spotifyId);
            if (!trackId) {
                console.error('Track not found after bulk upsert:', event.track.spotifyId);
                summary.errors++;
                continue;
            }
            eventKeys.push({
                trackSpotifyId: event.track.spotifyId,
                trackId,
                playedAt: event.playedAt,
                event,
            });
        }

        // Batch fetch existing events for deduplication
        const existingEvents = await prisma.listeningEvent.findMany({
            where: {
                userId,
                OR: eventKeys.map(k => ({ trackId: k.trackId, playedAt: k.playedAt })),
            },
            select: { trackId: true, playedAt: true, isEstimated: true, source: true },
        });

        const existingMap = new Map(
            existingEvents.map(e => [`${e.trackId}:${e.playedAt.getTime()}`, e])
        );

        // Categorize events
        const toCreate: Array<Prisma.ListeningEventCreateManyInput> = [];
        const toUpdate: Array<{ trackId: string; playedAt: Date; msPlayed: number }> = [];

        for (const { trackSpotifyId, trackId, playedAt, event } of eventKeys) {
            const artistIds = catalog.trackArtistMap.get(trackSpotifyId) || [];
            const baseResult = { trackId, artistIds, playedAt, msPlayed: event.msPlayed };
            const key = `${trackId}:${playedAt.getTime()}`;
            const existing = existingMap.get(key);

            if (!existing) {
                toCreate.push({
                    userId,
                    trackId,
                    playedAt,
                    msPlayed: event.msPlayed,
                    isEstimated: event.isEstimated,
                    source: event.source,
                });
                results.push({ status: 'added', ...baseResult });
                summary.added++;
            } else if (event.source === Source.API) {
                results.push({ status: 'skipped', ...baseResult });
                summary.skipped++;
            } else if (existing.isEstimated && event.source === Source.IMPORT) {
                toUpdate.push({ trackId, playedAt, msPlayed: event.msPlayed });
                results.push({ status: 'updated', ...baseResult });
                summary.updated++;
            } else {
                results.push({ status: 'skipped', ...baseResult });
                summary.skipped++;
            }
        }

        // Execute writes atomically
        const totalAddedMs = toCreate.reduce((sum, e) => sum + e.msPlayed, 0);

        await prisma.$transaction(async (tx) => {
            if (toCreate.length > 0) {
                await tx.listeningEvent.createMany({ data: toCreate, skipDuplicates: true });
            }

            for (const update of toUpdate) {
                await tx.listeningEvent.update({
                    where: { userId_trackId_playedAt: { userId, trackId: update.trackId, playedAt: update.playedAt } },
                    data: { msPlayed: update.msPlayed, isEstimated: false, source: Source.IMPORT },
                });
            }

            if (toCreate.length > 0) {
                await tx.user.update({
                    where: { id: userId },
                    data: {
                        totalPlayCount: { increment: toCreate.length },
                        totalListeningMs: { increment: totalAddedMs },
                    },
                });
            }
        });

    } catch (error) {
        const isPartitionError = error instanceof Error && error.message.includes('no partition of relation');
        if (isPartitionError) throw error;

        console.error('Bulk insert failed:', error);
        summary.errors = events.length;
        summary.added = 0;
        summary.skipped = 0;
        summary.updated = 0;
        results.length = 0;
    }

    return { summary, results };
}
