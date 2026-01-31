export interface DiffResult {
  id: string;
  path: string;
  original?: string;
  proposed?: string;
  diff: string;
  operation?: 'create' | 'modify' | 'delete' | 'move';
  oldPath?: string;
  newPath?: string;
}

export interface DiffComment {
  id: string;
  diffId: string;
  side: 'original' | 'proposed';
  line: number;
  text: string;
  createdAt: string;
}

export interface AgentUpdate {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'diff_proposed' | 'message' | 'message_delta' | 'complete' | 'error' | 'info' | 'progress';
  data: unknown;
}

export type LogSeverity = 'error' | 'tool' | 'thinking' | 'info';

export interface ThinkingData {
  iteration: number;
}

export interface ToolCallData {
  name: string;
  arguments: string;
}

export interface ToolResultData {
  toolCallId: string;
  result: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface MessageData {
  content: string;
  usage?: TokenUsage;
}

export interface ErrorData {
  message: string;
}

export interface CompleteData {
  message: string;
}

export interface ProgressData {
  current: number;
  total: number;
  stage?: string;
}

export interface LogEntry {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'message' | 'error' | 'info' | 'user';
  severity: LogSeverity;
  timestamp: Date;
  content: string;
  data?: unknown;
}

export interface WorkspaceInfo {
  path: string;
  name: string;
  isGitRepo: boolean;
  fileCount: number;
}

export interface ModelConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  baseUrl?: string;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface PersistedAgentState {
  taskId: string;
  task: string;
  messages: AgentMessage[];
  pendingDiffs: DiffResult[];
  isRunning: boolean;
  isComplete: boolean;
  workspacePath: string;
  modelConfig: ModelConfig;
}

export interface PersistedLogEntry {
  id: string;
  type: LogEntry['type'];
  severity?: LogSeverity;
  timestamp: string;
  content: string;
  data?: unknown;
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

export interface SessionRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workspacePath: string;
  logs: PersistedLogEntry[];
  pendingDiffs: DiffResult[];
  diffComments?: DiffComment[];
  agentState?: PersistedAgentState | null;
  modelConfig?: ModelConfig | null;
}
