import * as fs from 'fs/promises';
import type { Dirent } from 'fs';
import * as path from 'path';
import { backendConfig } from '../config.js';

export interface WorkspaceInfo {
  path: string;
  name: string;
  isGitRepo: boolean;
  fileCount: number;
}

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

export interface WorkspaceTreeOptions {
  maxDepth?: number;
  maxEntries?: number;
  exclude?: string[];
}

const DEFAULT_MAX_DEPTH = backendConfig.workspace.defaultMaxDepth;
const DEFAULT_MAX_ENTRIES = backendConfig.workspace.defaultMaxEntries;
const DEFAULT_EXCLUDES = backendConfig.workspace.defaultExcludes;
const TREE_CACHE_TTL_MS = backendConfig.workspace.treeCacheTtlMs;
const workspaceTreeCache = new Map<string, { expiresAt: number; value: WorkspaceTreeResult }>();

export async function validateWorkspace(workspacePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(workspacePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function getWorkspaceInfo(workspacePath: string): Promise<WorkspaceInfo> {
  const resolvedPath = path.resolve(workspacePath);

  // Check if it's a git repo
  let isGitRepo = false;
  try {
    await fs.access(path.join(resolvedPath, '.git'));
    isGitRepo = true;
  } catch {
    isGitRepo = false;
  }

  // Count files (shallow)
  let fileCount = 0;
  try {
    const entries = await fs.readdir(resolvedPath);
    fileCount = entries.length;
  } catch {
    fileCount = 0;
  }

  return {
    path: resolvedPath,
    name: path.basename(resolvedPath),
    isGitRepo,
    fileCount,
  };
}

export async function getWorkspaceTree(
  workspacePath: string,
  options: WorkspaceTreeOptions = {}
): Promise<WorkspaceTreeResult> {
  const resolvedPath = path.resolve(workspacePath);
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const exclude = new Set(options.exclude ?? DEFAULT_EXCLUDES);

  const cacheKey = `${resolvedPath}|${maxDepth}|${maxEntries}|${[...exclude].sort().join(',')}`;
  const cached = workspaceTreeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let entryCount = 0;
  let truncated = false;

  const walk = async (targetPath: string, depth: number): Promise<WorkspaceTreeNode> => {
    const node: WorkspaceTreeNode = {
      name: path.basename(targetPath) || targetPath,
      path: targetPath,
      type: 'directory',
      children: [],
    };

    if (depth >= maxDepth) {
      return node;
    }

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(targetPath, { withFileTypes: true });
    } catch {
      return node;
    }

    for (const entry of entries) {
      if (entryCount >= maxEntries) {
        truncated = true;
        break;
      }
      if (exclude.has(entry.name)) continue;

      const entryPath = path.join(targetPath, entry.name);
      entryCount += 1;

      if (entry.isDirectory()) {
        node.children!.push(await walk(entryPath, depth + 1));
      } else {
        node.children!.push({
          name: entry.name,
          path: entryPath,
          type: 'file',
        });
      }
    }

    return node;
  };

  const root = await walk(resolvedPath, 0);
  const result: WorkspaceTreeResult = { root, truncated };

  workspaceTreeCache.set(cacheKey, {
    expiresAt: Date.now() + TREE_CACHE_TTL_MS,
    value: result,
  });

  return result;
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}
