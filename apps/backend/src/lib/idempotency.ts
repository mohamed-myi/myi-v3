import { createHash } from 'crypto';

/**
 * Generates an idempotency key from a confirmation token.
 * The key is a SHA-256 hash truncated to 32 characters for storage efficiency.
 */
export function generateIdempotencyKey(confirmationToken: string): string {
    return createHash('sha256')
        .update(confirmationToken)
        .digest('hex')
        .substring(0, 32);
}
