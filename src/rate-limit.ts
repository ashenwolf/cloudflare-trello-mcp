/**
 * Worker-level rate limiting helpers built on Cloudflare's Rate Limiting API.
 *
 * The bindings are configured in `wrangler.toml` ([[ratelimits]] sections)
 * and exposed via the `Env` interface. This module wraps `binding.limit()`
 * with a consistent 429 response and fails *open* (allows the request) if
 * the binding throws — rate limiting is a safety net, not authentication,
 * so a misconfigured limiter must not lock everyone out.
 *
 * Key selection:
 *  - Authenticated MCP traffic: use the bearer token. Cloudflare's docs
 *    explicitly endorse Authorization headers as good keys, and the rate
 *    limit counter is internal — tokens don't leak. One token per OAuth
 *    grant means each client gets its own bucket.
 *  - Unauthenticated browser-flow traffic: use `cf-connecting-ip` as a
 *    fallback. Acceptable for low-frequency endpoints (login, callback).
 */

export interface RateLimitContext {
  binding: RateLimit;
  key: string;
  limitName: string;
}

export async function checkRateLimit(ctx: RateLimitContext): Promise<Response | null> {
  try {
    const { success } = await ctx.binding.limit({ key: ctx.key });
    if (success) return null;
  } catch (err) {
    // Fail open. Rate limiting is defence-in-depth, not authentication.
    console.error(`Rate limit binding error (${ctx.limitName}):`, err);
    return null;
  }
  return new Response(`Too Many Requests (rate limit: ${ctx.limitName})`, {
    status: 429,
    headers: { 'Retry-After': '60', 'Content-Type': 'text/plain' },
  });
}

/**
 * Extract the Cloudflare-supplied client IP. Used for unauthenticated
 * endpoints where the bearer token isn't yet present.
 *
 * Note: Cloudflare's docs warn that IP keys can over-throttle users behind
 * shared NATs / privacy proxies. For our auth flow that's acceptable —
 * legitimate users hit /authorize at most a few times an hour.
 */
export function ipKey(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

/**
 * Use the raw Authorization header value as the key. Each authenticated
 * client gets its own bucket. Unauthenticated requests fall through to
 * the literal string 'anonymous' which shares one bucket — fine because
 * the OAuth provider rejects them with 401 before any expensive work,
 * and the shared bucket actually helps: it caps the rate at which
 * unauthenticated probers can hammer /mcp regardless of their numbers.
 */
export function bearerTokenKey(request: Request): string {
  const auth = request.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : 'anonymous';
}
