// Core types for the Kimi Coding Agent

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// Tool-specific types
export interface ListFilesParams {
  path?: string;
}

export interface ReadFileParams {
  path: string;
}

export interface ProposeFileChangeParams {
  path: string;
  new_content: string;
}

export interface ProposeFileChangesParams {
  changes: Array<{
    path: string;
    new_content: string;
  }>;
}

export interface RunCommandParams {
  command: string;
}

export interface SearchFilesParams {
  query: string;
  path?: string;
  is_regex?: boolean;
  case_sensitive?: boolean;
  include?: string[];
  exclude?: string[];
  max_results?: number;
  max_bytes_per_file?: number;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  lineText: string;
  match: string;
}

export interface GitOperationsParams {
  action: 'status' | 'diff' | 'commit' | 'branch' | 'checkout' | 'pull' | 'push';
  args?: Record<string, unknown>;
}

export interface WebSearchParams {
  query: string;
  num_results?: number;
}

export interface CreateDirectoryParams {
  path: string;
  recursive?: boolean;
}

export interface DeleteFileParams {
  path: string;
}

export interface MoveFileParams {
  from: string;
  to: string;
}

export interface RunTestsParams {
  scope?: 'backend' | 'frontend' | 'both' | 'e2e';
  command?: string;
}

export interface TaskCompleteParams {
  summary: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DiffResult {
  path: string;
  original?: string;
  proposed?: string;
  diff: string;
  id: string;
  operation?: 'create' | 'modify' | 'delete' | 'move';
  oldPath?: string;
  newPath?: string;
}

export interface ModelConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  baseUrl?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Pinned file for context management
export interface PinnedFile {
  path: string;
  content: string;
  addedAt: string;
}

// Context usage information
export interface ContextUsage {
  currentTokens: number;
  maxTokens: number;
  pinnedTokens: number;
  availableTokens: number;
  utilizationPercent: number;
  needsPruning: boolean;
}

// Agent state
export interface AgentState {
  taskId: string;
  task: string;
  messages: Message[];
  pendingDiffs: Map<string, DiffResult>;
  isRunning: boolean;
  isComplete: boolean;
  workspacePath: string;
  modelConfig: ModelConfig;
  pinnedFiles?: PinnedFile[];
  contextUsage?: ContextUsage;
}

// WebSocket events
export interface AgentUpdate {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'diff_proposed' | 'command_confirmation' | 'message' | 'message_delta' | 'complete' | 'error' | 'info' | 'progress' | 'context_update';
  data: unknown;
}

export interface TaskRequest {
  task: string;
  workspacePath: string;
  modelConfig?: ModelConfig;
  systemPrompt?: string;
}

export interface ApplyDiffRequest {
  diffId: string;
}

export interface CommandConfirmationRequest {
  commandId: string;
}

export interface GitOperationRequest {
  workspacePath: string;
  remote?: string;
  branch?: string;
}

export interface GitOperationResult {
  action: 'pull' | 'push';
  result: unknown;
}

export interface PinFileRequest {
  path: string;
}

export interface UnpinFileRequest {
  path: string;
}
