import { createMcpHandler } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TrelloClient } from './trello-client.js';
import { allTools } from './tools.js';
import { mcpError } from './mcp-helpers.js';
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return createMcpHandler(createServer(env))(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
