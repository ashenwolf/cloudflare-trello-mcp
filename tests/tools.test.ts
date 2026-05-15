import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { allTools } from '../src/tools.js';

describe('allTools registry', () => {
  it('exports a non-empty array', () => {
    expect(allTools.length).toBeGreaterThan(0);
  });

  it('has no duplicate tool names', () => {
    const names = allTools.map(t => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('every tool has required fields', () => {
    for (const tool of allTools) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.schema).toBe('object');
      expect(typeof tool.handler).toBe('function');
    }
  });

  it('contains expected tool categories', () => {
    const names = new Set(allTools.map(t => t.name));
    // Spot-check one tool from each category
    expect(names.has('list_boards')).toBe(true);
    expect(names.has('list_workspaces')).toBe(true);
    expect(names.has('get_lists')).toBe(true);
    expect(names.has('get_card')).toBe(true);
    expect(names.has('attach_file_to_card')).toBe(true);
    expect(names.has('add_comment')).toBe(true);
    expect(names.has('create_checklist')).toBe(true);
    expect(names.has('get_board_members')).toBe(true);
    expect(names.has('get_board_labels')).toBe(true);
    expect(names.has('copy_card')).toBe(true);
    expect(names.has('add_cards_to_list')).toBe(true);
  });

  it('tool names use snake_case', () => {
    for (const tool of allTools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe('input validation', () => {
  const findTool = (name: string) => {
    const tool = allTools.find(t => t.name === name);
    if (!tool) throw new Error(`tool ${name} not found`);
    return tool;
  };

  // Build a Zod object from a tool's ZodRawShape so we can call .parse().
  const schemaOf = (toolName: string) => z.object(findTool(toolName).schema as z.ZodRawShape);

  it('rejects non-hex Trello IDs', () => {
    const schema = schemaOf('archive_card');
    expect(() => schema.parse({ cardId: 'not-a-trello-id' })).toThrow(/24-char hex/);
    expect(() => schema.parse({ cardId: 'A'.repeat(24) })).toThrow(/24-char hex/);  // uppercase
    expect(() => schema.parse({ cardId: 'a'.repeat(23) })).toThrow(/24-char hex/);  // too short
  });

  it('accepts valid 24-char hex Trello IDs', () => {
    const schema = schemaOf('archive_card');
    expect(() => schema.parse({ cardId: '0123456789abcdef01234567' })).not.toThrow();
  });

  it('rejects empty card name', () => {
    const schema = schemaOf('add_card_to_list');
    expect(() => schema.parse({ listId: '0'.repeat(24), name: '' })).toThrow();
  });

  it('rejects oversized free-text fields', () => {
    const schema = schemaOf('add_card_to_list');
    expect(() => schema.parse({
      listId: '0'.repeat(24),
      name: 'a',
      description: 'x'.repeat(16_385),
    })).toThrow();
  });

  it('rejects non-URL fileUrl on attach_file_to_card', () => {
    const schema = schemaOf('attach_file_to_card');
    expect(() => schema.parse({ cardId: '0'.repeat(24), fileUrl: 'not a url' })).toThrow();
    expect(() => schema.parse({ cardId: '0'.repeat(24), fileUrl: 'https://example.com/file.png' })).not.toThrow();
  });

  it('rejects oversized base64 image data', () => {
    const schema = schemaOf('attach_image_data_to_card');
    // 10 MB + 1 character — must reject
    expect(() => schema.parse({
      cardId: '0'.repeat(24),
      imageData: 'a'.repeat(10 * 1024 * 1024 + 1),
    })).toThrow();
  });

  it('caps batch card creation at 50', () => {
    const schema = schemaOf('add_cards_to_list');
    const cards = Array.from({ length: 51 }, () => ({ name: 'x' }));
    expect(() => schema.parse({ listId: '0'.repeat(24), cards })).toThrow();
  });

  it('accepts a batch of exactly 50 cards (boundary)', () => {
    const schema = schemaOf('add_cards_to_list');
    const cards = Array.from({ length: 50 }, () => ({ name: 'x' }));
    expect(() => schema.parse({ listId: '0'.repeat(24), cards })).not.toThrow();
  });

  it('accepts known label colors and rejects unknown', () => {
    const schema = schemaOf('create_label');
    expect(() => schema.parse({ name: 'x', color: 'green' })).not.toThrow();
    expect(() => schema.parse({ name: 'x', color: 'null' })).not.toThrow();  // clears color
    expect(() => schema.parse({ name: 'x', color: 'fuchsia' })).toThrow();
  });

  it('accepts ISO 8601 dates/datetimes and rejects garbage', () => {
    const schema = schemaOf('add_card_to_list');
    const valid = ['2024-01-15', '2024-01-15T10:00', '2024-01-15T10:00:00Z', '2024-01-15T10:00:00+02:00'];
    for (const dueDate of valid) {
      expect(() => schema.parse({ listId: '0'.repeat(24), name: 'x', dueDate })).not.toThrow();
    }
    expect(() => schema.parse({ listId: '0'.repeat(24), name: 'x', dueDate: 'tomorrow' })).toThrow();
    expect(() => schema.parse({ listId: '0'.repeat(24), name: 'x', dueDate: 'lastView' })).toThrow();
  });
});
