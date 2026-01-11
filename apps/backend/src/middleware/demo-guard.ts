import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma';

// Routes where demo users cannot perform write operations
const DEMO_BLOCKED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Routes that should bypass demo guard even for write methods
const DEMO_ALLOWED_ROUTES = [
    '/playlists/validate/shuffle',
    '/playlists/validate/recent',
    '/playlists/validate/top50',
];

export async function demoGuard(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    // Only check for write methods
    if (!DEMO_BLOCKED_METHODS.includes(request.method)) {
        return;
    }

    const userId = request.userId;
    if (!userId) return; // Not authenticated, let auth middleware handle it

    // Check if route is allowed even for demo users
    const path = request.url.split('?')[0];
    if (DEMO_ALLOWED_ROUTES.some(route => path.endsWith(route))) {
        return;
    }

    // Check if user is demo user (fetched in authMiddleware)
    if (request.isDemo) {
        reply.status(403).send({
            error: 'Demo Mode',
            message: 'This action is disabled in demo mode. Sign in with Spotify to unlock all features.',
            code: 'DEMO_MODE_RESTRICTED'
        });
        return;
    }
}
