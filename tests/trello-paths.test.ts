import { describe, it, expect } from 'vitest';
import { paths } from '../src/trello-paths.js';

describe('paths.me', () => {
  it('has correct static paths', () => {
    expect(paths.me.boards).toBe('/members/me/boards');
    expect(paths.me.cards).toBe('/members/me/cards');
    expect(paths.me.organizations).toBe('/members/me/organizations');
  });
});

describe('paths.boards', () => {
  it('builds board paths with id', () => {
    const b = paths.boards('abc123');
    expect(b.self).toBe('/boards/abc123');
    expect(b.lists).toBe('/boards/abc123/lists');
    expect(b.actions).toBe('/boards/abc123/actions');
    expect(b.checklists).toBe('/boards/abc123/checklists');
    expect(b.members).toBe('/boards/abc123/members');
    expect(b.labels).toBe('/boards/abc123/labels');
  });
});

describe('paths.cards', () => {
  it('builds card paths with id', () => {
    const c = paths.cards('card1');
    expect(c.self).toBe('/cards/card1');
    expect(c.attachments).toBe('/cards/card1/attachments');
    expect(c.comments).toBe('/cards/card1/actions/comments');
    expect(c.actions).toBe('/cards/card1/actions');
    expect(c.checklists).toBe('/cards/card1/checklists');
    expect(c.members).toBe('/cards/card1/idMembers');
  });

  it('builds nested attachment paths', () => {
    const c = paths.cards('card1');
    expect(c.attachment('att1')).toBe('/cards/card1/attachments/att1');
  });

  it('URL-encodes filenames in download path', () => {
    const c = paths.cards('card1');
    expect(c.attachmentDownload('att1', 'my file.pdf')).toBe(
      '/cards/card1/attachments/att1/download/my%20file.pdf'
    );
  });

  it('builds checkItem path', () => {
    expect(paths.cards('c1').checkItem('ci1')).toBe('/cards/c1/checkItem/ci1');
  });

  it('builds member path', () => {
    expect(paths.cards('c1').member('m1')).toBe('/cards/c1/idMembers/m1');
  });
});

describe('paths.lists', () => {
  it('builds list paths', () => {
    const l = paths.lists('list1');
    expect(l.self).toBe('/lists/list1');
    expect(l.cards).toBe('/lists/list1/cards');
    expect(l.closed).toBe('/lists/list1/closed');
    expect(l.pos).toBe('/lists/list1/pos');
  });
});

describe('paths.checklists', () => {
  it('builds checklist paths', () => {
    const cl = paths.checklists('cl1');
    expect(cl.self).toBe('/checklists/cl1');
    expect(cl.checkItems).toBe('/checklists/cl1/checkItems');
  });
});

describe('paths.organizations', () => {
  it('builds organization paths', () => {
    const o = paths.organizations('org1');
    expect(o.self).toBe('/organizations/org1');
    expect(o.boards).toBe('/organizations/org1/boards');
  });
});

describe('paths.actions', () => {
  it('builds action path', () => {
    expect(paths.actions('act1').self).toBe('/actions/act1');
  });
});

describe('paths.labels', () => {
  it('builds label path', () => {
    expect(paths.labels('lbl1').self).toBe('/labels/lbl1');
  });
});
