/// <reference types="jest" />

import {
  SocketRateLimiter,
  createRateLimitedHandler,
  DEFAULT_SOCKET_RATE_LIMITS,
} from '../src/utils/socketRateLimiter.js';

describe('SocketRateLimiter', () => {
  describe('basic rate limiting', () => {
    it('allows events under the limit', () => {
      const limiter = new SocketRateLimiter({
        maxEvents: 5,
        windowMs: 60000,
      });

      for (let i = 0; i < 5; i++) {
        const result = limiter.check('socket-1', 'test:event');
        expect(result.allowed).toBe(true);
      }
    });

    it('blocks events over the limit', () => {
      const limiter = new SocketRateLimiter({
        maxEvents: 3,
        windowMs: 60000,
      });

      // Use up the limit
      for (let i = 0; i < 3; i++) {
        limiter.check('socket-1', 'test:event');
      }

      // Next event should be blocked
      const result = limiter.check('socket-1', 'test:event');
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.retryAfter).toBeGreaterThan(0);
      }
    });

    it('tracks different sockets independently', () => {
      const limiter = new SocketRateLimiter({
        maxEvents: 2,
        windowMs: 60000,
      });

      // Socket 1 uses its limit
      limiter.check('socket-1', 'event');
      limiter.check('socket-1', 'event');

      // Socket 1 should be blocked
      expect(limiter.check('socket-1', 'event').allowed).toBe(false);

      // Socket 2 should still be allowed
      expect(limiter.check('socket-2', 'event').allowed).toBe(true);
    });
  });

  describe('bypass events', () => {
    it('allows bypass events regardless of limit', () => {
      const limiter = new SocketRateLimiter({
        maxEvents: 1,
        windowMs: 60000,
        bypassEvents: ['disconnect', 'error'],
      });

      // Use up the limit
      limiter.check('socket-1', 'regular:event');
      expect(limiter.check('socket-1', 'regular:event').allowed).toBe(false);

      // Bypass events should still work
      expect(limiter.check('socket-1', 'disconnect').allowed).toBe(true);
      expect(limiter.check('socket-1', 'error').allowed).toBe(true);
    });
  });

  describe('window expiration', () => {
    it('resets count after window expires', async () => {
      const limiter = new SocketRateLimiter({
        maxEvents: 2,
        windowMs: 100, // 100ms window for testing
      });

      // Use up the limit
      limiter.check('socket-1', 'event');
      limiter.check('socket-1', 'event');
      expect(limiter.check('socket-1', 'event').allowed).toBe(false);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      expect(limiter.check('socket-1', 'event').allowed).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('removes expired entries on cleanup', async () => {
      const limiter = new SocketRateLimiter({
        maxEvents: 10,
        windowMs: 100,
      });

      limiter.check('socket-1', 'event');
      limiter.check('socket-2', 'event');

      expect(limiter.getStats().activeConnections).toBe(2);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      limiter.cleanup();

      expect(limiter.getStats().activeConnections).toBe(0);
    });
  });

  describe('remove', () => {
    it('removes tracking for a socket', () => {
      const limiter = new SocketRateLimiter({
        maxEvents: 10,
        windowMs: 60000,
      });

      limiter.check('socket-1', 'event');
      expect(limiter.getStats().activeConnections).toBe(1);

      limiter.remove('socket-1');
      expect(limiter.getStats().activeConnections).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns current statistics', () => {
      const limiter = new SocketRateLimiter({
        maxEvents: 10,
        windowMs: 60000,
      });

      limiter.check('socket-1', 'event');
      limiter.check('socket-2', 'event');
      limiter.check('socket-3', 'event');

      const stats = limiter.getStats();
      expect(stats.activeConnections).toBe(3);
      expect(stats.totalTracked).toBe(3);
    });
  });
});

describe('createRateLimitedHandler', () => {
  it('calls handler when not rate limited', () => {
    const limiter = new SocketRateLimiter({
      maxEvents: 10,
      windowMs: 60000,
    });

    const handler = jest.fn();
    const limitedHandler = createRateLimitedHandler(
      limiter,
      'socket-1',
      'test:event',
      handler
    );

    limitedHandler({ data: 'test' });

    expect(handler).toHaveBeenCalledWith({ data: 'test' });
  });

  it('does not call handler when rate limited', () => {
    const limiter = new SocketRateLimiter({
      maxEvents: 1,
      windowMs: 60000,
    });

    const handler = jest.fn();
    const onLimited = jest.fn();
    const limitedHandler = createRateLimitedHandler(
      limiter,
      'socket-1',
      'test:event',
      handler,
      onLimited
    );

    // First call uses the limit
    limitedHandler({ data: 'test1' });
    expect(handler).toHaveBeenCalledTimes(1);

    // Second call should be limited
    limitedHandler({ data: 'test2' });
    expect(handler).toHaveBeenCalledTimes(1); // Still 1
    expect(onLimited).toHaveBeenCalled();
  });
});

describe('DEFAULT_SOCKET_RATE_LIMITS', () => {
  it('has general limit configuration', () => {
    expect(DEFAULT_SOCKET_RATE_LIMITS.general.maxEvents).toBe(60);
    expect(DEFAULT_SOCKET_RATE_LIMITS.general.windowMs).toBe(60000);
    expect(DEFAULT_SOCKET_RATE_LIMITS.general.bypassEvents).toContain('disconnect');
  });

  it('has expensive limit configuration', () => {
    expect(DEFAULT_SOCKET_RATE_LIMITS.expensive.maxEvents).toBe(10);
    expect(DEFAULT_SOCKET_RATE_LIMITS.expensive.windowMs).toBe(60000);
  });
});
