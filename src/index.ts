import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { createMcpHandler } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TrelloClient } from './trello-client.js';
import { allTools } from './tools.js';
import { mcpError } from './mcp-helpers.js';
import { createGitHubHandler } from './github-handler.js';
import { checkRateLimit, ipKey, bearerTokenKey } from './rate-limit.js';
import type { Env } from './types.js';

function createServer(env: Env) {
  const server = new McpServer({ name: 'trello-mcp', version: '1.0.0' });
  const client = new TrelloClient({
    apiKey: env.TRELLO_API_KEY,
    token: env.TRELLO_TOKEN,
    defaultBoardId: env.TRELLO_BOARD_ID,
  });

  for (const tool of allTools) {
    server.tool(tool.name, tool.description, tool.schema, async (args) => {
      try {
        return await tool.handler(client, args);
      } catch (e) {
        return mcpError(e);
      }
    });
  }

  return server;
}

// The OAuthProvider routes:
//   /mcp                        -> apiHandler (after token validation)
//   /authorize, /callback       -> defaultHandler (the GitHub OAuth flow)
//   /token, /register           -> handled internally by the library
//
// We must rate-limit BEFORE the library routes, otherwise /token and /register
// are unprotected. The pattern: build the OAuthProvider as usual, then wrap it
// at the top level. Every inbound request is gated:
//   - /mcp traffic: per bearer token, MCP_LIMIT (60/min)
//   - everything else: per cf-connecting-ip, AUTH_LIMIT (10/min)
//
// `createServer(env)` is intentionally NOT hoisted — it captures the per-request
// `env` and creates a fresh `TrelloClient` to preserve per-request isolation
// (see SECURITY.md). `githubHandler` IS hoisted because it's stateless and
// receives `env` as a parameter.
const githubHandler = createGitHubHandler();

const oauthProvider = new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      return createMcpHandler(createServer(env))(request, env, ctx);
    },
  },
  defaultHandler: githubHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/token',
  clientRegistrationEndpoint: '/register',

  // Token lifetimes — explicit so behavior is obvious and not subject to library defaults.
  // Library default for refreshTokenTTL is "never expires", which is unsafe for a public worker.
  accessTokenTTL: 60 * 60,            // 1 hour
  refreshTokenTTL: 30 * 24 * 60 * 60, // 30 days

  // OAuth 2.1 requires S256; plain PKCE has no cryptographic protection.
  allowPlainPKCE: false,

  // Block anonymous Dynamic Client Registration. Your already-registered MCP client in KV
  // keeps working. If you ever need to re-register (KV wipe, new machine), remove this line,
  // redeploy, register, then re-enable.
  disallowPublicClientRegistration: true,
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const isMcp = new URL(request.url).pathname === '/mcp';
    const limited = await checkRateLimit(
      isMcp
        ? { binding: env.MCP_LIMIT, key: bearerTokenKey(request), limitName: 'mcp' }
        : { binding: env.AUTH_LIMIT, key: ipKey(request), limitName: 'auth' },
    );
    if (limited) return limited;
    return oauthProvider.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
