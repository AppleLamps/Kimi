import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as Diff from 'diff';
import { v4 as uuidv4 } from 'uuid';
import fg from 'fast-glob';
import { simpleGit } from 'simple-git';
import { fetch } from 'undici';
import { backendConfig } from '../config.js';
import { logger } from '../logger.js';
import type {
  ListFilesParams,
  ReadFileParams,
  ProposeFileChangeParams,
  ProposeFileChangesParams,
  RunCommandParams,
  CommandResult,
  DiffResult,
  SearchFilesParams,
  SearchMatch,
  GitOperationsParams,
  WebSearchParams,
  CreateDirectoryParams,
  DeleteFileParams,
  MoveFileParams,
  RunTestsParams,
} from '../types.js';

const execAsync = promisify(exec);

export class ToolExecutor {
  private workspacePath: string;
  private pendingDiffs: Map<string, DiffResult> = new Map();
  private listFilesCache: Map<string, { expiresAt: number; entries: string[] }> = new Map();

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

  private clearListFilesCache() {
    this.listFilesCache.clear();
  }

  private async applyDiffContent(diff: DiffResult): Promise<void> {
    if (diff.operation === 'delete') {
      const filePath = this.resolvePath(diff.path);
      await fs.rm(filePath, { force: true });
      logger.info('file_operation_applied', {
        operation: 'delete',
        path: diff.path,
        workspacePath: this.workspacePath,
      });
      return;
    }

    if (diff.operation === 'move') {
      if (!diff.oldPath || !diff.newPath) {
        throw new Error('Move operation missing oldPath/newPath');
      }
      const fromPath = this.resolvePath(diff.oldPath);
      const toPath = this.resolvePath(diff.newPath);
      await fs.mkdir(path.dirname(toPath), { recursive: true });
      await fs.rename(fromPath, toPath);
      logger.info('file_operation_applied', {
        operation: 'move',
        oldPath: diff.oldPath,
        newPath: diff.newPath,
        workspacePath: this.workspacePath,
      });
      return;
    }

    const filePath = this.resolvePath(diff.path);
    if (diff.proposed === undefined) {
      throw new Error(`Diff content missing for ${diff.path}`);
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, diff.proposed, 'utf-8');
    logger.info('file_operation_applied', {
      operation: diff.operation ?? 'modify',
      path: diff.path,
      workspacePath: this.workspacePath,
    });
  }

  async listFiles(params: ListFilesParams): Promise<string[]> {
    const targetPath = params.path
      ? this.resolvePath(params.path)
      : this.workspacePath;

    const now = Date.now();
    const cached = this.listFilesCache.get(targetPath);
    if (cached && cached.expiresAt > now) {
      return cached.entries;
    }

    try {
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      const result = entries.map((entry) => {
        const name = entry.name;
        return entry.isDirectory() ? `${name}/` : name;
      });
      this.listFilesCache.set(targetPath, {
        expiresAt: now + backendConfig.tools.listFilesCacheTtlMs,
        entries: result,
      });
      return result;
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
    let exists = true;
    try {
      original = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, this is a new file
      exists = false;
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
      operation: exists ? 'modify' : 'create',
    };

    this.pendingDiffs.set(diffResult.id, diffResult);
    logger.info('file_operation_proposed', {
      operation: diffResult.operation,
      path: diffResult.path,
      workspacePath: this.workspacePath,
    });
    return diffResult;
  }

  async proposeFileChanges(params: ProposeFileChangesParams): Promise<DiffResult[]> {
    const created: DiffResult[] = [];

    try {
      for (const change of params.changes) {
        const diff = await this.proposeFileChange(change);
        created.push(diff);
      }
      return created;
    } catch (error) {
      for (const diff of created) {
        this.pendingDiffs.delete(diff.id);
      }
      throw error;
    }
  }

  async runCommand(params: RunCommandParams): Promise<CommandResult> {
    // Basic command validation - block obviously dangerous commands
    const blockedPatterns = [
      /rm\s+-rf\s+[\/~]/,
      /rm\s+-r\s+[\/~]/,
      /rm\s+-rf\s+\*/,
      /rmdir\s+\/s\s+\/q/i,
      /rd\s+\/s\s+\/q/i,
      /del\s+\/f\s+\/s\s+\/q/i,
      /erase\s+\/s\s+\/q/i,
      />\s*\/dev\/sd/,
      /mkfs\./,
      /mkfs\s+/,
      /fdisk\s+/,
      /parted\s+/,
      /diskpart\b/i,
      /format\s+[a-z]:/i,
      /dd\s+if=/,
      /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,
      /shutdown\b/i,
      /reboot\b/i,
      /poweroff\b/i,
      /halt\b/i,
      /bcdedit\b/i,
      /reg\s+delete\b/i,
      /sc\s+delete\b/i,
      /net\s+user\b/i,
      /net\s+localgroup\b/i,
      /chown\b/i,
      /chmod\s+-R\s+777/i,
      /sudo\b/i,
      /kill\s+-9\s+1\b/,
      /curl\b[^\n|]+\|\s*(sh|bash|zsh)\b/i,
      /wget\b[^\n|]+\|\s*(sh|bash|zsh)\b/i,
      /curl\b[^\n|]+\|\s*powershell\b/i,
      /wget\b[^\n|]+\|\s*powershell\b/i,
      /Invoke-Expression\b/i,
      /\bIEX\b/i,
      /Set-ExecutionPolicy\b/i,
      /Add-MpPreference\b/i,
      /Remove-MpPreference\b/i,
      /Set-MpPreference\b/i,
      /cipher\s+\/w:/i,
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
        timeout: backendConfig.tools.commandTimeoutMs,
        maxBuffer: backendConfig.tools.commandMaxBufferBytes,
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
    } finally {
      this.clearListFilesCache();
    }
  }

  async applyDiff(diffId: string): Promise<boolean> {
    const diff = this.pendingDiffs.get(diffId);
    if (!diff) {
      throw new Error(`Diff not found: ${diffId}`);
    }

    await this.applyDiffContent(diff);

    // Remove from pending
    this.pendingDiffs.delete(diffId);
    this.clearListFilesCache();

    return true;
  }

  async applyDiffsAtomically(diffs: DiffResult[]): Promise<DiffResult[]> {
    if (diffs.length === 0) return [];

    const snapshots = new Map<string, { exists: boolean; content?: string }>();

    const recordSnapshot = async (relativePath: string) => {
      if (snapshots.has(relativePath)) return;
      const filePath = this.resolvePath(relativePath);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        snapshots.set(relativePath, { exists: true, content });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          snapshots.set(relativePath, { exists: false });
          return;
        }
        throw error;
      }
    };

    for (const diff of diffs) {
      if (diff.operation === 'move') {
        if (!diff.oldPath || !diff.newPath) {
          throw new Error('Move operation missing oldPath/newPath');
        }
        await recordSnapshot(diff.oldPath);
        await recordSnapshot(diff.newPath);
      } else {
        await recordSnapshot(diff.path);
      }
    }

    try {
      for (const diff of diffs) {
        await this.applyDiffContent(diff);
      }

      diffs.forEach((diff) => this.pendingDiffs.delete(diff.id));
      this.clearListFilesCache();
      return diffs;
    } catch (error) {
      for (const [relativePath, snapshot] of snapshots.entries()) {
        const filePath = this.resolvePath(relativePath);
        if (snapshot.exists) {
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, snapshot.content ?? '', 'utf-8');
        } else {
          await fs.rm(filePath, { force: true });
        }
      }
      this.clearListFilesCache();
      throw new Error(`Atomic apply failed: ${(error as Error).message}`);
    }
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

  async createDirectory(params: CreateDirectoryParams): Promise<{ created: boolean; path: string }> {
    const targetPath = this.resolvePath(params.path);
    await fs.mkdir(targetPath, { recursive: params.recursive ?? true });
    this.clearListFilesCache();
    logger.info('file_operation_applied', {
      operation: 'create_directory',
      path: params.path,
      workspacePath: this.workspacePath,
    });
    return { created: true, path: params.path };
  }

  async proposeDeleteFile(params: DeleteFileParams): Promise<DiffResult> {
    const filePath = this.resolvePath(params.path);
    let original = '';
    try {
      original = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const diffText = Diff.createPatch(
      params.path,
      original,
      '',
      'original',
      'deleted'
    );

    const diffResult: DiffResult = {
      id: uuidv4(),
      path: params.path,
      original,
      proposed: '',
      diff: diffText,
      operation: 'delete',
    };

    this.pendingDiffs.set(diffResult.id, diffResult);
    logger.info('file_operation_proposed', {
      operation: 'delete',
      path: diffResult.path,
      workspacePath: this.workspacePath,
    });
    return diffResult;
  }

  async proposeMoveFile(params: MoveFileParams): Promise<DiffResult> {
    const fromPath = this.resolvePath(params.from);

    let original = '';
    try {
      original = await fs.readFile(fromPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const diffText = Diff.createPatch(
      params.from,
      original,
      original,
      'original',
      'moved'
    );

    const diffResult: DiffResult = {
      id: uuidv4(),
      path: params.to,
      original,
      proposed: original,
      diff: diffText,
      operation: 'move',
      oldPath: params.from,
      newPath: params.to,
    };

    this.pendingDiffs.set(diffResult.id, diffResult);
    logger.info('file_operation_proposed', {
      operation: 'move',
      oldPath: params.from,
      newPath: params.to,
      workspacePath: this.workspacePath,
    });
    return diffResult;
  }

  async searchFiles(params: SearchFilesParams): Promise<SearchMatch[]> {
    const basePath = params.path ? this.resolvePath(params.path) : this.workspacePath;
    const include = params.include && params.include.length > 0 ? params.include : ['**/*'];
    const exclude = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.next/**',
      '**/coverage/**',
      '**/release/**',
      '**/test-results/**',
      ...(params.exclude ?? []),
    ];

    const entries = await fg(include, {
      cwd: basePath,
      ignore: exclude,
      onlyFiles: true,
      dot: true,
      absolute: true,
      followSymbolicLinks: false,
    });

    const maxResults = params.max_results ?? backendConfig.tools.searchDefaults.maxResults;
    const maxBytes = params.max_bytes_per_file ?? backendConfig.tools.searchDefaults.maxBytesPerFile;
    const caseSensitive = params.case_sensitive ?? false;
    const matches: SearchMatch[] = [];

    const matcher = params.is_regex
      ? new RegExp(params.query, caseSensitive ? 'g' : 'gi')
      : null;
    const query = caseSensitive ? params.query : params.query.toLowerCase();

    for (const absolutePath of entries) {
      if (matches.length >= maxResults) break;

      let content = '';
      try {
        const stat = await fs.stat(absolutePath);
        if (stat.size > maxBytes) {
          continue;
        }
        content = await fs.readFile(absolutePath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        if (matches.length >= maxResults) break;
        const lineText = lines[i];
        if (matcher) {
          let match: RegExpExecArray | null;
          matcher.lastIndex = 0;
          while ((match = matcher.exec(lineText)) !== null) {
            matches.push({
              path: path.relative(this.workspacePath, absolutePath).replace(/\\/g, '/'),
              line: i + 1,
              column: match.index + 1,
              lineText,
              match: match[0],
            });
            if (matches.length >= maxResults) break;
          }
        } else {
          const haystack = caseSensitive ? lineText : lineText.toLowerCase();
          let index = haystack.indexOf(query);
          while (index !== -1) {
            matches.push({
              path: path.relative(this.workspacePath, absolutePath).replace(/\\/g, '/'),
              line: i + 1,
              column: index + 1,
              lineText,
              match: lineText.substr(index, params.query.length),
            });
            if (matches.length >= maxResults) break;
            index = haystack.indexOf(query, index + query.length);
          }
        }
      }
    }

    return matches;
  }

  async gitOperations(params: GitOperationsParams): Promise<unknown> {
    const git = simpleGit({ baseDir: this.workspacePath });
    const action = params.action;

    switch (action) {
      case 'status': {
        return git.status();
      }
      case 'diff': {
        const args = params.args ?? {};
        const file = typeof args.file === 'string' ? args.file : undefined;
        const cached = Boolean(args.cached);
        const diffArgs = [] as string[];
        if (cached) diffArgs.push('--cached');
        if (file) diffArgs.push('--', file);
        return git.diff(diffArgs);
      }
      case 'commit': {
        const message = String(params.args?.message ?? '');
        if (!message.trim()) {
          throw new Error('Commit message is required');
        }
        const files = Array.isArray(params.args?.files)
          ? (params.args?.files as string[])
          : [];
        if (files.length > 0) {
          await git.add(files);
        }
        return git.commit(message);
      }
      case 'branch': {
        const list = await git.branch();
        return list;
      }
      case 'checkout': {
        const branch = String(params.args?.branch ?? '');
        if (!branch.trim()) {
          throw new Error('Branch name is required');
        }
        return git.checkout(branch);
      }
      case 'pull': {
        const remote = params.args?.remote ? String(params.args.remote) : undefined;
        const branch = params.args?.branch ? String(params.args.branch) : undefined;
        return git.pull(remote, branch);
      }
      case 'push': {
        const remote = params.args?.remote ? String(params.args.remote) : undefined;
        const branch = params.args?.branch ? String(params.args.branch) : undefined;
        return git.push(remote, branch);
      }
      default:
        throw new Error(`Unsupported git action: ${action}`);
    }
  }

  async webSearch(params: WebSearchParams): Promise<unknown> {
    const apiKey = process.env.WEB_SEARCH_API_KEY;
    if (!apiKey) {
      throw new Error('WEB_SEARCH_API_KEY environment variable not set');
    }

    const url = process.env.WEB_SEARCH_URL ?? backendConfig.webSearch.defaultUrl;
    const body = {
      query: params.query,
      num_results: params.num_results ?? backendConfig.webSearch.defaultResults,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Web search failed: ${response.status} ${text}`);
    }

    return response.json();
  }

  async runTests(params: RunTestsParams): Promise<CommandResult[] | CommandResult> {
    if (params.command) {
      return this.runCommand({ command: params.command });
    }

    const scope = params.scope ?? 'both';
    const results: CommandResult[] = [];

    const run = async (command: string) => {
      const result = await this.runCommand({ command });
      results.push(result);
      return result;
    };

    if (scope === 'backend') {
      await run('npm run test:backend');
    } else if (scope === 'frontend') {
      await run('npm run test:frontend');
    } else if (scope === 'e2e') {
      await run('npm run test:e2e');
    } else {
      await run('npm run test:backend');
      await run('npm run test:frontend');
    }

    return results;
  }
}
