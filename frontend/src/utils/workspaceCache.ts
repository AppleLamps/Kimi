import { frontendConfig } from '../config';

const WORKSPACE_TREE_CACHE_KEY = frontendConfig.workspaceCache.cacheKey;
const DEFAULT_TTL_MS = frontendConfig.workspaceCache.defaultTtlMs;
const BACKEND_URL = frontendConfig.backendUrl;

export interface WorkspaceTreeNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: WorkspaceTreeNode[];
}

export interface WorkspaceTreeResult {
    root: WorkspaceTreeNode;
    truncated: boolean;
}

interface WorkspaceTreeCacheEntry {
    updatedAt: number;
    ttlMs: number;
    data: WorkspaceTreeResult;
}

type WorkspaceTreeCacheStore = Record<string, WorkspaceTreeCacheEntry>;

const readCache = (): WorkspaceTreeCacheStore => {
    const raw = localStorage.getItem(WORKSPACE_TREE_CACHE_KEY);
    if (!raw) return {};
    try {
        return JSON.parse(raw) as WorkspaceTreeCacheStore;
    } catch {
        return {};
    }
};

const writeCache = (cache: WorkspaceTreeCacheStore) => {
    localStorage.setItem(WORKSPACE_TREE_CACHE_KEY, JSON.stringify(cache));
};

const makeCacheKey = (path: string, depth?: number, maxEntries?: number) => {
    return `${path}::${depth ?? ''}::${maxEntries ?? ''}`;
};

export const getCachedWorkspaceTree = (
    path: string,
    options: { depth?: number; maxEntries?: number } = {}
): WorkspaceTreeResult | null => {
    const cache = readCache();
    const cacheKey = makeCacheKey(path, options.depth, options.maxEntries);
    const entry = cache[cacheKey];
    if (!entry) return null;
    if (Date.now() - entry.updatedAt > entry.ttlMs) {
        delete cache[cacheKey];
        writeCache(cache);
        return null;
    }
    return entry.data;
};

export const setCachedWorkspaceTree = (
    path: string,
    data: WorkspaceTreeResult,
    options: { depth?: number; maxEntries?: number; ttlMs?: number } = {}
) => {
    const cache = readCache();
    const cacheKey = makeCacheKey(path, options.depth, options.maxEntries);
    cache[cacheKey] = {
        updatedAt: Date.now(),
        ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
        data,
    };
    writeCache(cache);
};

export const prefetchWorkspaceTree = async (
    path: string,
    options: { depth?: number; maxEntries?: number; ttlMs?: number } = {}
): Promise<WorkspaceTreeResult> => {
    const cached = getCachedWorkspaceTree(path, options);
    if (cached) return cached;

    const params = new URLSearchParams({ path });
    if (options.depth !== undefined) {
        params.set('depth', String(options.depth));
    }
    if (options.maxEntries !== undefined) {
        params.set('maxEntries', String(options.maxEntries));
    }

    const response = await fetch(`${BACKEND_URL}/api/workspace/tree?${params.toString()}`);
    if (!response.ok) {
        throw new Error('Failed to fetch workspace tree');
    }

    const data = (await response.json()) as WorkspaceTreeResult;
    setCachedWorkspaceTree(path, data, options);
    return data;
};
