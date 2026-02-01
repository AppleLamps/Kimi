/**
 * Socket.IO event rate limiter
 * Provides per-connection rate limiting for WebSocket events
 */

export interface RateLimitConfig {
  /** Maximum number of events allowed in the window */
  maxEvents: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Events that bypass rate limiting (e.g., 'disconnect') */
  bypassEvents?: string[];
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export class SocketRateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig;
  private bypassEvents: Set<string>;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.bypassEvents = new Set(config.bypassEvents ?? []);
  }

  /**
   * Check if an event from a socket should be allowed
   * @param socketId The socket identifier
   * @param eventName The event name being emitted
   * @returns { allowed: true } or { allowed: false, retryAfter: number }
   */
  check(socketId: string, eventName: string): { allowed: true } | { allowed: false; retryAfter: number } {
    // Bypass rate limiting for certain events
    if (this.bypassEvents.has(eventName)) {
      return { allowed: true };
    }

    const now = Date.now();
    const key = socketId;
    let entry = this.limits.get(key);

    // Initialize or reset window if expired
    if (!entry || now - entry.windowStart >= this.config.windowMs) {
      entry = { count: 0, windowStart: now };
      this.limits.set(key, entry);
    }

    // Check if limit exceeded
    if (entry.count >= this.config.maxEvents) {
      const retryAfter = Math.ceil((entry.windowStart + this.config.windowMs - now) / 1000);
      return { allowed: false, retryAfter: Math.max(1, retryAfter) };
    }

    // Increment counter and allow
    entry.count++;
    return { allowed: true };
  }

  /**
   * Remove rate limit tracking for a socket (call on disconnect)
   */
  remove(socketId: string): void {
    this.limits.delete(socketId);
  }

  /**
   * Clean up expired entries (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now - entry.windowStart >= this.config.windowMs) {
        this.limits.delete(key);
      }
    }
  }

  /**
   * Get current stats for monitoring
   */
  getStats(): { activeConnections: number; totalTracked: number } {
    return {
      activeConnections: this.limits.size,
      totalTracked: this.limits.size,
    };
  }
}

/**
 * Create a rate-limited event handler wrapper for Socket.IO
 */
export function createRateLimitedHandler<T>(
  limiter: SocketRateLimiter,
  socketId: string,
  eventName: string,
  handler: (data: T) => void | Promise<void>,
  onLimited?: (retryAfter: number) => void
): (data: T) => void | Promise<void> {
  return (data: T) => {
    const result = limiter.check(socketId, eventName);

    if (!result.allowed) {
      onLimited?.(result.retryAfter);
      return;
    }

    return handler(data);
  };
}

/**
 * Default rate limit configurations for different event types
 */
export const DEFAULT_SOCKET_RATE_LIMITS = {
  // General events: 60 events per minute
  general: {
    maxEvents: 60,
    windowMs: 60 * 1000,
    bypassEvents: ['disconnect', 'error'],
  } as RateLimitConfig,

  // Strict limits for expensive operations: 10 per minute
  expensive: {
    maxEvents: 10,
    windowMs: 60 * 1000,
    bypassEvents: ['disconnect', 'error'],
  } as RateLimitConfig,
};
