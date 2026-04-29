import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrelloClient, toCheckListItem, arrayBufferToBase64, parseBase64Input, formatCardAsMarkdown } from '../src/trello-client.js';
import type { TrelloCheckItem, EnhancedTrelloCard } from '../src/types.js';

// --- Pure helper tests ---

describe('toCheckListItem', () => {
  it('converts a complete TrelloCheckItem', () => {
    const item: TrelloCheckItem = { id: 'i1', name: 'Do thing', state: 'complete', pos: 1 };
    expect(toCheckListItem(item, 'cl1')).toEqual({
      id: 'i1', text: 'Do thing', complete: true, parentCheckListId: 'cl1',
    });
  });

  it('converts an incomplete TrelloCheckItem', () => {
    const item: TrelloCheckItem = { id: 'i2', name: 'Pending', state: 'incomplete', pos: 2 };
    expect(toCheckListItem(item, 'cl2')).toEqual({
      id: 'i2', text: 'Pending', complete: false, parentCheckListId: 'cl2',
    });
  });
});

describe('arrayBufferToBase64', () => {
  it('encodes small buffers', () => {
    const buf = new TextEncoder().encode('hello').buffer;
    expect(arrayBufferToBase64(buf)).toBe(btoa('hello'));
  });

  it('encodes empty buffer', () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe('');
  });

  it('handles buffers larger than 8KB chunk size without stack overflow', () => {
    // 20KB of data — must not throw RangeError
    const buf = new Uint8Array(20_000).fill(65).buffer; // 'A' repeated
    const result = arrayBufferToBase64(buf);
    expect(result.length).toBeGreaterThan(0);
    // Verify round-trip
    const decoded = atob(result);
    expect(decoded.length).toBe(20_000);
  });
});

describe('parseBase64Input', () => {
  it('parses raw base64 with default mime type', () => {
    const { bytes, resolvedMimeType } = parseBase64Input(btoa('test'));
    expect(resolvedMimeType).toBe('image/png');
    expect(new TextDecoder().decode(bytes)).toBe('test');
  });

  it('parses raw base64 with explicit mime type', () => {
    const { resolvedMimeType } = parseBase64Input(btoa('test'), 'image/jpeg');
    expect(resolvedMimeType).toBe('image/jpeg');
  });

  it('parses data URL and extracts mime type', () => {
    const dataUrl = `data:image/gif;base64,${btoa('GIF89a')}`;
    const { bytes, resolvedMimeType } = parseBase64Input(dataUrl);
    expect(resolvedMimeType).toBe('image/gif');
    expect(new TextDecoder().decode(bytes)).toBe('GIF89a');
  });

  it('throws on invalid data URL', () => {
    expect(() => parseBase64Input('data:invalid')).toThrow('Invalid data URL format');
  });
});

describe('formatCardAsMarkdown', () => {
  const minimalCard: EnhancedTrelloCard = {
    id: 'c1', name: 'Test Card', desc: '', due: null, idList: 'l1',
    idLabels: [], closed: false, url: 'https://trello.com/c/c1',
    shortUrl: 'https://trello.com/c/c1', dateLastActivity: '2024-01-01',
    dueComplete: false, start: null, idBoard: 'b1', pos: 1,
    labels: [], attachments: [], checklists: [], members: [],
    idMembers: [], comments: [],
    badges: { checkItems: 0, checkItemsChecked: 0, comments: 0, attachments: 0, votes: 0, description: false, dueComplete: false },
  };

  it('renders card title', () => {
    const md = formatCardAsMarkdown(minimalCard);
    expect(md).toContain('# Test Card');
  });

  it('renders board and list when present', () => {
    const card = { ...minimalCard, board: { id: 'b1', name: 'My Board', url: '' }, list: { id: 'l1', name: 'To Do' } };
    const md = formatCardAsMarkdown(card);
    expect(md).toContain('**Board**: My Board > **List**: To Do');
  });

  it('renders labels', () => {
    const card = { ...minimalCard, labels: [{ id: 'lb1', name: 'Bug', color: 'red' }] };
    const md = formatCardAsMarkdown(card);
    expect(md).toContain('## Labels');
    expect(md).toContain('`red` Bug');
  });

  it('renders due date with completion status', () => {
    const card = { ...minimalCard, due: '2024-12-31', dueComplete: true };
    expect(formatCardAsMarkdown(card)).toContain('✅: 2024-12-31');

    const card2 = { ...minimalCard, due: '2024-12-31', dueComplete: false };
    expect(formatCardAsMarkdown(card2)).toContain('⏰: 2024-12-31');
  });

  it('renders description', () => {
    const card = { ...minimalCard, desc: 'Some description' };
    const md = formatCardAsMarkdown(card);
    expect(md).toContain('## Description');
    expect(md).toContain('Some description');
  });

  it('renders checklists with completion counts', () => {
    const card = {
      ...minimalCard,
      checklists: [{
        id: 'cl1', name: 'Tasks', idCard: 'c1', pos: 1,
        checkItems: [
          { id: 'ci1', name: 'Done', state: 'complete' as const, pos: 1 },
          { id: 'ci2', name: 'Pending', state: 'incomplete' as const, pos: 2 },
        ],
      }],
    };
    const md = formatCardAsMarkdown(card);
    expect(md).toContain('### Tasks (1/2)');
    expect(md).toContain('- [x] Done');
    expect(md).toContain('- [ ] Pending');
  });

  it('renders attachments as links', () => {
    const card = {
      ...minimalCard,
      attachments: [{
        id: 'a1', name: 'file.pdf', url: 'https://example.com/file.pdf',
        fileName: 'file.pdf', bytes: 100, date: '', mimeType: 'application/pdf',
        previews: [], isUpload: false,
      }],
    };
    const md = formatCardAsMarkdown(card);
    expect(md).toContain('[file.pdf](https://example.com/file.pdf)');
  });

  it('renders card ID and link in footer', () => {
    const md = formatCardAsMarkdown(minimalCard);
    expect(md).toContain('*Card ID: c1*');
    expect(md).toContain('[Open](https://trello.com/c/c1)');
  });
});

// --- TrelloClient tests with fetch mocking ---

function mockFetch(response: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
    headers: new Headers({ 'content-type': 'application/json' }),
  });
}

function createTestClient(defaultBoardId?: string) {
  return new TrelloClient({ apiKey: 'test-key', token: 'test-token', defaultBoardId });
}

describe('TrelloClient', () => {
  beforeEach(() => { vi.stubGlobal('fetch', mockFetch([])); });

  describe('constructor', () => {
    it('sets activeBoardId from defaultBoardId', () => {
      const client = createTestClient('board1');
      expect(client.activeBoardId).toBe('board1');
    });

    it('activeBoardId is undefined when no default', () => {
      const client = createTestClient();
      expect(client.activeBoardId).toBeUndefined();
    });

    it('activeWorkspaceId starts undefined', () => {
      const client = createTestClient();
      expect(client.activeWorkspaceId).toBeUndefined();
    });
  });

  describe('HTTP layer', () => {
    it('includes auth params in requests', async () => {
      const fetchMock = mockFetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const client = createTestClient();

      await client.listBoards();

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.searchParams.get('key')).toBe('test-key');
      expect(calledUrl.searchParams.get('token')).toBe('test-token');
    });

    it('uses correct HTTP method for GET', async () => {
      const fetchMock = mockFetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const client = createTestClient();

      await client.listBoards();

      expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    });

    it('throws on non-OK non-429 responses', async () => {
      vi.stubGlobal('fetch', mockFetch({ error: 'not found' }, 404));
      const client = createTestClient();

      await expect(client.listBoards()).rejects.toThrow('Trello API 404');
    });

    it('retries on 429 with backoff', async () => {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 1) {
          return Promise.resolve({
            ok: false, status: 429,
            text: () => Promise.resolve('rate limited'),
            headers: new Headers(),
          });
        }
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([{ id: 'b1' }]),
          text: () => Promise.resolve('[]'),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      }));

      const client = createTestClient();
      const result = await client.listBoards();
      expect(result).toEqual([{ id: 'b1' }]);
      expect(callCount).toBe(2);
    });
  });

  describe('resolveBoardId', () => {
    it('throws when no board ID is available', async () => {
      vi.stubGlobal('fetch', mockFetch([]));
      const client = createTestClient(); // no default
      await expect(client.getLists()).rejects.toThrow('boardId is required');
    });

    it('uses default board ID', async () => {
      const fetchMock = mockFetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const client = createTestClient('default-board');

      await client.getLists();

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('/boards/default-board/lists');
    });

    it('uses explicit board ID over default', async () => {
      const fetchMock = mockFetch([]);
      vi.stubGlobal('fetch', fetchMock);
      const client = createTestClient('default-board');

      await client.getLists('explicit-board');

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('/boards/explicit-board/lists');
    });
  });

  describe('setActiveBoard', () => {
    it('updates activeBoardId after successful fetch', async () => {
      vi.stubGlobal('fetch', mockFetch({ id: 'new-board', name: 'New Board' }));
      const client = createTestClient();

      const board = await client.setActiveBoard('new-board');
      expect(board.name).toBe('New Board');
      expect(client.activeBoardId).toBe('new-board');
    });
  });

  describe('setActiveWorkspace', () => {
    it('updates activeWorkspaceId after successful fetch', async () => {
      vi.stubGlobal('fetch', mockFetch({ id: 'ws1', displayName: 'My Workspace' }));
      const client = createTestClient();

      const ws = await client.setActiveWorkspace('ws1');
      expect(ws.displayName).toBe('My Workspace');
      expect(client.activeWorkspaceId).toBe('ws1');
    });
  });

  describe('addCard', () => {
    it('sends correct body to POST /cards', async () => {
      const fetchMock = mockFetch({ id: 'new-card' });
      vi.stubGlobal('fetch', fetchMock);
      const client = createTestClient();

      await client.addCard({ listId: 'list1', name: 'My Card', description: 'desc' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/cards');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.idList).toBe('list1');
      expect(body.name).toBe('My Card');
      expect(body.desc).toBe('desc');
    });
  });

  describe('archiveCard', () => {
    it('sends closed: true via PUT', async () => {
      const fetchMock = mockFetch({ id: 'c1', closed: true });
      vi.stubGlobal('fetch', fetchMock);
      const client = createTestClient();

      await client.archiveCard('c1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/cards/c1');
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body).closed).toBe(true);
    });
  });

  describe('batchAddCards', () => {
    it('rejects more than 50 cards', async () => {
      const client = createTestClient();
      const cards = Array.from({ length: 51 }, (_, i) => ({ name: `Card ${i}` }));
      await expect(client.batchAddCards('list1', cards)).rejects.toThrow('Cannot create more than 50');
    });

    it('collects errors for individual failures', async () => {
      let callCount = 0;
      vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve({
            ok: false, status: 500,
            text: () => Promise.resolve('server error'),
            headers: new Headers({ 'content-type': 'application/json' }),
          });
        }
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve({ id: `card-${callCount}`, name: `Card ${callCount}` }),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
      }));

      const client = createTestClient();
      const result = await client.batchAddCards('list1', [
        { name: 'Card A' }, { name: 'Card B' }, { name: 'Card C' },
      ]);

      expect(result.created).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].index).toBe(1);
      expect(result.errors[0].name).toBe('Card B');
    });
  });

  describe('updateChecklistItem', () => {
    it('throws when no updates provided', async () => {
      const client = createTestClient();
      await expect(client.updateChecklistItem('c1', 'ci1', {})).rejects.toThrow('At least one field');
    });
  });

  describe('comments', () => {
    it('addComment sends text as query param', async () => {
      const fetchMock = mockFetch({ id: 'comment1' });
      vi.stubGlobal('fetch', fetchMock);
      const client = createTestClient();

      await client.addComment('card1', 'Hello');

      const calledUrl = new URL(fetchMock.mock.calls[0][0]);
      expect(calledUrl.pathname).toContain('/cards/card1/actions/comments');
      expect(calledUrl.searchParams.get('text')).toBe('Hello');
    });
  });
});
