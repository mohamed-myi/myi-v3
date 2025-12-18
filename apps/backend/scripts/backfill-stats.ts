/**
 * Script to backfill aggregated stats from existing listening events.
 * Run with: npx tsx apps/backend/scripts/backfill-stats.ts
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { updateStatsForEvents } from "../src/services/aggregation";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function backfillStats() {
    console.log("Starting stats backfill...");

    // Get all users
    const users = await prisma.user.findMany({
        select: {
            id: true,
            displayName: true,
            settings: { select: { timezone: true } },
        },
    });

    console.log(`Found ${users.length} users`);

    for (const user of users) {
        console.log(`\nProcessing user: ${user.displayName || user.id}`);
        const timezone = user.settings?.timezone ?? "UTC";

        // Clear existing stats
        const [trackDeleted, artistDeleted, timeDeleted, hourDeleted] = await Promise.all([
            prisma.userTrackStats.deleteMany({ where: { userId: user.id } }),
            prisma.userArtistStats.deleteMany({ where: { userId: user.id } }),
            prisma.userTimeBucketStats.deleteMany({ where: { userId: user.id } }),
            prisma.userHourStats.deleteMany({ where: { userId: user.id } }),
        ]);
        console.log(`  Cleared existing stats: ${trackDeleted.count} track, ${artistDeleted.count} artist`);

        // Fetch all listening events with track and artist data
        const events = await prisma.listeningEvent.findMany({
            where: { userId: user.id },
            include: {
                track: {
                    include: {
                        artists: true,
                    },
                },
            },
            orderBy: { playedAt: "asc" },
        });

        console.log(`  Found ${events.length} listening events`);

        if (events.length === 0) continue;

        // Convert to aggregation input format
        const inputs = events.map((event) => ({
            trackId: event.trackId,
            artistIds: event.track.artists.map((ta) => ta.artistId),
            playedAt: event.playedAt,
            msPlayed: event.msPlayed,
        }));

        // Process in batches of 500
        const BATCH_SIZE = 500;
        for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
            const batch = inputs.slice(i, i + BATCH_SIZE);
            await updateStatsForEvents(user.id, batch, timezone);
            console.log(`  Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(inputs.length / BATCH_SIZE)}`);
        }

        // Verify
        const [trackStats, artistStats] = await Promise.all([
            prisma.userTrackStats.count({ where: { userId: user.id } }),
            prisma.userArtistStats.count({ where: { userId: user.id } }),
        ]);
        console.log(`  Created ${trackStats} track stats, ${artistStats} artist stats`);
    }

    console.log("\nStats backfill complete!");
}

backfillStats()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
        process.exit(0);
    });
