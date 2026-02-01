import * as path from 'path';

const parseCsv = (value?: string): string[] =>
    value
        ?.split(',')
        .map((entry) => entry.trim())
        .filter(Boolean) ?? [];

const resolvePaths = (entries: string[]): string[] => entries.map((entry) => path.resolve(entry));

export const backendConfig = {
    server: {
        defaultPort: 3001,
        corsOrigins: ['http://localhost:3000', 'http://localhost:5173'],
        sessionGraceMs: 2 * 60 * 1000,
        rateLimit: {
            enabled: process.env.RATE_LIMIT_ENABLED === 'true',
            windowMs: 60 * 1000,
            max: 120,
            standardHeaders: true,
            legacyHeaders: false,
        },
    },
    agent: {
        maxIterations: 50,
    },
    model: {
        defaultModel: 'kimi-k2-0711-preview',
        defaultTemperature: 0.3,
        defaultMaxTokens: 100000,
        defaultBaseUrl: 'https://api.moonshot.cn/v1',
    },
    workspace: {
        defaultMaxDepth: 3,
        defaultMaxEntries: 5000,
        defaultExcludes: ['node_modules', '.git', 'dist', 'build', '.next', 'out'],
        treeCacheTtlMs: 30 * 1000,
        allowedRoots: resolvePaths(parseCsv(process.env.WORKSPACE_ALLOWED_ROOTS)),
    },
    tools: {
        listFilesCacheTtlMs: 10 * 1000,
        commandTimeoutMs: 60 * 1000,
        commandMaxBufferBytes: 1024 * 1024,
        requireCommandConfirmation: process.env.REQUIRE_COMMAND_CONFIRMATION === 'true',
        searchDefaults: {
            maxResults: 200,
            maxBytesPerFile: 200_000,
        },
    },
    webSearch: {
        defaultUrl: 'https://openrouter.ai/api/v1/plugins/web-search',
        defaultResults: 5,
    },
    moonshot: {
        maxRetries: 3,
        baseDelayMs: 500,
        maxDelayMs: 5000,
    },
    contextManagement: {
        maxContextTokens: 100000,
        targetContextTokens: 80000,
        summarizationThreshold: 85,
        preserveRecentMessages: 10,
    },
};
