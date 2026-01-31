import { v4 as uuidv4 } from 'uuid';
import { MoonshotClient } from '../api/moonshotClient.js';
import { ToolExecutor } from './tools.js';
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from './systemPrompt.js';
import { backendConfig } from '../config.js';
import { ContextManager } from '../utils/contextManager.js';
import {
  ValidationError,
  formatValidationIssues,
  parseWithSchema,
  toolInputSchemas,
} from '../validation.js';
import type {
  Message,
  AgentState,
  AgentUpdate,
  DiffResult,
  ListFilesParams,
  ReadFileParams,
  ProposeFileChangeParams,
  ProposeFileChangesParams,
  RunCommandParams,
  SearchFilesParams,
  GitOperationsParams,
  WebSearchParams,
  CreateDirectoryParams,
  DeleteFileParams,
  MoveFileParams,
  RunTestsParams,
  ModelConfig,
  PinnedFile,
} from '../types.js';

export type UpdateCallback = (update: AgentUpdate) => void;

const MAX_ITERATIONS = backendConfig.agent.maxIterations;

export class AgentLoop {
  private client: MoonshotClient;
  private toolExecutor: ToolExecutor;
  private contextManager: ContextManager;
  private state: AgentState;
  private onUpdate: UpdateCallback;
  private abortController: AbortController | null = null;

  constructor(
    apiKey: string,
    workspacePath: string,
    task: string,
    onUpdate: UpdateCallback,
    modelConfig?: ModelConfig
  ) {
    const resolvedModelConfig: ModelConfig = {
      model: modelConfig?.model ?? backendConfig.model.defaultModel,
      temperature: modelConfig?.temperature ?? backendConfig.model.defaultTemperature,
      maxTokens: modelConfig?.maxTokens ?? backendConfig.model.defaultMaxTokens,
      baseUrl: modelConfig?.baseUrl ?? backendConfig.model.defaultBaseUrl,
    };

    this.client = new MoonshotClient(
      apiKey,
      resolvedModelConfig.model,
      resolvedModelConfig.baseUrl ?? backendConfig.model.defaultBaseUrl
    );
    this.toolExecutor = new ToolExecutor(workspacePath);
    this.contextManager = new ContextManager({
      maxContextTokens: backendConfig.contextManagement.maxContextTokens,
      targetContextTokens: backendConfig.contextManagement.targetContextTokens,
      summarizationThreshold: backendConfig.contextManagement.summarizationThreshold,
      preserveRecentMessages: backendConfig.contextManagement.preserveRecentMessages,
    });
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
      modelConfig: resolvedModelConfig,
      pinnedFiles: [],
      contextUsage: this.contextManager.getContextUsage([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: task },
      ]),
    };
  }

  getState(): AgentState {
    return this.state;
  }

  getSerializableState(): {
    taskId: string;
    task: string;
    messages: Message[];
    pendingDiffs: DiffResult[];
    isRunning: boolean;
    isComplete: boolean;
    workspacePath: string;
    modelConfig: ModelConfig;
    pinnedFiles: PinnedFile[];
    contextUsage: ReturnType<ContextManager['getContextUsage']>;
  } {
    return {
      taskId: this.state.taskId,
      task: this.state.task,
      messages: this.state.messages,
      pendingDiffs: this.toolExecutor.getPendingDiffs().map((diff) => this.toClientDiff(diff)),
      isRunning: this.state.isRunning,
      isComplete: this.state.isComplete,
      workspacePath: this.state.workspacePath,
      modelConfig: this.state.modelConfig,
      pinnedFiles: this.contextManager.getPinnedFiles().map((file) => ({
        path: file.path,
        content: file.content,
        addedAt: file.addedAt.toISOString(),
      })),
      contextUsage: this.contextManager.getContextUsage(this.state.messages),
    };
  }

  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }

  setUpdateCallback(onUpdate: UpdateCallback): void {
    this.onUpdate = onUpdate;
  }

  async start(): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Agent is already running');
    }

    this.state.isRunning = true;
    this.abortController = new AbortController();

    this.onUpdate({
      type: 'progress',
      data: { current: 0, total: MAX_ITERATIONS, stage: 'starting' },
    });

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

  async pinFile(path: string): Promise<void> {
    try {
      const content = await this.toolExecutor.readFile({ path });
      this.contextManager.pinFile(path, content);
      
      // Update state
      this.state.pinnedFiles = this.contextManager.getPinnedFiles().map((file) => ({
        path: file.path,
        content: file.content,
        addedAt: file.addedAt.toISOString(),
      }));
      this.state.contextUsage = this.contextManager.getContextUsage(this.state.messages);

      // Notify UI
      this.onUpdate({
        type: 'context_update',
        data: {
          pinnedFiles: this.state.pinnedFiles,
          contextUsage: this.state.contextUsage,
        },
      });

      this.onUpdate({
        type: 'info',
        data: { message: `Pinned file: ${path}` },
      });
    } catch (error) {
      this.onUpdate({
        type: 'error',
        data: { message: `Failed to pin file ${path}: ${(error as Error).message}` },
      });
      throw error;
    }
  }

  unpinFile(path: string): void {
    this.contextManager.unpinFile(path);
    
    // Update state
    this.state.pinnedFiles = this.contextManager.getPinnedFiles().map((file) => ({
      path: file.path,
      content: file.content,
      addedAt: file.addedAt.toISOString(),
    }));
    this.state.contextUsage = this.contextManager.getContextUsage(this.state.messages);

    // Notify UI
    this.onUpdate({
      type: 'context_update',
      data: {
        pinnedFiles: this.state.pinnedFiles,
        contextUsage: this.state.contextUsage,
      },
    });

    this.onUpdate({
      type: 'info',
      data: { message: `Unpinned file: ${path}` },
    });
  }

  private updateContextUsage(): void {
    this.state.contextUsage = this.contextManager.getContextUsage(this.state.messages);
    
    this.onUpdate({
      type: 'context_update',
      data: {
        pinnedFiles: this.state.pinnedFiles,
        contextUsage: this.state.contextUsage,
      },
    });
  }

  private async runLoop(): Promise<void> {
    let iterations = 0;

    while (!this.state.isComplete && iterations < MAX_ITERATIONS) {
      if (this.abortController?.signal.aborted) {
        break;
      }

      iterations++;
      this.onUpdate({
        type: 'progress',
        data: { current: iterations, total: MAX_ITERATIONS, stage: 'thinking' },
      });
      this.onUpdate({
        type: 'thinking',
        data: { iteration: iterations },
      });

      // Apply context management before making API call
      this.state.messages = this.contextManager.manageContext(this.state.messages);
      this.updateContextUsage();

      // Get next action from the model
      let response: Awaited<ReturnType<MoonshotClient['chat']>>;
      let messageId: string | null = null;
      try {
        const { temperature, maxTokens } = this.state.modelConfig;
        messageId = uuidv4();
        response = await this.client.chatStream(
          this.state.messages,
          TOOL_DEFINITIONS,
          temperature,
          maxTokens,
          (delta) => {
            if (!delta) return;
            this.onUpdate({
              type: 'message_delta',
              data: { messageId, delta },
            });
          },
          this.abortController?.signal
        );
      } catch (error) {
        this.onUpdate({
          type: 'error',
          data: { message: this.formatChatError(error) },
        });
        break;
      }

      // Handle text response
      if (response.content) {
        this.state.messages.push({
          role: 'assistant',
          content: response.content,
        });

        this.onUpdate({
          type: 'message',
          data: { content: response.content, usage: response.usage, messageId },
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
            this.onUpdate({
              type: 'progress',
              data: { current: MAX_ITERATIONS, total: MAX_ITERATIONS, stage: 'complete' },
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
      this.onUpdate({
        type: 'progress',
        data: { current: MAX_ITERATIONS, total: MAX_ITERATIONS, stage: 'limit' },
      });
    }
  }

  private async executeTool(toolCall: {
    function: { name: string; arguments: string };
  }): Promise<string> {
    const { name, arguments: argsJson } = toolCall.function;

    try {
      const args = JSON.parse(argsJson);
      const schema = toolInputSchemas[name];
      const validatedArgs = schema ? parseWithSchema(schema, args) : args;

      switch (name) {
        case 'list_files': {
          const files = await this.toolExecutor.listFiles(
            validatedArgs as ListFilesParams
          );
          return JSON.stringify(files, null, 2);
        }

        case 'read_file': {
          const content = await this.toolExecutor.readFile(
            validatedArgs as ReadFileParams
          );
          return content;
        }

        case 'propose_file_change': {
          const diff = await this.toolExecutor.proposeFileChange(
            validatedArgs as ProposeFileChangeParams
          );

          // Notify UI about the proposed diff
          this.onUpdate({
            type: 'diff_proposed',
            data: this.toClientDiff(diff),
          });

          return `Diff proposed for ${diff.path}. Waiting for user approval. Diff ID: ${diff.id}`;
        }

        case 'propose_file_changes': {
          const diffs = await this.toolExecutor.proposeFileChanges(
            validatedArgs as ProposeFileChangesParams
          );

          diffs.forEach((diff) => {
            this.onUpdate({
              type: 'diff_proposed',
              data: this.toClientDiff(diff),
            });
          });

          return `Diffs proposed for ${diffs.length} file(s). Waiting for user approval. Diff IDs: ${diffs.map((diff) => diff.id).join(', ')}`;
        }

        case 'run_command': {
          const result = await this.toolExecutor.runCommand(
            validatedArgs as RunCommandParams
          );
          return `Exit code: ${result.exitCode}\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`;
        }

        case 'search_files': {
          const results = await this.toolExecutor.searchFiles(
            validatedArgs as SearchFilesParams
          );
          return JSON.stringify(results, null, 2);
        }

        case 'git_operations': {
          const result = await this.toolExecutor.gitOperations(
            validatedArgs as GitOperationsParams
          );
          return JSON.stringify(result, null, 2);
        }

        case 'web_search': {
          const result = await this.toolExecutor.webSearch(
            validatedArgs as WebSearchParams
          );
          return JSON.stringify(result, null, 2);
        }

        case 'create_directory': {
          const result = await this.toolExecutor.createDirectory(
            validatedArgs as CreateDirectoryParams
          );
          return JSON.stringify(result, null, 2);
        }

        case 'delete_file': {
          const diff = await this.toolExecutor.proposeDeleteFile(
            validatedArgs as DeleteFileParams
          );
          this.onUpdate({
            type: 'diff_proposed',
            data: this.toClientDiff(diff),
          });
          return `Delete proposed for ${diff.path}. Waiting for user approval. Diff ID: ${diff.id}`;
        }

        case 'move_file': {
          const diff = await this.toolExecutor.proposeMoveFile(
            validatedArgs as MoveFileParams
          );
          this.onUpdate({
            type: 'diff_proposed',
            data: this.toClientDiff(diff),
          });
          return `Move proposed from ${diff.oldPath} to ${diff.newPath}. Waiting for user approval. Diff ID: ${diff.id}`;
        }

        case 'run_tests': {
          const result = await this.toolExecutor.runTests(
            validatedArgs as RunTestsParams
          );
          return JSON.stringify(result, null, 2);
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      const message = error instanceof ValidationError
        ? `Validation failed: ${formatValidationIssues(error.issues)}`
        : error instanceof Error
          ? error.message
          : String(error);
      const isParseError = error instanceof SyntaxError;
      const isValidationError = error instanceof ValidationError;
      const actionableHint = isParseError
        ? 'Tool arguments were invalid JSON. Please retry.'
        : isValidationError
          ? 'Tool arguments did not match the required schema. Please retry.'
          : 'Please check the inputs and retry.';

      this.onUpdate({
        type: 'error',
        data: { message: `Tool ${name} failed: ${message}. ${actionableHint}` },
      });

      return `Error executing tool ${name}: ${message}`;
    }
  }

  private formatChatError(error: unknown): string {
    const fallback = 'The model request failed. Please check your network connection and API key, then retry.';

    if (error instanceof Error) {
      return `Model request failed: ${error.message}. Please check your network connection and API key, then retry.`;
    }

    return fallback;
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

  async applyAllDiffs(): Promise<DiffResult[]> {
    const pending = this.toolExecutor.getPendingDiffs();
    const applied = await this.toolExecutor.applyDiffsAtomically(pending);

    if (applied.length > 0) {
      this.state.messages.push({
        role: 'user',
        content: `[System] All pending diffs (${applied.length}) have been approved and applied atomically.`,
      });
    }

    return applied;
  }

  rejectAllDiffs(): DiffResult[] {
    const pending = this.toolExecutor.getPendingDiffs();
    const rejected: DiffResult[] = [];

    for (const diff of pending) {
      const result = this.rejectDiff(diff.id);
      if (result) {
        rejected.push(result);
      }
    }

    if (rejected.length > 0) {
      this.state.messages.push({
        role: 'user',
        content: `[System] All pending diffs (${rejected.length}) have been rejected. Please propose alternatives or ask for clarification.`,
      });
    }

    return rejected;
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
    return this.toolExecutor.getPendingDiffs().map((diff) => this.toClientDiff(diff));
  }

  getPendingDiff(diffId: string): DiffResult | undefined {
    return this.toolExecutor.getPendingDiff(diffId);
  }

  private toClientDiff(diff: DiffResult): DiffResult {
    const { original, proposed, ...rest } = diff;
    return rest;
  }
}
