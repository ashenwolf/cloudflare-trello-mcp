import type {
  TrelloConfig, HttpMethod, TrelloCard, TrelloList, TrelloAction,
  TrelloAttachment, TrelloBoard, TrelloWorkspace, EnhancedTrelloCard,
  TrelloChecklist, TrelloCheckItem, TrelloCheckItemUpdate,
  CheckList, CheckListItem, TrelloComment, TrelloMember, TrelloLabel,
} from './types.js';
import { createRateLimiter } from './rate-limiter.js';
import { paths } from './trello-paths.js';

const BASE_URL = 'https://api.trello.com/1';
const MAX_RETRIES = 3;
const BATCH_LIMIT = 50;

type QueryParams = Record<string, string | number | boolean | undefined>;

export class TrelloClient {
  private readonly rateLimiter = createRateLimiter();
  private readonly apiKey: string;
  private readonly token: string;
  private readonly defaultBoardId?: string;
  private activeBoardId_?: string;
  private activeWorkspaceId_?: string;

  constructor(config: TrelloConfig) {
    this.apiKey = config.apiKey;
    this.token = config.token;
    this.defaultBoardId = config.defaultBoardId;
    this.activeBoardId_ = config.defaultBoardId;
  }

  get activeBoardId() { return this.activeBoardId_; }
  get activeWorkspaceId() { return this.activeWorkspaceId_; }

  // --- HTTP layer ---

  private async request<T>(method: HttpMethod, path: string, opts?: { params?: QueryParams; body?: unknown }, retries = 0): Promise<T> {
    await this.rateLimiter.acquire();

    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('token', this.token);
    if (opts?.params) {
      for (const [k, v] of Object.entries(opts.params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const init: RequestInit = { method };
    if (opts?.body) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(opts.body);
    }

    const res = await fetch(url.toString(), init);

    if (res.status === 429) {
      if (retries >= MAX_RETRIES) throw new Error('Trello API rate limit exceeded after retries');
      const backoff = Math.min(1000 * 2 ** retries, 8000) + Math.random() * 500;
      await new Promise(r => setTimeout(r, backoff));
      return this.request(method, path, opts, retries + 1);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Trello API ${res.status}: ${text}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    return contentType.includes('application/json')
      ? res.json() as Promise<T>
      : res.text() as unknown as T;
  }

  private get<T>(path: string, params?: QueryParams) {
    return this.request<T>('GET', path, { params });
  }

  private post<T>(path: string, body?: unknown, params?: QueryParams) {
    return this.request<T>('POST', path, { params, body });
  }

  private put<T>(path: string, body?: unknown, params?: QueryParams) {
    return this.request<T>('PUT', path, { params, body });
  }

  private del<T>(path: string) {
    return this.request<T>('DELETE', path);
  }

  private resolveBoardId(boardId?: string): string {
    const id = boardId ?? this.activeBoardId_ ?? this.defaultBoardId;
    if (!id) throw new Error('boardId is required when no default board is configured');
    return id;
  }

  // --- Boards ---

  async listBoards(): Promise<TrelloBoard[]> {
    return this.get(paths.me.boards);
  }

  async getBoardById(boardId: string): Promise<TrelloBoard> {
    return this.get(paths.boards(boardId).self);
  }

  async setActiveBoard(boardId: string): Promise<TrelloBoard> {
    const board = await this.getBoardById(boardId);
    this.activeBoardId_ = boardId;
    return board;
  }

  async createBoard(opts: { name: string; desc?: string; idOrganization?: string; defaultLabels?: boolean; defaultLists?: boolean }): Promise<TrelloBoard> {
    return this.post(paths.me.boards.replace('/members/me/boards', '/boards'), {
      ...opts,
      idOrganization: opts.idOrganization ?? this.activeWorkspaceId_,
    });
  }

  // --- Workspaces ---

  async listWorkspaces(): Promise<TrelloWorkspace[]> {
    return this.get(paths.me.organizations);
  }

  async setActiveWorkspace(workspaceId: string): Promise<TrelloWorkspace> {
    const ws = await this.get<TrelloWorkspace>(paths.organizations(workspaceId).self);
    this.activeWorkspaceId_ = workspaceId;
    return ws;
  }

  async listBoardsInWorkspace(workspaceId: string): Promise<TrelloBoard[]> {
    return this.get(paths.organizations(workspaceId).boards);
  }

  // --- Lists ---

  async getLists(boardId?: string): Promise<TrelloList[]> {
    return this.get(paths.boards(this.resolveBoardId(boardId)).lists);
  }

  async addList(name: string, boardId?: string): Promise<TrelloList> {
    return this.post('/lists', { name, idBoard: this.resolveBoardId(boardId) });
  }

  async archiveList(listId: string): Promise<TrelloList> {
    return this.put(paths.lists(listId).closed, { value: true });
  }

  async updateListPosition(listId: string, position: string | number): Promise<TrelloList> {
    return this.put(paths.lists(listId).pos, { value: position });
  }

  // --- Cards ---

  async getCardsByList(listId: string, fields?: string): Promise<TrelloCard[]> {
    return this.get(paths.lists(listId).cards, fields ? { fields } : undefined);
  }

  async getMyCards(): Promise<TrelloCard[]> {
    return this.get(paths.me.cards);
  }

  async getCard(cardId: string, includeMarkdown = false): Promise<EnhancedTrelloCard | string> {
    const card = await this.get<EnhancedTrelloCard>(paths.cards(cardId).self, {
      attachments: true, checklists: 'all', checkItemStates: true,
      members: true, labels: true, actions: 'commentCard',
      actions_limit: 100, fields: 'all', list: true, board: true,
    });
    return includeMarkdown ? formatCardAsMarkdown(card) : card;
  }

  async addCard(opts: { listId: string; name: string; description?: string; dueDate?: string; start?: string; labels?: string[] }): Promise<TrelloCard> {
    return this.post('/cards', {
      idList: opts.listId, name: opts.name, desc: opts.description,
      due: opts.dueDate, start: opts.start, idLabels: opts.labels,
    });
  }

  async updateCard(opts: { cardId: string; name?: string; description?: string; dueDate?: string; start?: string; dueComplete?: boolean; labels?: string[] }): Promise<TrelloCard> {
    const { cardId, ...fields } = opts;
    return this.put(paths.cards(cardId).self, {
      name: fields.name, desc: fields.description, due: fields.dueDate,
      start: fields.start, dueComplete: fields.dueComplete, idLabels: fields.labels,
    });
  }

  async archiveCard(cardId: string): Promise<TrelloCard> {
    return this.put(paths.cards(cardId).self, { closed: true });
  }

  async moveCard(cardId: string, listId: string, boardId?: string): Promise<TrelloCard> {
    const effectiveId = boardId ?? this.defaultBoardId;
    return this.put(paths.cards(cardId).self, {
      idList: listId,
      ...(effectiveId && { idBoard: effectiveId }),
    });
  }

  async getRecentActivity(boardId?: string, limit = 10, since?: string, before?: string): Promise<TrelloAction[]> {
    return this.get(paths.boards(this.resolveBoardId(boardId)).actions, { limit, since, before });
  }

  async getCardHistory(cardId: string, filter?: string, limit?: number): Promise<TrelloAction[]> {
    return this.get(paths.cards(cardId).actions, { filter, limit });
  }

  // --- Attachments ---

  async attachFileToCard(cardId: string, fileUrl: string, name?: string): Promise<TrelloAttachment> {
    return this.post(paths.cards(cardId).attachments, { url: fileUrl, name: name ?? 'File Attachment' });
  }

  async attachImageDataToCard(cardId: string, imageData: string, name?: string, mimeType?: string): Promise<TrelloAttachment> {
    const { bytes, resolvedMimeType } = parseBase64Input(imageData, mimeType);
    const fileName = name ?? `screenshot-${Date.now()}.png`;

    const form = new FormData();
    form.append('file', new Blob([bytes], { type: resolvedMimeType }), fileName);
    form.append('name', fileName);

    await this.rateLimiter.acquire();
    const url = `${BASE_URL}${paths.cards(cardId).attachments}?key=${this.apiKey}&token=${this.token}`;
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Trello API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<TrelloAttachment>;
  }

  async downloadAttachment(cardId: string, attachmentId: string): Promise<{ data: string; mimeType: string; fileName: string }> {
    const meta = await this.get<TrelloAttachment>(paths.cards(cardId).attachment(attachmentId));
    const fileName = meta.fileName ?? 'attachment';
    const downloadUrl = `${BASE_URL}${paths.cards(cardId).attachmentDownload(attachmentId, fileName)}`;

    await this.rateLimiter.acquire();
    const res = await fetch(downloadUrl, {
      headers: { Authorization: `OAuth oauth_consumer_key="${this.apiKey}", oauth_token="${this.token}"` },
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const base64 = arrayBufferToBase64(await res.arrayBuffer());
    return { data: base64, mimeType: meta.mimeType || 'application/octet-stream', fileName };
  }

  // --- Comments ---

  async addComment(cardId: string, text: string): Promise<TrelloComment> {
    return this.post(paths.cards(cardId).comments, undefined, { text });
  }

  async updateComment(commentId: string, text: string): Promise<void> {
    await this.put(paths.actions(commentId).self, undefined, { text });
  }

  async deleteComment(commentId: string): Promise<void> {
    await this.del(paths.actions(commentId).self);
  }

  async getCardComments(cardId: string, limit = 100): Promise<TrelloComment[]> {
    return this.get(paths.cards(cardId).actions, { filter: 'commentCard', limit });
  }

  // --- Checklists ---

  async createChecklist(cardId: string, name: string): Promise<TrelloChecklist> {
    return this.post(paths.cards(cardId).checklists, { name });
  }

  private async resolveChecklists(cardId?: string, boardId?: string): Promise<TrelloChecklist[]> {
    if (cardId) {
      const card = await this.get<{ checklists?: TrelloChecklist[] }>(paths.cards(cardId).self, { checklists: 'all' });
      return card.checklists ?? [];
    }
    return this.get(paths.boards(this.resolveBoardId(boardId)).checklists);
  }

  async getChecklistItems(name: string, cardId?: string, boardId?: string): Promise<CheckListItem[]> {
    const checklists = await this.resolveChecklists(cardId, boardId);
    const lowerName = name.toLowerCase();
    return checklists
      .filter(cl => cl.name.toLowerCase() === lowerName)
      .flatMap(cl => cl.checkItems.map(i => toCheckListItem(i, cl.id)));
  }

  async addChecklistItem(text: string, checkListName: string, cardId?: string, boardId?: string): Promise<CheckListItem> {
    const target = await this.findChecklist(checkListName, cardId, boardId);
    const item = await this.post<TrelloCheckItem>(paths.checklists(target.id).checkItems, { name: text });
    return toCheckListItem(item, target.id);
  }

  async findChecklistItemsByDescription(description: string, cardId?: string, boardId?: string): Promise<CheckListItem[]> {
    const checklists = await this.resolveChecklists(cardId, boardId);
    const term = description.toLowerCase();
    return checklists.flatMap(cl =>
      cl.checkItems
        .filter(ci => ci.name.toLowerCase().includes(term))
        .map(ci => toCheckListItem(ci, cl.id))
    );
  }

  async getAcceptanceCriteria(cardId?: string, boardId?: string): Promise<CheckListItem[]> {
    return this.getChecklistItems('Acceptance Criteria', cardId, boardId);
  }

  async getChecklistByName(name: string, cardId?: string, boardId?: string): Promise<CheckList | null> {
    const checklists = await this.resolveChecklists(cardId, boardId);
    const target = checklists.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!target) return null;
    const completed = target.checkItems.filter(i => i.state === 'complete').length;
    const total = target.checkItems.length;
    return {
      id: target.id,
      name: target.name,
      items: target.checkItems.map(i => toCheckListItem(i, target.id)),
      percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  async updateChecklistItem(cardId: string, checkItemId: string, updates: TrelloCheckItemUpdate): Promise<TrelloCheckItem> {
    const payload = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    if (Object.keys(payload).length === 0) throw new Error('At least one field must be provided');
    return this.put(paths.cards(cardId).checkItem(checkItemId), payload);
  }

  async deleteChecklistItem(cardId: string, checkItemId: string): Promise<void> {
    await this.del(paths.cards(cardId).checkItem(checkItemId));
  }

  // --- Members ---

  async getBoardMembers(boardId?: string): Promise<TrelloMember[]> {
    return this.get(paths.boards(this.resolveBoardId(boardId)).members);
  }

  async assignMemberToCard(cardId: string, memberId: string): Promise<TrelloCard> {
    return this.post(paths.cards(cardId).members, { value: memberId });
  }

  async removeMemberFromCard(cardId: string, memberId: string): Promise<TrelloCard> {
    return this.del(paths.cards(cardId).member(memberId));
  }

  // --- Labels ---

  async getBoardLabels(boardId?: string): Promise<TrelloLabel[]> {
    return this.get(paths.boards(this.resolveBoardId(boardId)).labels);
  }

  async createLabel(name: string, color?: string, boardId?: string): Promise<TrelloLabel> {
    return this.post(paths.boards(this.resolveBoardId(boardId)).labels, { name, color });
  }

  async updateLabel(labelId: string, updates: { name?: string; color?: string }): Promise<TrelloLabel> {
    return this.put(paths.labels(labelId).self, updates);
  }

  async deleteLabel(labelId: string): Promise<void> {
    await this.del(paths.labels(labelId).self);
  }

  // --- Copy ---

  async copyCard(opts: { sourceCardId: string; listId: string; name?: string; description?: string; keepFromSource?: string; pos?: string }): Promise<TrelloCard> {
    return this.post('/cards', {
      idCardSource: opts.sourceCardId, idList: opts.listId,
      name: opts.name, desc: opts.description,
      keepFromSource: opts.keepFromSource ?? 'all', pos: opts.pos,
    });
  }

  async copyChecklist(opts: { sourceChecklistId: string; cardId: string; name?: string; pos?: string }): Promise<TrelloChecklist> {
    return this.post('/checklists', {
      idCard: opts.cardId, idChecklistSource: opts.sourceChecklistId,
      name: opts.name, pos: opts.pos,
    });
  }

  // --- Batch ---

  async batchAddCards(listId: string, cards: Array<{ name: string; description?: string; dueDate?: string; start?: string; labels?: string[] }>): Promise<{ created: TrelloCard[]; errors: Array<{ index: number; name: string; error: string }> }> {
    if (cards.length > BATCH_LIMIT) throw new Error(`Cannot create more than ${BATCH_LIMIT} cards at once`);
    const created: TrelloCard[] = [];
    const errors: Array<{ index: number; name: string; error: string }> = [];
    for (let i = 0; i < cards.length; i++) {
      try {
        created.push(await this.addCard({ listId, ...cards[i] }));
      } catch (e) {
        errors.push({ index: i, name: cards[i].name, error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }
    return { created, errors };
  }

  // --- Private helpers ---

  private async findChecklist(name: string, cardId?: string, boardId?: string): Promise<TrelloChecklist> {
    const checklists = await this.resolveChecklists(cardId, boardId);
    const target = checklists.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!target) throw new Error(`Checklist "${name}" not found`);
    return target;
  }
}

// --- Pure helpers (no `this`) ---

function toCheckListItem(item: TrelloCheckItem, parentId: string): CheckListItem {
  return { id: item.id, text: item.name, complete: item.state === 'complete', parentCheckListId: parentId };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  // Process in 8KB chunks to avoid call stack overflow
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)));
  }
  return btoa(chunks.join(''));
}

function parseBase64Input(imageData: string, mimeType?: string): { bytes: Uint8Array; resolvedMimeType: string } {
  let base64: string;
  let resolvedMimeType = mimeType ?? 'image/png';
  if (imageData.startsWith('data:')) {
    const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URL format');
    resolvedMimeType = match[1];
    base64 = match[2];
  } else {
    base64 = imageData;
  }
  return { bytes: Uint8Array.from(atob(base64), c => c.charCodeAt(0)), resolvedMimeType };
}

function formatCardAsMarkdown(card: EnhancedTrelloCard): string {
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(`# ${card.name}`, '');
  if (card.board && card.list) push(`**Board**: ${card.board.name} > **List**: ${card.list.name}`, '');

  if (card.labels?.length) {
    push('## Labels');
    card.labels.forEach(l => push(`- \`${l.color}\` ${l.name || '(no name)'}`));
    push('');
  }

  if (card.due) push('## Due Date', `${card.dueComplete ? '✅' : '⏰'}: ${card.due}`, '');

  if (card.members?.length) {
    push('## Members');
    card.members.forEach(m => push(`- @${m.username} (${m.fullName})`));
    push('');
  }

  if (card.desc) push('## Description', card.desc, '');

  if (card.checklists?.length) {
    push('## Checklists');
    card.checklists.forEach(cl => {
      const done = cl.checkItems.filter(i => i.state === 'complete').length;
      push(`### ${cl.name} (${done}/${cl.checkItems.length})`);
      [...cl.checkItems].sort((a, b) => a.pos - b.pos)
        .forEach(i => push(`- [${i.state === 'complete' ? 'x' : ' '}] ${i.name}`));
      push('');
    });
  }

  if (card.attachments?.length) {
    push('## Attachments');
    card.attachments.forEach(a => push(`- [${a.name}](${a.url})`));
    push('');
  }

  push('---', `*Card ID: ${card.id}* | [Open](${card.url})`);
  return lines.join('\n');
}
