import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../src/rate-limiter.js';

describe('createRateLimiter', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('allows immediate acquisition when tokens are available', async () => {
    const limiter = createRateLimiter();
    // Should resolve immediately — both buckets start full
    await limiter.acquire();
  });

  it('acquire resolves without throwing', async () => {
    const limiter = createRateLimiter();
    await expect(limiter.acquire()).resolves.toBeUndefined();
  });

  it('multiple rapid acquires succeed within token budget', async () => {
    const limiter = createRateLimiter();
    // Token limiter is 100/10s — 10 rapid calls should be fine
    for (let i = 0; i < 10; i++) {
      await limiter.acquire();
    }
  });
});
