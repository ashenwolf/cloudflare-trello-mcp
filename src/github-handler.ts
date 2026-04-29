import type { AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { Env } from './types.js';

interface GitHubUser {
  login: string;
  name: string | null;
  email: string | null;
}

export type AuthProps = {
  login: string;
  name: string;
  email: string;
};

// Minimal GitHub OAuth handler — no framework dependencies.
export function createGitHubHandler() {
  return {
    async fetch(request: Request, env: Env & { OAUTH_PROVIDER: OAuthHelpers }): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === '/authorize') {
        return handleAuthorize(request, env);
      }
      if (url.pathname === '/callback') {
        return handleCallback(request, env);
      }

      return new Response('Not found', { status: 404 });
    },
  };
}

async function handleAuthorize(request: Request, env: Env & { OAUTH_PROVIDER: OAuthHelpers }): Promise<Response> {
  const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  if (!oauthReqInfo.clientId) return new Response('Invalid request', { status: 400 });

  // Store OAuth request in KV so we can retrieve it in the callback
  const state = crypto.randomUUID();
  await env.OAUTH_KV.put(`oauth:state:${state}`, JSON.stringify(oauthReqInfo), { expirationTtl: 600 });

  // Redirect to GitHub
  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  githubUrl.searchParams.set('redirect_uri', new URL('/callback', request.url).href);
  githubUrl.searchParams.set('scope', 'read:user user:email');
  githubUrl.searchParams.set('state', state);

  return Response.redirect(githubUrl.href, 302);
}

async function handleCallback(request: Request, env: Env & { OAUTH_PROVIDER: OAuthHelpers }): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) return new Response('Missing code or state', { status: 400 });

  // Validate state
  const storedJson = await env.OAUTH_KV.get(`oauth:state:${state}`);
  if (!storedJson) return new Response('Invalid or expired state', { status: 400 });
  await env.OAUTH_KV.delete(`oauth:state:${state}`);

  const oauthReqInfo: AuthRequest = JSON.parse(storedJson);

  // Exchange code for GitHub access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL('/callback', request.url).href,
    }),
  });

  const tokenData = await tokenRes.json<{ access_token?: string; error?: string }>();
  if (!tokenData.access_token) {
    return new Response(`GitHub token exchange failed: ${tokenData.error ?? 'unknown'}`, { status: 400 });
  }

  // Fetch GitHub user info
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'trello-mcp-worker' },
  });
  const user = await userRes.json<GitHubUser>();

  // Check allowlist
  const allowedUsers = (env.ALLOWED_USERS ?? '').split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
  if (allowedUsers.length > 0 && !allowedUsers.includes(user.login.toLowerCase())) {
    return new Response(`Access denied: ${user.login} is not in the allowed users list`, { status: 403 });
  }

  // Complete the OAuth flow — issue our own token to the MCP client
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: user.login,
    metadata: { label: user.name ?? user.login },
    scope: oauthReqInfo.scope,
    props: {
      login: user.login,
      name: user.name ?? user.login,
      email: user.email ?? '',
    } satisfies AuthProps,
  });

  return Response.redirect(redirectTo, 302);
}
