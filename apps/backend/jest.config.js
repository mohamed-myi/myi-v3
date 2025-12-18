/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    projects: [
        {
            displayName: 'unit',
            preset: 'ts-jest',
            testEnvironment: 'node',
            rootDir: '.',
            testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
            moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/src/$1',
            },
            transform: {
                '^.+\\.tsx?$': [
                    'ts-jest',
                    {
                        isolatedModules: true,
                        useESM: true,
                    },
                ],
                '^.+\\.js$': 'babel-jest',
            },
            transformIgnorePatterns: [
                'node_modules/(?!(p-retry|is-network-error)/)',
            ],
        },
        {
            displayName: 'integration',
            preset: 'ts-jest',
            testEnvironment: 'node',
            rootDir: '.',
            testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
            setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
            testTimeout: 60000,
            moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/src/$1',
            },
            transform: {
                '^.+\\.tsx?$': [
                    'ts-jest',
                    {
                        isolatedModules: true,
                        useESM: true,
                    },
                ],
                '^.+\\.js$': 'babel-jest',
            },
            transformIgnorePatterns: [
                'node_modules/(?!(p-retry|is-network-error)/)',
            ],
        },
    ],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts',
    ],
    coverageThreshold: {
        global: {
            branches: 85,
            functions: 85,
            lines: 85,
            statements: 85,
        },
    },
};
