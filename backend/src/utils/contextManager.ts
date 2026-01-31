/**
 * Context manager for smart context window management
 * Handles message pruning, summarization, and pinned files
 */

import type { Message } from '../types.js';
import { estimateMessagesTokens, estimateMessageTokens } from './tokenCounter.js';

export interface ContextManagerOptions {
  maxContextTokens: number;
  targetContextTokens: number;
  summarizationThreshold: number;
  preserveRecentMessages: number;
}

export interface PinnedFile {
  path: string;
  content: string;
  addedAt: Date;
}

export interface ContextSummary {
  messages: Message[];
  summary: string;
  originalTokens: number;
  summaryTokens: number;
  createdAt: Date;
}

export class ContextManager {
  private options: ContextManagerOptions;
  private pinnedFiles: Map<string, PinnedFile> = new Map();
  private summaries: ContextSummary[] = [];

  constructor(options: ContextManagerOptions) {
    this.options = options;
  }

  /**
   * Pin a file to always keep in context
   */
  pinFile(path: string, content: string): void {
    this.pinnedFiles.set(path, {
      path,
      content,
      addedAt: new Date(),
    });
  }

  /**
   * Unpin a file
   */
  unpinFile(path: string): void {
    this.pinnedFiles.delete(path);
  }

  /**
   * Get all pinned files
   */
  getPinnedFiles(): PinnedFile[] {
    return Array.from(this.pinnedFiles.values());
  }

  /**
   * Check if a file is pinned
   */
  isFilePinned(path: string): boolean {
    return this.pinnedFiles.has(path);
  }

  /**
   * Estimate tokens used by pinned files
   */
  getPinnedFilesTokens(): number {
    let total = 0;
    for (const file of this.pinnedFiles.values()) {
      total += estimateMessageTokens({
        role: 'user',
        content: `File: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``,
      });
    }
    return total;
  }

  /**
   * Get context usage statistics
   */
  getContextUsage(messages: Message[]): {
    currentTokens: number;
    maxTokens: number;
    pinnedTokens: number;
    availableTokens: number;
    utilizationPercent: number;
    needsPruning: boolean;
  } {
    const messageTokens = estimateMessagesTokens(messages);
    const pinnedTokens = this.getPinnedFilesTokens();
    const currentTokens = messageTokens + pinnedTokens;
    const availableTokens = Math.max(0, this.options.maxContextTokens - currentTokens);
    const utilizationPercent = (currentTokens / this.options.maxContextTokens) * 100;
    const needsPruning = utilizationPercent >= this.options.summarizationThreshold;

    return {
      currentTokens,
      maxTokens: this.options.maxContextTokens,
      pinnedTokens,
      availableTokens,
      utilizationPercent,
      needsPruning,
    };
  }

  /**
   * Manage context window by pruning or summarizing messages
   * Preserves system message, recent messages, and tool call pairs
   */
  manageContext(messages: Message[]): Message[] {
    const usage = this.getContextUsage(messages);

    if (!usage.needsPruning) {
      return messages;
    }

    // Try simple pruning first
    const pruned = this.pruneMessages(messages);
    const prunedUsage = this.getContextUsage(pruned);

    if (prunedUsage.currentTokens <= this.options.targetContextTokens) {
      return pruned;
    }

    // If pruning isn't enough, create a summary
    return this.summarizeAndPrune(messages);
  }

  /**
   * Prune old messages while preserving important ones
   */
  private pruneMessages(messages: Message[]): Message[] {
    if (messages.length <= this.options.preserveRecentMessages + 1) {
      return messages;
    }

    const systemMessages = messages.filter((m) => m.role === 'system');
    const recentMessages = messages.slice(-this.options.preserveRecentMessages);

    // Check if we're removing tool call/result pairs
    const middleMessages = messages.slice(1, -this.options.preserveRecentMessages);
    const preservedMiddle = this.preserveToolCallPairs(middleMessages);

    return [...systemMessages, ...preservedMiddle, ...recentMessages];
  }

  /**
   * Preserve tool call and result pairs (should not be split)
   */
  private preserveToolCallPairs(messages: Message[]): Message[] {
    const preserved: Message[] = [];
    let skipNext = false;

    for (let i = 0; i < messages.length; i++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }

      const msg = messages[i];

      // If this is a tool message or assistant with tool calls, check if we should keep it
      if (msg.role === 'tool' || msg.tool_calls) {
        // Keep tool call pairs together
        if (msg.role === 'assistant' && msg.tool_calls && i + 1 < messages.length) {
          // Keep this and all subsequent tool results
          preserved.push(msg);
          for (let j = i + 1; j < messages.length; j++) {
            if (messages[j].role === 'tool') {
              preserved.push(messages[j]);
            } else {
              break;
            }
          }
          skipNext = true;
        }
      }
    }

    return preserved;
  }

  /**
   * Summarize old messages and create a condensed context
   */
  private summarizeAndPrune(messages: Message[]): Message[] {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const recentMessages = messages.slice(-this.options.preserveRecentMessages);

    // Messages to summarize (everything between system and recent)
    const middleMessages = messages.slice(
      systemMessages.length,
      -this.options.preserveRecentMessages
    );

    if (middleMessages.length === 0) {
      return messages;
    }

    // Create a summary of the middle messages
    const summary = this.createSummary(middleMessages);
    const summaryMessage: Message = {
      role: 'user',
      content: `[Context Summary]\nPrevious conversation summary:\n${summary}`,
    };

    // Store the summary for reference
    this.summaries.push({
      messages: middleMessages,
      summary,
      originalTokens: estimateMessagesTokens(middleMessages),
      summaryTokens: estimateMessageTokens(summaryMessage),
      createdAt: new Date(),
    });

    return [...systemMessages, summaryMessage, ...recentMessages];
  }

  /**
   * Create a text summary of messages
   */
  private createSummary(messages: Message[]): string {
    const parts: string[] = [];

    // Summarize key actions and observations
    const toolCalls: string[] = [];
    const fileChanges: string[] = [];
    const commandResults: string[] = [];
    const observations: string[] = [];

    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls) {
        for (const call of msg.tool_calls) {
          toolCalls.push(call.function.name);
        }
      } else if (msg.role === 'tool') {
        const content = msg.content.substring(0, 200);
        if (content.includes('Diff proposed') || content.includes('proposed for')) {
          fileChanges.push(content.split('\n')[0]);
        } else if (content.includes('Exit code:')) {
          commandResults.push(content.split('\n')[0]);
        }
      } else if (msg.role === 'user' && msg.content.includes('[System]')) {
        observations.push(msg.content);
      }
    }

    if (toolCalls.length > 0) {
      parts.push(`Tools used: ${[...new Set(toolCalls)].join(', ')}`);
    }

    if (fileChanges.length > 0) {
      parts.push(`File changes proposed: ${fileChanges.length}`);
    }

    if (commandResults.length > 0) {
      parts.push(`Commands executed: ${commandResults.length}`);
    }

    if (observations.length > 0) {
      parts.push(`Key events: ${observations.slice(0, 3).join('; ')}`);
    }

    return parts.length > 0 ? parts.join('\n') : 'Previous conversation history';
  }

  /**
   * Get all summaries created
   */
  getSummaries(): ContextSummary[] {
    return [...this.summaries];
  }

  /**
   * Clear all summaries
   */
  clearSummaries(): void {
    this.summaries = [];
  }
}
