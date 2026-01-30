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

export interface RunCommandParams {
  command: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DiffResult {
  path: string;
  original: string;
  proposed: string;
  diff: string;
  id: string;
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
}

// WebSocket events
export interface AgentUpdate {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'diff_proposed' | 'message' | 'complete' | 'error';
  data: unknown;
}

export interface TaskRequest {
  task: string;
  workspacePath: string;
}

export interface ApplyDiffRequest {
  diffId: string;
}
