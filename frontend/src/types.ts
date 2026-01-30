export interface DiffResult {
  id: string;
  path: string;
  original: string;
  proposed: string;
  diff: string;
}

export interface AgentUpdate {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'diff_proposed' | 'message' | 'complete' | 'error';
  data: unknown;
}

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
