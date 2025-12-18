import { logger } from './logger';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
    failureThreshold: number; // Number of failures before opening
    resetTimeout: number;     // Time in ms before trying again
}


export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private failureCount = 0;
    private lastFailureTime = 0;
    private readonly failureThreshold: number;
    private readonly resetTimeout: number;

    constructor(options: CircuitBreakerOptions) {
        this.failureThreshold = options.failureThreshold;
        this.resetTimeout = options.resetTimeout;
    }

    // Check if circuit is open.
    isOpen(): boolean {
        if (this.state === 'CLOSED') {
            return false;
        }

        if (this.state === 'OPEN') {
            const timeSinceFailure = Date.now() - this.lastFailureTime;
            if (timeSinceFailure >= this.resetTimeout) {
                this.state = 'HALF_OPEN';
                logger.info('Circuit breaker entering HALF_OPEN state');
                return false;
            }
            return true;
        }

        // HALF_OPEN: let one request through
        return false;
    }

    // Record a successful API call.
    recordSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            logger.info('Circuit breaker closing after successful request');
        }
        this.state = 'CLOSED';
        this.failureCount = 0;
    }

    // Record a failed API call.
    recordFailure(): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === 'HALF_OPEN') {
            this.state = 'OPEN';
            logger.warn('Circuit breaker reopened after HALF_OPEN failure');
            return;
        }

        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
            logger.warn(
                { failureCount: this.failureCount },
                'Circuit breaker opened due to failures'
            );
        }
    }

    // Get current state for monitoring.
    getState(): CircuitState {
        return this.state;
    }
}


// Opens after 5 failures, resets after 30 seconds.
export const spotifyCircuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 30000,
});

// Error thrown when circuit breaker is open.
export class CircuitBreakerOpenError extends Error {
    constructor(message = 'Circuit breaker is open') {
        super(message);
        this.name = 'CircuitBreakerOpenError';
    }
}
