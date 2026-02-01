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

/**
 * Command security: Allowlist-based approach instead of blocklist
 * Only allows safe, commonly-needed development commands
 */
interface CommandAllowlistEntry {
  pattern: RegExp;
  description: string;
  requiresConfirmation?: boolean;
}

const COMMAND_ALLOWLIST: CommandAllowlistEntry[] = [
  // Package managers
  { pattern: /^npm\s+(install|ci|run|test|build|start|lint|format|exec|ls|outdated|audit|pack|version|info|view|search|init)(\s|$)/, description: 'npm commands' },
  { pattern: /^yarn\s+(install|add|remove|run|test|build|start|lint|format|workspace|why|info|outdated|audit|pack|version|init)(\s|$)/, description: 'yarn commands' },
  { pattern: /^pnpm\s+(install|add|remove|run|test|build|start|lint|format|exec|list|outdated|audit|pack|version|init)(\s|$)/, description: 'pnpm commands' },
  { pattern: /^npx\s+/, description: 'npx execution' },

  // Build tools
  { pattern: /^(tsc|typescript)\s*/, description: 'TypeScript compiler' },
  { pattern: /^(webpack|vite|rollup|esbuild|parcel|turbo)\s*/, description: 'Build tools' },
  { pattern: /^make(\s+\w+)*$/, description: 'Make targets' },

  // Testing
  { pattern: /^(jest|vitest|mocha|ava|tape|playwright|cypress)\s*/, description: 'Test runners' },
  { pattern: /^pytest\s*/, description: 'Python testing' },
  { pattern: /^go\s+test\s*/, description: 'Go testing' },
  { pattern: /^cargo\s+test\s*/, description: 'Rust testing' },

  // Linting and formatting
  { pattern: /^(eslint|prettier|biome|stylelint|shellcheck|hadolint)\s*/, description: 'Linting tools' },
  { pattern: /^(black|ruff|flake8|pylint|mypy|pyright)\s*/, description: 'Python linting' },
  { pattern: /^(rustfmt|clippy|cargo\s+fmt|cargo\s+clippy)\s*/, description: 'Rust linting' },

  // Version control (read-only and safe operations)
  { pattern: /^git\s+(status|log|diff|branch|show|blame|ls-files|remote|fetch|stash\s+list)(\s|$)/, description: 'Git read operations' },
  { pattern: /^git\s+(add|commit|stash\s+(push|pop|apply)|checkout|switch|restore|merge|rebase|cherry-pick|tag)(\s|$)/, description: 'Git write operations', requiresConfirmation: true },

  // File operations (safe, read-only)
  { pattern: /^(ls|dir|tree|find|locate|which|whereis|file|stat|wc|du|df)(\s|$)/, description: 'File listing' },
  { pattern: /^(cat|head|tail|less|more|bat)(\s|$)/, description: 'File viewing' },
  { pattern: /^(grep|rg|ag|ack|sed|awk)\s+/, description: 'Text search/processing' },

  // Development utilities
  { pattern: /^(echo|printf|env|printenv|date|whoami|pwd|hostname|uname)(\s|$)/, description: 'Info commands' },
  { pattern: /^(curl|wget|http)\s+.*--output\s|^(curl|wget)\s+-[oO]\s/, description: 'Download files' },
  { pattern: /^(node|deno|bun|python|python3|ruby|php|go\s+run|cargo\s+run)\s+/, description: 'Script execution' },

  // Docker (read-only and safe operations)
  { pattern: /^docker\s+(ps|images|logs|inspect|stats|top|port|version|info)(\s|$)/, description: 'Docker read operations' },
  { pattern: /^docker\s+(build|run|exec|start|stop|restart|pull)(\s|$)/, description: 'Docker operations', requiresConfirmation: true },
  { pattern: /^docker-compose\s+(ps|logs|config|version)(\s|$)/, description: 'Docker Compose read' },
  { pattern: /^docker-compose\s+(up|down|build|start|stop|restart|pull)(\s|$)/, description: 'Docker Compose operations', requiresConfirmation: true },

  // Database clients (read queries only by default)
  { pattern: /^(psql|mysql|sqlite3|mongosh|redis-cli)\s+.*(-c|--command)\s+['"]?SELECT\s/i, description: 'Database SELECT queries' },

  // Process management (safe)
  { pattern: /^(ps|top|htop|pgrep|lsof)\s*/, description: 'Process viewing' },
];

/**
 * Patterns that are always blocked regardless of allowlist
 */
const BLOCKED_PATTERNS: RegExp[] = [
  // Destructive filesystem operations
  /rm\s+(-[rf]+\s+)*[\/~]/,
  /rmdir\s+\/s/i,
  /del\s+\/[fsq]/i,

  // Disk/partition operations
  /mkfs[.\s]/,
  /fdisk/,
  /parted/,
  /dd\s+if=/,
  /diskpart/i,

  // System control
  /shutdown/i,
  /reboot/i,
  /poweroff/i,
  /halt\b/i,
  /init\s+[06]/,

  // Privilege escalation
  /sudo\s/,
  /su\s+-/,
  /doas\s/,

  // Remote code execution patterns
  /curl\b[^|]*\|\s*(sh|bash|zsh|python)/i,
  /wget\b[^|]*\|\s*(sh|bash|zsh|python)/i,
  /\beval\s*\(/,
  /Invoke-Expression/i,
  /\bIEX\b/,

  // Fork bomb patterns
  /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/,

  // Windows-specific dangerous commands
  /bcdedit/i,
  /reg\s+(delete|add)\b/i,
  /sc\s+(delete|create)\b/i,
  /net\s+(user|localgroup)\b/i,
  /cipher\s+\/w:/i,

  // Permission changes that could break security
  /chmod\s+(-R\s+)?[0-7]*[2367][0-7]*\s+\//,
  /chown\s+-R\s+/,
];

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

  /**
   * Validates a command against the allowlist and blocklist
   * Returns { allowed: true, requiresConfirmation } or { allowed: false, reason }
   */
  validateCommand(command: string): { allowed: true; requiresConfirmation: boolean; matchedRule?: string } | { allowed: false; reason: string } {
    const trimmedCommand = command.trim();

    // First check blocklist - these are always rejected
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(trimmedCommand)) {
        logger.warn('command_blocked', { command: trimmedCommand, pattern: pattern.toString() });
        return {
          allowed: false,
          reason: 'Command matches a blocked pattern for safety reasons',
        };
      }
    }

    // Check if sandboxing is enabled (default: true)
    const sandboxEnabled = backendConfig.tools.commandSandbox?.enabled ?? true;

    if (!sandboxEnabled) {
      // If sandbox is disabled, allow all commands not in blocklist
      return { allowed: true, requiresConfirmation: false };
    }

    // Check allowlist
    for (const entry of COMMAND_ALLOWLIST) {
      if (entry.pattern.test(trimmedCommand)) {
        logger.info('command_allowed', { command: trimmedCommand, rule: entry.description });
        return {
          allowed: true,
          requiresConfirmation: entry.requiresConfirmation ?? false,
          matchedRule: entry.description,
        };
      }
    }

    // Command not in allowlist
    logger.warn('command_not_allowed', { command: trimmedCommand });
    return {
      allowed: false,
      reason: `Command not in allowlist. For security, only common development commands are allowed. ` +
        `If you need to run this command, ask the user to execute it manually or disable command sandboxing.`,
    };
  }

  async runCommand(params: RunCommandParams): Promise<CommandResult> {
    // Validate command against allowlist/blocklist
    const validation = this.validateCommand(params.command);

    if (!validation.allowed) {
      return {
        stdout: '',
        stderr: validation.reason,
        exitCode: 1,
      };
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
              match: lineText.substring(index, index + params.query.length),
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
