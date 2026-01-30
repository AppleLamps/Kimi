import OpenAI from 'openai';
import type { Message, ToolDefinition, ToolCall } from '../types.js';

// Moonshot API is OpenAI-compatible
const MOONSHOT_BASE_URL = 'https://api.moonshot.cn/v1';
const DEFAULT_MODEL = 'kimi-k2-0711-preview'; // Kimi K2.5
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;

export interface ChatCompletionResponse {
  content: string | null;
  toolCalls: ToolCall[] | null;
  finishReason: string;
}

export class MoonshotClient {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = DEFAULT_MODEL) {
    this.client = new OpenAI({
      apiKey,
      baseURL: MOONSHOT_BASE_URL,
    });
    this.model = model;
  }

  async chat(
    messages: Message[],
    tools: ToolDefinition[],
    temperature: number = 0.3
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

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: formattedMessages,
          tools: tools.length > 0 ? tools : undefined,
          temperature,
          max_tokens: 4096,
        });

        const choice = response.choices[0];
        const message = choice.message;

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
        };
      } catch (error) {
        lastError = error;
        const retryable = this.isRetryableError(error);
        if (!retryable || attempt === MAX_RETRIES) {
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
    const expDelay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
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

    return `Moonshot API request failed after ${MAX_RETRIES + 1} attempts: ${message}`;
  }
}
