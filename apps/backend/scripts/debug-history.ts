
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('Checking database content...');

    const userCount = await prisma.user.count();
    console.log(`Total Users: ${userCount}`);

    const users = await prisma.user.findMany({ take: 5 });
    for (const user of users) {
        console.log(`\nUser: ${user.id} (${user.email})`);

        const eventCount = await prisma.listeningEvent.count({
            where: { userId: user.id }
        });
        console.log(`  ListeningEvents: ${eventCount}`);

        if (eventCount > 0) {
            const events = await prisma.listeningEvent.findMany({
                where: { userId: user.id },
                take: 5,
                orderBy: { playedAt: 'desc' },
                include: {
                    track: {
                        include: {
                            artists: { include: { artist: true } },
                            album: true
                        }
                    }
                }
            });
            console.log('  Recent 5 events:');
            events.forEach(e => {
                console.log(`    - ${e.playedAt}: ${e.track.name} by ${e.track.artists[0]?.artist.name} (Source: ${e.source})`);
            });
        }
    }

    const totalEvents = await prisma.listeningEvent.count();
    console.log(`\nTotal ListeningEvents in DB: ${totalEvents}`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
