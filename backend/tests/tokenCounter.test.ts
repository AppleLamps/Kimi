import { estimateTokens, estimateMessageTokens, estimateMessagesTokens, getRemainingTokens, isApproachingLimit } from '../src/utils/tokenCounter.js';
import type { Message } from '../src/types.js';

describe('Token Counter', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should estimate tokens for short text', () => {
      const text = 'Hello, world!';
      expect(estimateTokens(text)).toBeGreaterThan(0);
    });

    it('should estimate roughly 4 characters per token', () => {
      const text = 'a'.repeat(400);
      expect(estimateTokens(text)).toBe(100);
    });
  });

  describe('estimateMessageTokens', () => {
    it('should estimate tokens for simple message', () => {
      const message: Message = {
        role: 'user',
        content: 'Hello, this is a test message!',
      };
      const tokens = estimateMessageTokens(message);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should include overhead for message structure', () => {
      const message: Message = {
        role: 'user',
        content: 'test',
      };
      const contentTokens = estimateTokens('test');
      const messageTokens = estimateMessageTokens(message);
      expect(messageTokens).toBeGreaterThan(contentTokens);
    });

    it('should count tool calls', () => {
      const message: Message = {
        role: 'assistant',
        content: 'I will call a tool',
        tool_calls: [
          {
            id: '1',
            type: 'function',
            function: {
              name: 'test_tool',
              arguments: '{"param": "value"}',
            },
          },
        ],
      };
      const tokens = estimateMessageTokens(message);
      expect(tokens).toBeGreaterThan(estimateTokens('I will call a tool'));
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should sum tokens from multiple messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant response' },
      ];
      const total = estimateMessagesTokens(messages);
      const individual = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
      expect(total).toBe(individual);
    });

    it('should return 0 for empty array', () => {
      expect(estimateMessagesTokens([])).toBe(0);
    });
  });

  describe('getRemainingTokens', () => {
    it('should calculate remaining tokens', () => {
      expect(getRemainingTokens(100, 60)).toBe(40);
    });

    it('should return 0 when at or over limit', () => {
      expect(getRemainingTokens(100, 100)).toBe(0);
      expect(getRemainingTokens(100, 110)).toBe(0);
    });
  });

  describe('isApproachingLimit', () => {
    it('should detect when approaching default threshold (80%)', () => {
      expect(isApproachingLimit(85, 100)).toBe(true);
      expect(isApproachingLimit(79, 100)).toBe(false);
    });

    it('should use custom threshold', () => {
      expect(isApproachingLimit(70, 100, 70)).toBe(true);
      expect(isApproachingLimit(69, 100, 70)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isApproachingLimit(100, 100, 100)).toBe(true);
      expect(isApproachingLimit(0, 100, 0)).toBe(true);
    });
  });
});
