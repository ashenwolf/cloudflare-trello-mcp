/**
 * Wraps `fetch()` with an `AbortController`-based timeout.
 *
 * Cloudflare Workers' built-in `fetch` does not enforce a request timeout,
 * which means a hung upstream burns through this Worker's CPU/wall-clock
 * budget for the full request lifetime. This helper aborts the request
 * after `timeoutMs` milliseconds and surfaces a descriptive error.
 *
 * Note: this aborts the request itself (initiation + response headers).
 * If callers stream a large response body, they may want a separate
 * timeout around `.json()` / `.arrayBuffer()` consumption.
 *
 * If the caller passes their own `AbortSignal` in `init.signal`, this
 * helper does NOT chain them — the timeout signal takes precedence. No
 * caller in this codebase passes a signal today; if that changes, switch
 * to `AbortSignal.any([init.signal, controller.signal])`.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && (e.name === 'AbortError' || e.message.includes('aborted'))) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
