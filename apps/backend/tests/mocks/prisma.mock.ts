// Mock for Prisma client to test database-dependent code without real DB

export interface MockModel {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    createMany: jest.Mock;
    update: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
    groupBy: jest.Mock;
}

function createMockModel(): MockModel {
    return {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({}),
        groupBy: jest.fn().mockResolvedValue([]),
    };
}

export interface MockPrismaClient {
    user: MockModel;
    spotifyAuth: MockModel;
    userSettings: MockModel;

    track: MockModel;
    artist: MockModel;
    album: MockModel;
    trackArtist: MockModel;

    listeningEvent: MockModel;

    userTrackStats: MockModel;
    userArtistStats: MockModel;
    userTimeBucketStats: MockModel;
    userHourStats: MockModel;

    importJob: MockModel;
    playlistJob: MockModel;
    metadataRefreshLog: MockModel;

    spotifyTopTrack: MockModel;
    spotifyTopArtist: MockModel;

    $transaction: jest.Mock;
    $executeRawUnsafe: jest.Mock;
    $queryRaw: jest.Mock;
    $disconnect: jest.Mock;
}

export function createMockPrisma(): MockPrismaClient {
    return {
        user: createMockModel(),
        spotifyAuth: createMockModel(),
        userSettings: createMockModel(),
        track: createMockModel(),
        artist: createMockModel(),
        album: createMockModel(),
        trackArtist: createMockModel(),

        listeningEvent: createMockModel(),

        userTrackStats: createMockModel(),
        userArtistStats: createMockModel(),
        userTimeBucketStats: createMockModel(),
        userHourStats: createMockModel(),

        importJob: createMockModel(),
        playlistJob: createMockModel(),
        metadataRefreshLog: createMockModel(),

        spotifyTopTrack: createMockModel(),
        spotifyTopArtist: createMockModel(),

        $transaction: jest.fn((queries: Promise<any>[]) => Promise.all(queries)),
        $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
        $queryRaw: jest.fn().mockResolvedValue([]),
        $disconnect: jest.fn().mockResolvedValue(undefined),
    };
}

// Reset all mocks - uses mockClear to preserve implementations while clearing call history
export function resetMockPrisma(mock: MockPrismaClient): void {
    Object.values(mock).forEach((model) => {
        if (typeof model === 'object' && model !== null) {
            Object.values(model).forEach((fn) => {
                if (typeof fn === 'function' && 'mockClear' in fn) {
                    (fn as jest.Mock).mockClear();
                }
            });
        } else if (typeof model === 'function' && 'mockClear' in model) {
            (model as jest.Mock).mockClear();
        }
    });
}

