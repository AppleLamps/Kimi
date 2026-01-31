/**
 * Token counter utility for estimating token usage
 * Uses a simple heuristic: ~4 characters per token (OpenAI rule of thumb)
 * For more accuracy, could integrate tiktoken library
 */

import type { Message } from '../types.js';

const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count for a string
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate token count for a message
 */
export function estimateMessageTokens(message: Message): number {
  let total = estimateTokens(message.content);
  
  // Add tokens for tool calls if present
  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      total += estimateTokens(toolCall.function.name);
      total += estimateTokens(toolCall.function.arguments);
      total += 10; // Overhead for tool call structure
    }
  }
  
  // Add overhead for message structure
  total += 4; // role, metadata overhead
  
  return total;
}

/**
 * Estimate total token count for an array of messages
 */
export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

/**
 * Calculate remaining tokens given a limit and current usage
 */
export function getRemainingTokens(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

/**
 * Check if we're approaching the context limit
 * Returns true if usage is above the threshold percentage
 */
export function isApproachingLimit(
  used: number,
  limit: number,
  thresholdPercent: number = 80
): boolean {
  return (used / limit) * 100 >= thresholdPercent;
}
