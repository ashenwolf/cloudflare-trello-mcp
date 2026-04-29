import { describe, it, expect } from 'vitest';
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
