import { prisma } from '../lib/prisma';
import { queueArtistForMetadata } from '../lib/redis';
import type { ParsedListeningEvent, SyncSummary, InsertResultWithIds } from '../types/ingestion';

async function upsertAlbum(
    album: ParsedListeningEvent['track']['album']
): Promise<string> {
    const result = await prisma.album.upsert({
        where: { spotifyId: album.spotifyId },
        create: {
            spotifyId: album.spotifyId,
            name: album.name,
            imageUrl: album.imageUrl,
            releaseDate: album.releaseDate,
        },
        update: {
            name: album.name,
            imageUrl: album.imageUrl,
        },
        select: { id: true },
    });
    return result.id;
}

async function upsertArtist(artist: {
    spotifyId: string;
    name: string;
}): Promise<string> {
    const existing = await prisma.artist.findUnique({
        where: { spotifyId: artist.spotifyId },
        select: { id: true, imageUrl: true },
    });

    if (existing) {
        // If missing metadata, queue for backfill
        if (!existing.imageUrl) {
            await queueArtistForMetadata(artist.spotifyId);
        }
        return existing.id;
    }

    const created = await prisma.artist.create({
        data: {
            spotifyId: artist.spotifyId,
            name: artist.name,
        },
        select: { id: true },
    });
    await queueArtistForMetadata(artist.spotifyId);
    return created.id;
}

async function upsertTrack(
    track: ParsedListeningEvent['track']
): Promise<{ trackId: string; artistIds: string[] }> {
    const albumId = await upsertAlbum(track.album);
    const artistIds = await Promise.all(track.artists.map(upsertArtist));

    const existing = await prisma.track.findUnique({
        where: { spotifyId: track.spotifyId },
        select: { id: true },
    });

    if (existing) {
        await prisma.track.update({
            where: { id: existing.id },
            data: {
                name: track.name,
                previewUrl: track.previewUrl,
            },
        });
        return { trackId: existing.id, artistIds };
    }

    const created = await prisma.track.create({
        data: {
            spotifyId: track.spotifyId,
            name: track.name,
            durationMs: track.durationMs,
            previewUrl: track.previewUrl,
            albumId,
            artists: {
                create: artistIds.map((artistId) => ({ artistId })),
            },
        },
        select: { id: true },
    });
    return { trackId: created.id, artistIds };
}

export async function insertListeningEvent(
    userId: string,
    event: ParsedListeningEvent
): Promise<'added' | 'skipped' | 'updated'> {
    const result = await insertListeningEventWithIds(userId, event);
    return result.status;
}

export async function insertListeningEventWithIds(
    userId: string,
    event: ParsedListeningEvent
): Promise<InsertResultWithIds> {
    const { trackId, artistIds } = await upsertTrack(event.track);

    const existing = await prisma.listeningEvent.findUnique({
        where: {
            userId_trackId_playedAt: {
                userId,
                trackId,
                playedAt: event.playedAt,
            },
        },
        select: { isEstimated: true, source: true },
    });

    const baseResult = { trackId, artistIds, playedAt: event.playedAt, msPlayed: event.msPlayed };

    if (!existing) {
        await prisma.listeningEvent.create({
            data: {
                userId,
                trackId,
                playedAt: event.playedAt,
                msPlayed: event.msPlayed,
                isEstimated: event.isEstimated,
                source: event.source,
            },
        });
        return { status: 'added', ...baseResult };
    }

    if (event.source === 'api') {
        return { status: 'skipped', ...baseResult };
    }

    if (existing.isEstimated && event.source === 'import') {
        await prisma.listeningEvent.update({
            where: {
                userId_trackId_playedAt: {
                    userId,
                    trackId,
                    playedAt: event.playedAt,
                },
            },
            data: {
                msPlayed: event.msPlayed,
                isEstimated: false,
                source: 'import',
            },
        });
        return { status: 'updated', ...baseResult };
    }

    return { status: 'skipped', ...baseResult };
}

export async function insertListeningEvents(
    userId: string,
    events: ParsedListeningEvent[]
): Promise<SyncSummary> {
    const summary: SyncSummary = { added: 0, skipped: 0, updated: 0, errors: 0 };

    for (const event of events) {
        try {
            const result = await insertListeningEvent(userId, event);
            summary[result]++;
        } catch (error) {
            console.error('Failed to insert event:', error);
            summary.errors++;
        }
    }

    return summary;
}

export async function insertListeningEventsWithIds(
    userId: string,
    events: ParsedListeningEvent[]
): Promise<{ summary: SyncSummary; results: InsertResultWithIds[] }> {
    const summary: SyncSummary = { added: 0, skipped: 0, updated: 0, errors: 0 };
    const results: InsertResultWithIds[] = [];

    for (const event of events) {
        try {
            const result = await insertListeningEventWithIds(userId, event);
            summary[result.status]++;
            results.push(result);
        } catch (error) {
            console.error('Failed to insert event:', error);
            summary.errors++;
        }
    }

    return { summary, results };
}

