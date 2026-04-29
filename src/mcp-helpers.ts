import type { McpResult } from './types.js';

export const mcpJson = (data: unknown): McpResult => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

export const mcpText = (message: string): McpResult => ({
  content: [{ type: 'text', text: message }],
});

export const mcpError = (e: unknown): McpResult => ({
  content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }],
  isError: true,
});
