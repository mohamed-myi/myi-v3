import { prisma } from './prisma';

// Health check utility for database connectivity.
export async function checkDatabaseHealth(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
        await prisma.$queryRaw`SELECT 1`;
        return { ok: true, latencyMs: Date.now() - start };
    } catch {
        return { ok: false, latencyMs: Date.now() - start };
    }
}
