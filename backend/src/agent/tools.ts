import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as Diff from 'diff';
import { v4 as uuidv4 } from 'uuid';
import type {
  ListFilesParams,
  ReadFileParams,
  ProposeFileChangeParams,
  RunCommandParams,
  CommandResult,
  DiffResult,
} from '../types.js';

const execAsync = promisify(exec);

export class ToolExecutor {
  private workspacePath: string;
  private pendingDiffs: Map<string, DiffResult> = new Map();

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  private resolvePath(relativePath: string): string {
    // Ensure the path stays within the workspace
    const resolved = path.resolve(this.workspacePath, relativePath);
    if (!resolved.startsWith(this.workspacePath)) {
      throw new Error('Path escapes workspace boundary');
    }
    return resolved;
  }

  async listFiles(params: ListFilesParams): Promise<string[]> {
    const targetPath = params.path
      ? this.resolvePath(params.path)
      : this.workspacePath;

    try {
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      return entries.map((entry) => {
        const name = entry.name;
        return entry.isDirectory() ? `${name}/` : name;
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Directory not found: ${params.path || '.'}`);
      }
      throw error;
    }
  }

  async readFile(params: ReadFileParams): Promise<string> {
    const filePath = this.resolvePath(params.path);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${params.path}`);
      }
      throw error;
    }
  }

  async proposeFileChange(params: ProposeFileChangeParams): Promise<DiffResult> {
    const filePath = this.resolvePath(params.path);

    let original = '';
    try {
      original = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, this is a new file
    }

    // Generate unified diff
    const diffText = Diff.createPatch(
      params.path,
      original,
      params.new_content,
      'original',
      'proposed'
    );

    const diffResult: DiffResult = {
      id: uuidv4(),
      path: params.path,
      original,
      proposed: params.new_content,
      diff: diffText,
    };

    this.pendingDiffs.set(diffResult.id, diffResult);
    return diffResult;
  }

  async runCommand(params: RunCommandParams): Promise<CommandResult> {
    // Basic command validation - block obviously dangerous commands
    const blockedPatterns = [
      /rm\s+-rf\s+[\/~]/,
      />\s*\/dev\/sd/,
      /mkfs\./,
      /dd\s+if=/,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(params.command)) {
        return {
          stdout: '',
          stderr: 'Command blocked for safety reasons',
          exitCode: 1,
        };
      }
    }

    try {
      const { stdout, stderr } = await execAsync(params.command, {
        cwd: this.workspacePath,
        timeout: 60000, // 60 second timeout
        maxBuffer: 1024 * 1024, // 1MB max output
      });

      return {
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: execError.stdout || '',
        stderr: execError.stderr || (error as Error).message,
        exitCode: execError.code || 1,
      };
    }
  }

  async applyDiff(diffId: string): Promise<boolean> {
    const diff = this.pendingDiffs.get(diffId);
    if (!diff) {
      throw new Error(`Diff not found: ${diffId}`);
    }

    const filePath = this.resolvePath(diff.path);

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    // Write the new content
    await fs.writeFile(filePath, diff.proposed, 'utf-8');

    // Remove from pending
    this.pendingDiffs.delete(diffId);

    return true;
  }

  rejectDiff(diffId: string): boolean {
    return this.pendingDiffs.delete(diffId);
  }

  getPendingDiffs(): DiffResult[] {
    return Array.from(this.pendingDiffs.values());
  }

  getPendingDiff(diffId: string): DiffResult | undefined {
    return this.pendingDiffs.get(diffId);
  }
}
