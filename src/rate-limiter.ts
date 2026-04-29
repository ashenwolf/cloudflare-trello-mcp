import { RateLimiter } from './types.js';

export class TokenBucketRateLimiter implements RateLimiter {
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

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + timePassed * this.refillRate);
    this.lastRefill = now;
  }

  canMakeRequest(): boolean {
    this.refillTokens();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  async waitForAvailableToken(): Promise<void> {
    this.refillTokens();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const tokensNeeded = 1 - this.tokens;
    const msToWait = tokensNeeded / this.refillRate;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.ceil(msToWait)));
    this.tokens = 0;
    this.lastRefill = Date.now();
  }
}

export function createTrelloRateLimiters() {
  const apiKeyLimiter = new TokenBucketRateLimiter(300, 10_000);
  const tokenLimiter = new TokenBucketRateLimiter(100, 10_000);

  return {
    async waitForAvailableToken(): Promise<void> {
      await apiKeyLimiter.waitForAvailableToken();
      await tokenLimiter.waitForAvailableToken();
    },
  };
}
