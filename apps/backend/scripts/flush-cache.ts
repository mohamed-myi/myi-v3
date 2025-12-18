import { config } from 'dotenv';
config({ path: '../../.env' });
import { redis } from '../src/lib/redis';

async function flushCache() {
    console.log('Flushing Redis cache...');
    const result = await redis.flushdb();
    console.log('Cache flushed:', result);
    process.exit(0);
}

flushCache().catch((err) => {
    console.error('Error flushing cache:', err);
    process.exit(1);
});
