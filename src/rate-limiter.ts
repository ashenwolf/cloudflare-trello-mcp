class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxTokens = maxRequests;
    this.tokens = maxRequests;
    this.lastRefill = Date.now();
    this.refillRate = maxRequests / windowMs;
  }

  private refill(): void {
    const now = Date.now();
    this.tokens = Math.min(this.maxTokens, this.tokens + (now - this.lastRefill) * this.refillRate);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const msToWait = (1 - this.tokens) / this.refillRate;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.ceil(msToWait)));
    this.tokens = 0;
    this.lastRefill = Date.now();
  }
}

export interface RateLimiter {
  acquire(): Promise<void>;
}

// Trello enforces two concurrent limits: 300/10s per API key, 100/10s per token.
export function createRateLimiter(): RateLimiter {
  const apiKeyLimiter = new TokenBucketRateLimiter(300, 10_000);
  const tokenLimiter = new TokenBucketRateLimiter(100, 10_000);

  return {
    async acquire() {
      await apiKeyLimiter.acquire();
      await tokenLimiter.acquire();
    },
  };
}
