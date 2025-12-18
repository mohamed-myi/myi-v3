// Mock for Redis client to test Redis-dependent code without real Redis

export interface MockRedis {
    get: jest.Mock;
    set: jest.Mock;
    setex: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
    sadd: jest.Mock;
    spop: jest.Mock;
    quit: jest.Mock;
}

export function createMockRedis(): MockRedis {
    return {
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        incr: jest.fn(),
        expire: jest.fn(),
        sadd: jest.fn(),
        spop: jest.fn(),
        quit: jest.fn().mockResolvedValue(undefined),
    };
}

export function resetMockRedis(mock: MockRedis): void {
    Object.values(mock).forEach((fn) => {
        if (typeof fn === 'function' && 'mockReset' in fn) {
            (fn as jest.Mock).mockReset();
        }
    });
}
