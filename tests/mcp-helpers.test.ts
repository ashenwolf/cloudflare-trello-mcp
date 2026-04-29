import { describe, it, expect } from 'vitest';
import { mcpJson, mcpText, mcpError } from '../src/mcp-helpers.js';

describe('mcpText', () => {
  it('wraps a string in MCP text content', () => {
    const result = mcpText('hello');
    expect(result).toEqual({ content: [{ type: 'text', text: 'hello' }] });
  });
});

describe('mcpJson', () => {
  it('serializes data as pretty-printed JSON text content', () => {
    const result = mcpJson({ a: 1 });
    expect(result.content[0]).toEqual({ type: 'text', text: '{\n  "a": 1\n}' });
  });

  it('handles arrays', () => {
    const result = mcpJson([1, 2]);
    expect(JSON.parse(result.content[0].text)).toEqual([1, 2]);
  });

  it('handles null', () => {
    const result = mcpJson(null);
    expect(result.content[0].text).toBe('null');
  });
});

describe('mcpError', () => {
  it('formats Error instances', () => {
    const result = mcpError(new Error('boom'));
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Error: boom' }],
      isError: true,
    });
  });

  it('handles non-Error values', () => {
    const result = mcpError('string error');
    expect(result.content[0].text).toBe('Error: Unknown error');
    expect(result.isError).toBe(true);
  });

  it('handles undefined', () => {
    const result = mcpError(undefined);
    expect(result.isError).toBe(true);
  });
});
