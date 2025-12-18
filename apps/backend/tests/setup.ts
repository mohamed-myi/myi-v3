import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root
config({ path: resolve(__dirname, '../../../.env') });

// Global Mocks for Integration Tests
jest.mock('ioredis', () => {
    return jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        publish: jest.fn(),
        subscribe: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        sadd: jest.fn(),
        spop: jest.fn(),
        quit: jest.fn(),
        duplicate: jest.fn().mockReturnThis(),
    }));
});

jest.mock('bullmq', () => ({
    Queue: jest.fn().mockImplementation(() => ({
        add: jest.fn(),
        close: jest.fn(),
    })),
    Worker: jest.fn().mockImplementation(() => ({
        on: jest.fn(),
        close: jest.fn(),
    })),
}));
