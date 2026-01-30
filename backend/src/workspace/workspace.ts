import * as fs from 'fs/promises';
import * as path from 'path';

export interface WorkspaceInfo {
  path: string;
  name: string;
  isGitRepo: boolean;
  fileCount: number;
}

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

export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}
