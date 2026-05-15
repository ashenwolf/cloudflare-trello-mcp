import { describe, it, expect, vi } from 'vitest';
import { checkRateLimit, ipKey, bearerTokenKey } from '../src/rate-limit.js';

const makeRequest = (headers: Record<string, string> = {}) =>
  new Request('https://example.com', { headers });

const makeBinding = (success: boolean): RateLimit =>
  ({ limit: vi.fn().mockResolvedValue({ success }) }) as unknown as RateLimit;

describe('ipKey', () => {
  it('returns cf-connecting-ip when present', () => {
    expect(ipKey(makeRequest({ 'cf-connecting-ip': '1.2.3.4' }))).toBe('1.2.3.4');
  });

  it("returns 'unknown' when header is missing", () => {
    expect(ipKey(makeRequest())).toBe('unknown');
  });
});

describe('bearerTokenKey', () => {
  it('strips the Bearer prefix', () => {
    expect(bearerTokenKey(makeRequest({ Authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi');
  });

  it("returns 'anonymous' when Authorization is missing", () => {
    expect(bearerTokenKey(makeRequest())).toBe('anonymous');
  });

  it("returns 'anonymous' when Authorization is not a Bearer token", () => {
    expect(bearerTokenKey(makeRequest({ Authorization: 'Basic dXNlcjpwYXNz' }))).toBe('anonymous');
  });
});

describe('checkRateLimit', () => {
  it('returns null when the binding allows the request', async () => {
    const binding = makeBinding(true);
    const res = await checkRateLimit({ binding, key: 'k', limitName: 'mcp' });
    expect(res).toBeNull();
    expect(binding.limit).toHaveBeenCalledWith({ key: 'k' });
  });

  it('returns 429 with Retry-After when the binding rejects the request', async () => {
    const binding = makeBinding(false);
    const res = await checkRateLimit({ binding, key: 'k', limitName: 'mcp' });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get('Retry-After')).toBe('60');
    expect(await res!.text()).toMatch(/rate limit: mcp/);
  });

  it('fails open (returns null) when the binding throws', async () => {
    const binding = { limit: vi.fn().mockRejectedValue(new Error('binding misconfigured')) } as unknown as RateLimit;
    // Suppress the console.error that the implementation emits on failure.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await checkRateLimit({ binding, key: 'k', limitName: 'mcp' });
    expect(res).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
