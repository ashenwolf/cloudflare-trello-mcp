import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout } from '../src/fetch-utils.js';

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the response when fetch completes within the timeout', async () => {
    const expected = new Response('ok', { status: 200 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(expected));

    const res = await fetchWithTimeout('https://example.com', {}, 1000);
    expect(res).toBe(expected);
  });

  it('passes through init options to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await fetchWithTimeout('https://example.com', { method: 'POST', headers: { 'X-Test': 'yes' } }, 1000);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'X-Test': 'yes' });
    // The signal must be present so the request can actually be aborted.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws a descriptive timeout error when the signal aborts', async () => {
    // Simulate the real fetch behavior: it rejects with an AbortError when
    // the AbortController fires.
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_input, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        (init.signal as AbortSignal).addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }));

    await expect(fetchWithTimeout('https://example.com', {}, 5)).rejects.toThrow(/timed out after 5ms/);
  });

  it('rethrows non-abort errors unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(fetchWithTimeout('https://example.com', {}, 1000)).rejects.toThrow('network down');
  });
});
