import { v4 as uuidv4 } from 'uuid';
import { MoonshotClient } from '../api/moonshotClient.js';
import { ToolExecutor } from './tools.js';
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from './systemPrompt.js';
import type {
  Message,
  AgentState,
  AgentUpdate,
  DiffResult,
  ListFilesParams,
  ReadFileParams,
  ProposeFileChangeParams,
  RunCommandParams,
} from '../types.js';

export type UpdateCallback = (update: AgentUpdate) => void;

const MAX_ITERATIONS = 50; // Safety limit

export class AgentLoop {
  private client: MoonshotClient;
  private toolExecutor: ToolExecutor;
  private state: AgentState;
  private onUpdate: UpdateCallback;
  private abortController: AbortController | null = null;

  constructor(
    apiKey: string,
    workspacePath: string,
    task: string,
    onUpdate: UpdateCallback
  ) {
    this.client = new MoonshotClient(apiKey);
    this.toolExecutor = new ToolExecutor(workspacePath);
    this.onUpdate = onUpdate;

    this.state = {
      taskId: uuidv4(),
      task,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: task },
      ],
      pendingDiffs: new Map(),
      isRunning: false,
      isComplete: false,
      workspacePath,
    };
  }

  getState(): AgentState {
    return this.state;
  }

  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }

  async start(): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Agent is already running');
    }

    this.state.isRunning = true;
    this.abortController = new AbortController();

    try {
      await this.runLoop();
    } catch (error) {
      this.onUpdate({
        type: 'error',
        data: { message: (error as Error).message },
      });
    } finally {
      this.state.isRunning = false;
    }
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.state.isRunning = false;
  }

  private async runLoop(): Promise<void> {
    let iterations = 0;

    while (!this.state.isComplete && iterations < MAX_ITERATIONS) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      iterations++;
      this.onUpdate({
        type: 'thinking',
        data: { iteration: iterations },
      });

      // Get next action from the model
      const response = await this.client.chat(
        this.state.messages,
        TOOL_DEFINITIONS,
        0.3
      );

      // Handle text response
      if (response.content) {
        this.state.messages.push({
          role: 'assistant',
          content: response.content,
        });

        this.onUpdate({
          type: 'message',
          data: { content: response.content },
        });

        // Check if agent declares completion
        const lowerContent = response.content.toLowerCase();
        if (
          lowerContent.includes('task is complete') ||
          lowerContent.includes('task complete') ||
          lowerContent.includes('i have completed') ||
          lowerContent.includes('the changes have been') ||
          (response.finishReason === 'stop' && !response.toolCalls)
        ) {
          // Give the agent a chance to confirm
          if (!response.toolCalls) {
            this.state.isComplete = true;
            this.onUpdate({
              type: 'complete',
              data: { message: 'Agent completed the task' },
            });
            break;
          }
        }
      }

      // Handle tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        // Add assistant message with tool calls
        this.state.messages.push({
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolCalls,
        });

        // Execute each tool call
        for (const toolCall of response.toolCalls) {
          this.onUpdate({
            type: 'tool_call',
            data: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          });

          const result = await this.executeTool(toolCall);

          // Add tool result message
          this.state.messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });

          this.onUpdate({
            type: 'tool_result',
            data: {
              toolCallId: toolCall.id,
              result: result.substring(0, 1000), // Truncate for display
            },
          });
        }
      } else if (!response.content) {
        // No content and no tool calls - something went wrong
        this.onUpdate({
          type: 'error',
          data: { message: 'Agent returned empty response' },
        });
        break;
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      this.onUpdate({
        type: 'error',
        data: { message: 'Agent reached maximum iterations limit' },
      });
    }
  }

  private async executeTool(toolCall: {
    function: { name: string; arguments: string };
  }): Promise<string> {
    const { name, arguments: argsJson } = toolCall.function;

    try {
      const args = JSON.parse(argsJson);

      switch (name) {
        case 'list_files': {
          const files = await this.toolExecutor.listFiles(
            args as ListFilesParams
          );
          return JSON.stringify(files, null, 2);
        }

        case 'read_file': {
          const content = await this.toolExecutor.readFile(
            args as ReadFileParams
          );
          return content;
        }

        case 'propose_file_change': {
          const diff = await this.toolExecutor.proposeFileChange(
            args as ProposeFileChangeParams
          );

          // Notify UI about the proposed diff
          this.onUpdate({
            type: 'diff_proposed',
            data: diff,
          });

          return `Diff proposed for ${diff.path}. Waiting for user approval. Diff ID: ${diff.id}`;
        }

        case 'run_command': {
          const result = await this.toolExecutor.runCommand(
            args as RunCommandParams
          );
          return `Exit code: ${result.exitCode}\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`;
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      return `Error executing tool ${name}: ${(error as Error).message}`;
    }
  }

  // Called by the server when user approves a diff
  async applyDiff(diffId: string): Promise<DiffResult | null> {
    const diff = this.toolExecutor.getPendingDiff(diffId);
    if (!diff) {
      return null;
    }

    await this.toolExecutor.applyDiff(diffId);

    // Notify the agent that the diff was applied
    this.state.messages.push({
      role: 'user',
      content: `[System] The diff for ${diff.path} (ID: ${diffId}) has been approved and applied.`,
    });

    return diff;
  }

  // Called by the server when user rejects a diff
  rejectDiff(diffId: string): DiffResult | null {
    const diff = this.toolExecutor.getPendingDiff(diffId);
    if (!diff) {
      return null;
    }

    this.toolExecutor.rejectDiff(diffId);

    // Notify the agent that the diff was rejected
    this.state.messages.push({
      role: 'user',
      content: `[System] The diff for ${diff.path} (ID: ${diffId}) has been rejected by the user. Please propose an alternative or ask for clarification.`,
    });

    return diff;
  }

  // Add user message (for follow-up tasks)
  addUserMessage(content: string): void {
    this.state.messages.push({
      role: 'user',
      content,
    });
    this.state.isComplete = false;
  }

  getPendingDiffs(): DiffResult[] {
    return this.toolExecutor.getPendingDiffs();
  }
}
