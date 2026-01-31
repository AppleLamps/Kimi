import OpenAI from 'openai';
import { backendConfig } from '../config.js';
import type { Message, ToolDefinition, ToolCall } from '../types.js';

export interface ChatCompletionResponse {
  content: string | null;
  toolCalls: ToolCall[] | null;
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class MoonshotClient {
  private client: OpenAI;
  private model: string;

  constructor(
    apiKey: string,
    model: string = backendConfig.model.defaultModel,
    baseUrl: string = backendConfig.model.defaultBaseUrl
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });
    this.model = model;
  }

  async chat(
    messages: Message[],
    tools: ToolDefinition[],
    temperature: number = 0.3,
    maxTokens: number = 100000,
    signal?: AbortSignal
  ): Promise<ChatCompletionResponse> {
    const formattedMessages = messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content,
          tool_call_id: msg.tool_call_id!,
        };
      }
      if (msg.role === 'assistant' && msg.tool_calls) {
        return {
          role: 'assistant' as const,
          content: msg.content,
          tool_calls: msg.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= backendConfig.moonshot.maxRetries; attempt += 1) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: formattedMessages,
          tools: tools.length > 0 ? tools : undefined,
          temperature,
          max_tokens: maxTokens,
          signal,
        });

        const choice = response.choices[0];
        const message = choice.message;

        const usage = response.usage
          ? {
            promptTokens: response.usage.prompt_tokens ?? 0,
            completionTokens: response.usage.completion_tokens ?? 0,
            totalTokens: response.usage.total_tokens ?? 0,
          }
          : undefined;

        return {
          content: message.content,
          toolCalls: message.tool_calls
            ? message.tool_calls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            }))
            : null,
          finishReason: choice.finish_reason || 'stop',
          usage,
        };
      } catch (error) {
        lastError = error;
        const retryable = this.isRetryableError(error);
        if (!retryable || attempt === backendConfig.moonshot.maxRetries) {
          break;
        }

        const delay = this.getBackoffDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw new Error(this.formatRetryError(lastError));
  }

  async chatStream(
    messages: Message[],
    tools: ToolDefinition[],
    temperature: number = 0.3,
    maxTokens: number = 100000,
    onDelta?: (delta: string) => void,
    signal?: AbortSignal
  ): Promise<ChatCompletionResponse> {
    const formattedMessages = messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content,
          tool_call_id: msg.tool_call_id!,
        };
      }
      if (msg.role === 'assistant' && msg.tool_calls) {
        return {
          role: 'assistant' as const,
          content: msg.content,
          tool_calls: msg.tool_calls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= backendConfig.moonshot.maxRetries; attempt += 1) {
      try {
        const stream = await this.client.chat.completions.create({
          model: this.model,
          messages: formattedMessages,
          tools: tools.length > 0 ? tools : undefined,
          temperature,
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
          signal,
        });

        let content = '';
        let finishReason = 'stop';
        let usage: ChatCompletionResponse['usage'];
        const toolCalls: ToolCall[] = [];

        const ensureToolCall = (index: number, id?: string) => {
          if (!toolCalls[index]) {
            toolCalls[index] = {
              id: id ?? `tool_${index}`,
              type: 'function',
              function: {
                name: '',
                arguments: '',
              },
            };
          } else if (id) {
            toolCalls[index].id = id;
          }
          return toolCalls[index];
        };

        for await (const chunk of stream as AsyncIterable<any>) {
          const choice = chunk.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta ?? {};

          if (typeof delta.content === 'string' && delta.content.length > 0) {
            content += delta.content;
            onDelta?.(delta.content);
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index ?? 0;
              const current = ensureToolCall(index, toolCallDelta.id);
              if (toolCallDelta.function?.name) {
                current.function.name = toolCallDelta.function.name;
              }
              if (toolCallDelta.function?.arguments) {
                current.function.arguments += toolCallDelta.function.arguments;
              }
            }
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }

          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens ?? 0,
              completionTokens: chunk.usage.completion_tokens ?? 0,
              totalTokens: chunk.usage.total_tokens ?? 0,
            };
          }
        }

        return {
          content: content.length > 0 ? content : null,
          toolCalls: toolCalls.length > 0 ? toolCalls : null,
          finishReason,
          usage,
        };
      } catch (error) {
        lastError = error;
        const retryable = this.isRetryableError(error);
        if (!retryable || attempt === backendConfig.moonshot.maxRetries) {
          break;
        }

        const delay = this.getBackoffDelay(attempt);
        await this.sleep(delay);
      }
    }

    throw new Error(this.formatRetryError(lastError));
  }

  private isRetryableError(error: unknown): boolean {
    const errorAny = error as { status?: number; code?: string; response?: { status?: number } };
    const status = errorAny?.status ?? errorAny?.response?.status;

    if (status === 429) return true;
    if (typeof status === 'number' && status >= 500 && status < 600) return true;

    const code = errorAny?.code;
    if (!code) return false;

    return ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code);
  }

  private getBackoffDelay(attempt: number): number {
    const expDelay = Math.min(
      backendConfig.moonshot.baseDelayMs * 2 ** attempt,
      backendConfig.moonshot.maxDelayMs
    );
    const jitter = Math.floor(Math.random() * 200);
    return expDelay + jitter;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private formatRetryError(error: unknown): string {
    const errorAny = error as { status?: number; code?: string; message?: string };
    const status = errorAny?.status;
    const code = errorAny?.code;
    const message = errorAny?.message || 'Unknown error';

    if (status === 401 || status === 403) {
      return 'Moonshot API request failed due to authentication. Please check your API key and try again.';
    }

    if (status === 429) {
      return 'Moonshot API rate limit reached. Please wait a moment and retry.';
    }

    if (typeof status === 'number' && status >= 500) {
      return `Moonshot API is temporarily unavailable (HTTP ${status}). Please retry shortly.`;
    }

    if (code) {
      return `Moonshot API request failed (${code}). Please check your network connection and retry.`;
    }

    return `Moonshot API request failed after ${backendConfig.moonshot.maxRetries + 1} attempts: ${message}`;
  }
}
