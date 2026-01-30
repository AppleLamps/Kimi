export interface DiffResult {
  id: string;
  path: string;
  original: string;
  proposed: string;
  diff: string;
}

export interface AgentUpdate {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'diff_proposed' | 'message' | 'complete' | 'error' | 'info';
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

export interface MessageData {
  content: string;
}

export interface ErrorData {
  message: string;
}

export interface CompleteData {
  message: string;
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

export interface SessionRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  workspacePath: string;
  logs: PersistedLogEntry[];
  pendingDiffs: DiffResult[];
  agentState?: PersistedAgentState | null;
  modelConfig?: ModelConfig | null;
}
