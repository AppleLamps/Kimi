export const frontendConfig = {
    backendUrl: import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001',
    socket: {
        deltaFlushIntervalMs: 60,
        stateRequestDelayMs: 500,
        reconnectAttempts: 5,
        reconnectDelayMs: 500,
        reconnectDelayMaxMs: 5000,
        reconnectRandomizationFactor: 0.5,
        gitStatusResetMs: 4000,
        gitErrorResetMs: 6000,
    },
    workspaceCache: {
        cacheKey: 'kimi.workspaceTreeCache',
        defaultTtlMs: 5 * 60 * 1000,
    },
};
