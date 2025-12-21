
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';

async function diagnose() {
    try {
        const userCount = await prisma.spotifyAuth.count({ where: { isValid: true } });
        console.log(`Valid Spotify Users: ${userCount}`);

        const trackCount = await prisma.track.count();
        console.log(`Total Tracks: ${trackCount}`);

        const featureCount = await prisma.audioFeatures.count();
        console.log(`Total Audio Features: ${featureCount}`);

        const pendingFeatures = await redis.scard('pending_audio_features');
        console.log(`Pending Features in Redis: ${pendingFeatures}`);

        if (trackCount > 0 && featureCount === 0) {
            console.log("CRITICAL: Tracks exist but NO audio features found. Worker missed them.");
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        // redis quit handled if needed, but script will exit
        process.exit(0);
    }
}

diagnose();
