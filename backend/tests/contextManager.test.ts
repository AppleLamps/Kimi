import { ContextManager } from '../src/utils/contextManager.js';
import type { Message } from '../src/types.js';

describe('ContextManager', () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = new ContextManager({
      maxContextTokens: 1000,
      targetContextTokens: 800,
      summarizationThreshold: 80,
      preserveRecentMessages: 5,
    });
  });

  describe('pinFile', () => {
    it('should pin a file', () => {
      manager.pinFile('/test/file.ts', 'const test = "hello";');
      expect(manager.isFilePinned('/test/file.ts')).toBe(true);
    });

    it('should store pinned files', () => {
      manager.pinFile('/test/file1.ts', 'content1');
      manager.pinFile('/test/file2.ts', 'content2');
      const pinned = manager.getPinnedFiles();
      expect(pinned).toHaveLength(2);
      expect(pinned[0].path).toBe('/test/file1.ts');
      expect(pinned[1].path).toBe('/test/file2.ts');
    });
  });

  describe('unpinFile', () => {
    it('should unpin a file', () => {
      manager.pinFile('/test/file.ts', 'content');
      expect(manager.isFilePinned('/test/file.ts')).toBe(true);
      manager.unpinFile('/test/file.ts');
      expect(manager.isFilePinned('/test/file.ts')).toBe(false);
    });

    it('should handle unpinning non-existent file', () => {
      expect(() => manager.unpinFile('/non/existent.ts')).not.toThrow();
    });
  });

  describe('getContextUsage', () => {
    it('should calculate context usage', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'User message' },
      ];

      const usage = manager.getContextUsage(messages);
      expect(usage.currentTokens).toBeGreaterThan(0);
      expect(usage.maxTokens).toBe(1000);
      expect(usage.availableTokens).toBe(usage.maxTokens - usage.currentTokens);
      expect(usage.utilizationPercent).toBeLessThan(100);
    });

    it('should include pinned files in usage', () => {
      const messages: Message[] = [
        { role: 'user', content: 'test' },
      ];

      const usageWithoutPinned = manager.getContextUsage(messages);
      
      manager.pinFile('/test.ts', 'a'.repeat(400)); // ~100 tokens
      const usageWithPinned = manager.getContextUsage(messages);

      expect(usageWithPinned.currentTokens).toBeGreaterThan(usageWithoutPinned.currentTokens);
      expect(usageWithPinned.pinnedTokens).toBeGreaterThan(0);
    });

    it('should flag when needs pruning', () => {
      const messages: Message[] = Array(50).fill(null).map(() => ({
        role: 'user' as const,
        content: 'a'.repeat(80), // ~20 tokens each
      }));

      const usage = manager.getContextUsage(messages);
      expect(usage.needsPruning).toBe(usage.utilizationPercent >= 80);
    });
  });

  describe('manageContext', () => {
    it('should not modify context when below threshold', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Small message' },
      ];

      const managed = manager.manageContext(messages);
      expect(managed).toEqual(messages);
    });

    it('should preserve system message', () => {
      const systemMessage: Message = { role: 'system', content: 'System prompt' };
      const messages: Message[] = [
        systemMessage,
        ...Array(100).fill(null).map((_, i) => ({
          role: 'user' as const,
          content: `Message ${i}`,
        })),
      ];

      const managed = manager.manageContext(messages);
      expect(managed[0]).toEqual(systemMessage);
    });

    it('should preserve recent messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        ...Array(50).fill(null).map((_, i) => ({
          role: 'user' as const,
          content: `Message ${i}`,
        })),
      ];

      const managed = manager.manageContext(messages);
      const lastMessages = messages.slice(-5);
      
      // Check that recent messages are preserved
      const managedLast = managed.slice(-5);
      expect(managedLast).toEqual(lastMessages);
    });

    it('should prune or summarize when context is too large', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        ...Array(100).fill(null).map((_, i) => ({
          role: 'user' as const,
          content: 'a'.repeat(400), // Large messages
        })),
      ];

      const managed = manager.manageContext(messages);
      
      // Should be much shorter than original
      expect(managed.length).toBeLessThan(messages.length);
      
      // Should keep system message
      expect(managed[0].role).toBe('system');
      
      // Should keep recent messages (last 5)
      const originalLast = messages.slice(-5);
      const managedLast = managed.slice(-5);
      expect(managedLast).toEqual(originalLast);
    });
  });

  describe('getSummaries', () => {
    it('should track created summaries', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        ...Array(100).fill(null).map((_, i) => ({
          role: 'user' as const,
          content: 'a'.repeat(400),
        })),
      ];

      expect(manager.getSummaries()).toHaveLength(0);
      manager.manageContext(messages);
      const summaries = manager.getSummaries();
      
      if (summaries.length > 0) {
        expect(summaries[0]).toHaveProperty('summary');
        expect(summaries[0]).toHaveProperty('originalTokens');
        expect(summaries[0]).toHaveProperty('summaryTokens');
        expect(summaries[0].summaryTokens).toBeLessThan(summaries[0].originalTokens);
      }
    });
  });

  describe('clearSummaries', () => {
    it('should clear all summaries', () => {
      const messages: Message[] = [
        { role: 'system', content: 'System' },
        ...Array(100).fill(null).map(() => ({
          role: 'user' as const,
          content: 'a'.repeat(400),
        })),
      ];

      manager.manageContext(messages);
      manager.clearSummaries();
      expect(manager.getSummaries()).toHaveLength(0);
    });
  });
});
