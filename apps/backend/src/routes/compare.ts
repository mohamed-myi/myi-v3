import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';
import { toJSON } from '../lib/serialization';

type TimeRange = 'short_term' | 'medium_term' | 'long_term';
type CompareType = 'artists' | 'tracks' | 'both';

interface CompareQuery {
    timeRange?: TimeRange;
    type?: CompareType;
}

interface CommonItem {
    id: string;
    name: string;
    imageUrl: string | null;
    sourceRank: number;
    targetRank: number;
    rankDiff: number;
}

interface CompareResult {
    score: number;
    breakdown: {
        artistScore: number;
        trackScore: number;
    };
    commonArtists: CommonItem[];
    commonTracks: CommonItem[];
    targetUser: {
        displayName: string | null;
        imageUrl: string | null;
    };
    metadata: {
        timeRange: TimeRange;
        comparedAt: string;
    };
}

// JSON Schema for compare endpoint
const compareSchema = {
    params: {
        type: 'object',
        required: ['targetUser'],
        properties: {
            targetUser: { type: 'string', minLength: 1, maxLength: 50 }
        }
    },
    querystring: {
        type: 'object',
        properties: {
            timeRange: {
                type: 'string',
                enum: ['short_term', 'medium_term', 'long_term'],
                default: 'medium_term'
            },
            type: {
                type: 'string',
                enum: ['artists', 'tracks', 'both'],
                default: 'both'
            }
        }
    }
};

export async function compareRoutes(fastify: FastifyInstance) {

    fastify.get<{
        Params: { targetUser: string };
        Querystring: CompareQuery;
    }>('/compare/:targetUser', { schema: compareSchema }, async (request, reply) => {
        const sourceUserId = request.userId;
        if (!sourceUserId) return reply.status(401).send({ error: 'Unauthorized' });

        const { targetUser } = request.params;
        const {
            timeRange = 'medium_term',
            type = 'both',
        } = request.query;

        // Find target user
        const targetUserRecord = await prisma.user.findUnique({
            where: { spotifyId: targetUser },
            include: { settings: true },
        });

        if (!targetUserRecord) {
            return reply.status(404).send({ error: 'User not found' });
        }

        if (!targetUserRecord.settings?.isPublicProfile) {
            return reply.status(403).send({ error: 'Profile is private' });
        }

        // Fetch top items for both users
        const [sourceArtists, targetArtists, sourceTracks, targetTracks] = await Promise.all([
            type !== 'tracks' ? getTopArtists(sourceUserId, timeRange) : Promise.resolve([]),
            type !== 'tracks' ? getTopArtists(targetUserRecord.id, timeRange) : Promise.resolve([]),
            type !== 'artists' ? getTopTracks(sourceUserId, timeRange) : Promise.resolve([]),
            type !== 'artists' ? getTopTracks(targetUserRecord.id, timeRange) : Promise.resolve([]),
        ]);

        // Calculate common items and scores
        const { commonItems: commonArtists, score: artistScore } =
            calculateCommonItems(sourceArtists, targetArtists, 'artist');

        const { commonItems: commonTracks, score: trackScore } =
            calculateCommonItems(sourceTracks, targetTracks, 'track');

        // Combined score (weighted average)
        let finalScore: number;

        if (type === 'artists') {
            finalScore = artistScore;
        } else if (type === 'tracks') {
            finalScore = trackScore;
        } else {
            // 50/50 weight for both
            finalScore = Math.round((artistScore + trackScore) / 2);
        }

        return toJSON({
            score: finalScore,
            breakdown: {
                artistScore,
                trackScore,
            },
            commonArtists: commonArtists.slice(0, 5),
            commonTracks: commonTracks.slice(0, 5),
            targetUser: {
                displayName: targetUserRecord.displayName,
                imageUrl: targetUserRecord.imageUrl,
            },
            metadata: {
                timeRange,
                comparedAt: new Date().toISOString(),
            },
        });
    });
}

// Get top artists from SpotifyTopArtist table
async function getTopArtists(userId: string, term: TimeRange) {
    return prisma.spotifyTopArtist.findMany({
        where: { userId, term },
        orderBy: { rank: 'asc' },
        include: { artist: true },
    });
}

// Get top tracks from SpotifyTopTrack table
async function getTopTracks(userId: string, term: TimeRange) {
    return prisma.spotifyTopTrack.findMany({
        where: { userId, term },
        orderBy: { rank: 'asc' },
        include: {
            track: {
                include: { album: true }
            }
        },
    });
}

// Calculate common items with weighted Jaccard score
function calculateCommonItems(
    sourceItems: any[],
    targetItems: any[],
    itemType: 'artist' | 'track'
): { commonItems: CommonItem[]; score: number } {
    if (sourceItems.length === 0 || targetItems.length === 0) {
        return { commonItems: [], score: 0 };
    }

    const idField = itemType === 'artist' ? 'artistId' : 'trackId';
    const dataField = itemType;

    const targetMap = new Map(
        targetItems.map(item => [item[idField], item])
    );

    const common: CommonItem[] = [];
    let weightedMatchScore = 0;

    for (const sourceItem of sourceItems) {
        const targetItem = targetMap.get(sourceItem[idField]);

        if (targetItem) {
            const sourceRank = sourceItem.rank;
            const targetRank = targetItem.rank;

            // Rank 1 gets weight ~1.0, Rank 50 gets weight ~0.0
            const avgRank = (sourceRank + targetRank) / 2;
            const rankWeight = 1 - (avgRank / 50);

            weightedMatchScore += rankWeight;

            const data = sourceItem[dataField];
            common.push({
                id: data.spotifyId,
                name: data.name,
                imageUrl: data.imageUrl ?? data.album?.imageUrl ?? null,
                sourceRank,
                targetRank,
                rankDiff: targetRank - sourceRank, // Positive = target ranks higher
            });
        }
    }

    // Score: weighted matches / max possible weighted score
    // Max if all 50 items matched at same ranks: sum of (1 - i/50) for i=0..49 ≈ 25
    const maxPossibleScore = 25;
    const score = Math.min(100, Math.round((weightedMatchScore / maxPossibleScore) * 100));

    // Sort by combined rank
    common.sort((a, b) => (a.sourceRank + a.targetRank) - (b.sourceRank + b.targetRank));

    return { commonItems: common, score };
}
