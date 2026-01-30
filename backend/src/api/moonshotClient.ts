import OpenAI from 'openai';
import type { Message, ToolDefinition, ToolCall } from '../types.js';

// Moonshot API is OpenAI-compatible
const MOONSHOT_BASE_URL = 'https://api.moonshot.cn/v1';
const DEFAULT_MODEL = 'kimi-k2-0711-preview'; // Kimi K2.5

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
  }
}
