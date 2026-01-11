import { generateIdempotencyKey } from '../../../src/lib/idempotency';

describe('idempotency', () => {
    describe('generateIdempotencyKey', () => {
        it('should return a 32-character hex string', () => {
            const key = generateIdempotencyKey('some-token');
            expect(key).toHaveLength(32);
            expect(/^[0-9a-f]+$/.test(key)).toBe(true);
        });

        it('should return the same key for the same token', () => {
            const key1 = generateIdempotencyKey('token-abc');
            const key2 = generateIdempotencyKey('token-abc');
            expect(key1).toBe(key2);
        });

        it('should return different keys for different tokens', () => {
            const key1 = generateIdempotencyKey('token-1');
            const key2 = generateIdempotencyKey('token-2');
            expect(key1).not.toBe(key2);
        });

        it('should handle empty string', () => {
            const key = generateIdempotencyKey('');
            expect(key).toHaveLength(32);
            expect(/^[0-9a-f]+$/.test(key)).toBe(true);
        });

        it('should handle long tokens', () => {
            const longToken = 'a'.repeat(1000);
            const key = generateIdempotencyKey(longToken);
            expect(key).toHaveLength(32);
            expect(/^[0-9a-f]+$/.test(key)).toBe(true);
        });
    });
});
