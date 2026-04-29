import {
  TrelloConfig,
  TrelloCard,
  TrelloList,
  TrelloAction,
  TrelloAttachment,
  TrelloBoard,
  TrelloWorkspace,
  EnhancedTrelloCard,
  TrelloChecklist,
  TrelloCheckItem,
  TrelloCheckItemUpdate,
  CheckList,
  CheckListItem,
  TrelloComment,
  TrelloMember,
  TrelloLabelDetails,
} from './types.js';
import { createTrelloRateLimiters } from './rate-limiter.js';

const BASE_URL = 'https://api.trello.com/1';

export class TrelloClient {
  private rateLimiter = createTrelloRateLimiters();
  private defaultBoardId?: string;
  private _activeBoardId?: string;
  private _activeWorkspaceId?: string;
  private apiKey: string;
  private token: string;

  constructor(private config: TrelloConfig) {
    this.apiKey = config.apiKey;
    this.token = config.token;
    this.defaultBoardId = config.defaultBoardId;
    this._activeBoardId = config.boardId || config.defaultBoardId;
    this._activeWorkspaceId = config.workspaceId;
  }

  get activeBoardId() { return this._activeBoardId; }
  get activeWorkspaceId() { return this._activeWorkspaceId; }

  private authParams(): string {
    return `key=${this.apiKey}&token=${this.token}`;
  }

  private async request<T>(method: string, path: string, params?: Record<string, string>, body?: unknown): Promise<T> {
    await this.rateLimiter.waitForAvailableToken();

    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set('key', this.apiKey);
    url.searchParams.set('token', this.token);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const init: RequestInit = { method };
    if (body) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    const res = await fetch(url.toString(), init);

    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 1000));
      return this.request(method, path, params, body);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Trello API ${res.status}: ${text}`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json() as Promise<T>;
    }
    return res.text() as unknown as T;
  }

  private get<T>(path: string, params?: Record<string, string>) {
    return this.request<T>('GET', path, params);
  }
  private post<T>(path: string, body?: unknown, params?: Record<string, string>) {
    return this.request<T>('POST', path, params, body);
  }
  private put<T>(path: string, body?: unknown, params?: Record<string, string>) {
    return this.request<T>('PUT', path, params, body);
  }
  private del<T>(path: string) {
    return this.request<T>('DELETE', path);
  }

  private effectiveBoardId(boardId?: string): string {
    const id = boardId || this._activeBoardId || this.defaultBoardId;
    if (!id) throw new Error('boardId is required when no default board is configured');
    return id;
  }

  // Board operations
  async listBoards(): Promise<TrelloBoard[]> {
    return this.get('/members/me/boards');
  }

  async getBoardById(boardId: string): Promise<TrelloBoard> {
    return this.get(`/boards/${boardId}`);
  }

  async setActiveBoard(boardId: string): Promise<TrelloBoard> {
    const board = await this.getBoardById(boardId);
    this._activeBoardId = boardId;
    return board;
  }

  async createBoard(params: { name: string; desc?: string; idOrganization?: string; defaultLabels?: boolean; defaultLists?: boolean }): Promise<TrelloBoard> {
    return this.post('/boards', {
      name: params.name,
      desc: params.desc,
      idOrganization: params.idOrganization ?? this._activeWorkspaceId,
      defaultLabels: params.defaultLabels,
      defaultLists: params.defaultLists,
    });
  }

  // Workspace operations
  async listWorkspaces(): Promise<TrelloWorkspace[]> {
    return this.get('/members/me/organizations');
  }

  async getWorkspaceById(workspaceId: string): Promise<TrelloWorkspace> {
    return this.get(`/organizations/${workspaceId}`);
  }

  async setActiveWorkspace(workspaceId: string): Promise<TrelloWorkspace> {
    const ws = await this.getWorkspaceById(workspaceId);
    this._activeWorkspaceId = workspaceId;
    return ws;
  }

  async listBoardsInWorkspace(workspaceId: string): Promise<TrelloBoard[]> {
    return this.get(`/organizations/${workspaceId}/boards`);
  }

  // List operations
  async getLists(boardId?: string): Promise<TrelloList[]> {
    return this.get(`/boards/${this.effectiveBoardId(boardId)}/lists`);
  }

  async addList(boardId: string | undefined, name: string): Promise<TrelloList> {
    return this.post('/lists', { name, idBoard: this.effectiveBoardId(boardId) });
  }

  async archiveList(_boardId: string | undefined, listId: string): Promise<TrelloList> {
    return this.put(`/lists/${listId}/closed`, { value: true });
  }

  async updateListPosition(listId: string, position: string | number): Promise<TrelloList> {
    return this.put(`/lists/${listId}/pos`, { value: position });
  }

  // Card operations
  async getCardsByList(listId: string, fields?: string): Promise<TrelloCard[]> {
    const params = fields ? { fields } : undefined;
    return this.get(`/lists/${listId}/cards`, params);
  }

  async getMyCards(): Promise<TrelloCard[]> {
    return this.get('/members/me/cards');
  }

  async getCard(cardId: string, _includeMarkdown = false): Promise<EnhancedTrelloCard | string> {
    const card = await this.get<EnhancedTrelloCard>(`/cards/${cardId}`, {
      attachments: 'true',
      checklists: 'all',
      checkItemStates: 'true',
      members: 'true',
      labels: 'true',
      actions: 'commentCard',
      actions_limit: '100',
      fields: 'all',
      list: 'true',
      board: 'true',
    });
    return _includeMarkdown ? this.formatCardAsMarkdown(card) : card;
  }

  async addCard(boardId: string | undefined, params: { listId: string; name: string; description?: string; dueDate?: string; start?: string; labels?: string[] }): Promise<TrelloCard> {
    return this.post('/cards', {
      idList: params.listId,
      name: params.name,
      desc: params.description,
      due: params.dueDate,
      start: params.start,
      idLabels: params.labels,
    });
  }

  async updateCard(_boardId: string | undefined, params: { cardId: string; name?: string; description?: string; dueDate?: string; start?: string; dueComplete?: boolean; labels?: string[] }): Promise<TrelloCard> {
    return this.put(`/cards/${params.cardId}`, {
      name: params.name,
      desc: params.description,
      due: params.dueDate,
      start: params.start,
      dueComplete: params.dueComplete,
      idLabels: params.labels,
    });
  }

  async archiveCard(_boardId: string | undefined, cardId: string): Promise<TrelloCard> {
    return this.put(`/cards/${cardId}`, { closed: true });
  }

  async moveCard(boardId: string | undefined, cardId: string, listId: string): Promise<TrelloCard> {
    const effectiveId = boardId || this.defaultBoardId;
    return this.put(`/cards/${cardId}`, {
      idList: listId,
      ...(effectiveId && { idBoard: effectiveId }),
    });
  }

  async getRecentActivity(boardId?: string, limit = 10, since?: string, before?: string): Promise<TrelloAction[]> {
    const params: Record<string, string> = { limit: String(limit) };
    if (since) params.since = since;
    if (before) params.before = before;
    return this.get(`/boards/${this.effectiveBoardId(boardId)}/actions`, params);
  }

  // Attachment operations
  async attachImageToCard(_boardId: string | undefined, cardId: string, imageUrl: string, name?: string): Promise<TrelloAttachment> {
    return this.attachFileToCard(_boardId, cardId, imageUrl, name);
  }

  async attachFileToCard(_boardId: string | undefined, cardId: string, fileUrl: string, name?: string, _mimeType?: string): Promise<TrelloAttachment> {
    return this.post(`/cards/${cardId}/attachments`, {
      url: fileUrl,
      name: name || 'File Attachment',
    });
  }

  async attachImageDataToCard(_boardId: string | undefined, cardId: string, imageData: string, name?: string, mimeType?: string): Promise<TrelloAttachment> {
    // Extract base64 data
    let base64: string;
    let effectiveMimeType = mimeType || 'image/png';
    if (imageData.startsWith('data:')) {
      const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        effectiveMimeType = matches[1];
        base64 = matches[2];
      } else {
        throw new Error('Invalid data URL format');
      }
    } else {
      base64 = imageData;
    }

    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const fileName = name || `screenshot-${Date.now()}.png`;

    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${effectiveMimeType}\r\n\r\n`,
      bytes,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${fileName}`,
      `\r\n--${boundary}--\r\n`,
    ];

    const encoder = new TextEncoder();
    const textParts = [encoder.encode(parts[0] as string), parts[1] as Uint8Array, encoder.encode(parts[2] as string), encoder.encode(parts[3] as string)];
    const totalLength = textParts.reduce((sum, p) => sum + p.byteLength, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of textParts) {
      body.set(part, offset);
      offset += part.byteLength;
    }

    await this.rateLimiter.waitForAvailableToken();
    const url = `${BASE_URL}/cards/${cardId}/attachments?${this.authParams()}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: body,
    });
    if (!res.ok) throw new Error(`Trello API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<TrelloAttachment>;
  }

  async downloadAttachment(cardId: string, attachmentId: string): Promise<{ data: string; mimeType: string; fileName: string }> {
    const meta = await this.get<TrelloAttachment>(`/cards/${cardId}/attachments/${attachmentId}`);
    const downloadUrl = `${BASE_URL}/cards/${cardId}/attachments/${attachmentId}/download/${encodeURIComponent(meta.fileName || 'attachment')}`;

    await this.rateLimiter.waitForAvailableToken();
    const res = await fetch(downloadUrl, {
      headers: {
        Authorization: `OAuth oauth_consumer_key="${this.apiKey}", oauth_token="${this.token}"`,
      },
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const buf = await res.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return { data: base64, mimeType: meta.mimeType || 'application/octet-stream', fileName: meta.fileName || 'attachment' };
  }

  // Comment operations
  async addCommentToCard(cardId: string, text: string): Promise<TrelloComment> {
    return this.post(`/cards/${cardId}/actions/comments`, undefined, { text });
  }

  async updateCommentOnCard(commentId: string, text: string): Promise<boolean> {
    await this.put(`/actions/${commentId}`, undefined, { text });
    return true;
  }

  async deleteCommentFromCard(commentId: string): Promise<boolean> {
    await this.del(`/actions/${commentId}`);
    return true;
  }

  async getCardComments(cardId: string, limit = 100): Promise<TrelloComment[]> {
    return this.get(`/cards/${cardId}/actions`, { filter: 'commentCard', limit: String(limit) });
  }

  // Checklist operations
  async createChecklist(name: string, cardId: string): Promise<TrelloChecklist> {
    return this.post(`/cards/${cardId}/checklists`, { name });
  }

  private async getChecklists(cardId?: string, boardId?: string): Promise<TrelloChecklist[]> {
    if (cardId) {
      const card = await this.get<{ checklists?: TrelloChecklist[] }>(`/cards/${cardId}`, { checklists: 'all' });
      return card.checklists || [];
    }
    return this.get(`/boards/${this.effectiveBoardId(boardId)}/checklists`);
  }

  async getChecklistItems(name: string, cardId?: string, boardId?: string): Promise<CheckListItem[]> {
    const checklists = await this.getChecklists(cardId, boardId);
    const items: CheckListItem[] = [];
    for (const cl of checklists) {
      if (cl.name.toLowerCase() === name.toLowerCase()) {
        items.push(...cl.checkItems.map(i => this.toCheckListItem(i, cl.id)));
      }
    }
    return items;
  }

  async addChecklistItem(text: string, checkListName: string, cardId?: string, boardId?: string): Promise<CheckListItem> {
    const checklists = await this.getChecklists(cardId, boardId);
    const target = checklists.find(c => c.name.toLowerCase() === checkListName.toLowerCase());
    if (!target) throw new Error(`Checklist "${checkListName}" not found`);
    const item = await this.post<TrelloCheckItem>(`/checklists/${target.id}/checkItems`, { name: text });
    return this.toCheckListItem(item, target.id);
  }

  async findChecklistItemsByDescription(description: string, cardId?: string, boardId?: string): Promise<CheckListItem[]> {
    const checklists = await this.getChecklists(cardId, boardId);
    const term = description.toLowerCase();
    const items: CheckListItem[] = [];
    for (const cl of checklists) {
      for (const ci of cl.checkItems) {
        if (ci.name.toLowerCase().includes(term)) {
          items.push(this.toCheckListItem(ci, cl.id));
        }
      }
    }
    return items;
  }

  async getAcceptanceCriteria(cardId?: string, boardId?: string): Promise<CheckListItem[]> {
    return this.getChecklistItems('Acceptance Criteria', cardId, boardId);
  }

  async getChecklistByName(name: string, cardId?: string, boardId?: string): Promise<CheckList | null> {
    const checklists = await this.getChecklists(cardId, boardId);
    const target = checklists.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!target) return null;
    const completed = target.checkItems.filter(i => i.state === 'complete').length;
    const total = target.checkItems.length;
    return {
      id: target.id,
      name: target.name,
      items: target.checkItems.map(i => this.toCheckListItem(i, target.id)),
      percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  async updateChecklistItem(cardId: string, checkItemId: string, updates: TrelloCheckItemUpdate): Promise<TrelloCheckItem> {
    const payload = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    if (Object.keys(payload).length === 0) throw new Error('At least one field must be provided');
    return this.put(`/cards/${cardId}/checkItem/${checkItemId}`, payload);
  }

  async deleteChecklistItem(cardId: string, checkItemId: string): Promise<boolean> {
    await this.del(`/cards/${cardId}/checkItem/${checkItemId}`);
    return true;
  }

  // Member operations
  async getBoardMembers(boardId?: string): Promise<TrelloMember[]> {
    return this.get(`/boards/${this.effectiveBoardId(boardId)}/members`);
  }

  async assignMemberToCard(cardId: string, memberId: string): Promise<TrelloCard> {
    return this.post(`/cards/${cardId}/idMembers`, { value: memberId });
  }

  async removeMemberFromCard(cardId: string, memberId: string): Promise<TrelloCard> {
    return this.del(`/cards/${cardId}/idMembers/${memberId}`);
  }

  // Label operations
  async getBoardLabels(boardId?: string): Promise<TrelloLabelDetails[]> {
    return this.get(`/boards/${this.effectiveBoardId(boardId)}/labels`);
  }

  async createLabel(boardId: string | undefined, name: string, color?: string): Promise<TrelloLabelDetails> {
    return this.post(`/boards/${this.effectiveBoardId(boardId)}/labels`, { name, color });
  }

  async updateLabel(labelId: string, name?: string, color?: string): Promise<TrelloLabelDetails> {
    const data: Record<string, string> = {};
    if (name !== undefined) data.name = name;
    if (color !== undefined) data.color = color;
    return this.put(`/labels/${labelId}`, data);
  }

  async deleteLabel(labelId: string): Promise<boolean> {
    await this.del(`/labels/${labelId}`);
    return true;
  }

  // Copy operations
  async copyCard(params: { sourceCardId: string; listId: string; name?: string; description?: string; keepFromSource?: string; pos?: string }): Promise<TrelloCard> {
    return this.post('/cards', {
      idCardSource: params.sourceCardId,
      idList: params.listId,
      name: params.name,
      desc: params.description,
      keepFromSource: params.keepFromSource || 'all',
      pos: params.pos,
    });
  }

  async copyChecklist(params: { sourceChecklistId: string; cardId: string; name?: string; pos?: string }): Promise<TrelloChecklist> {
    return this.post('/checklists', {
      idCard: params.cardId,
      idChecklistSource: params.sourceChecklistId,
      name: params.name,
      pos: params.pos,
    });
  }

  // Batch operations
  async batchAddCards(listId: string, cards: Array<{ name: string; description?: string; dueDate?: string; start?: string; labels?: string[] }>): Promise<{ created: TrelloCard[]; errors: Array<{ index: number; name: string; error: string }> }> {
    if (cards.length > 50) throw new Error('Cannot create more than 50 cards at once');
    const created: TrelloCard[] = [];
    const errors: Array<{ index: number; name: string; error: string }> = [];
    for (let i = 0; i < cards.length; i++) {
      try {
        created.push(await this.addCard(undefined, { listId, ...cards[i] }));
      } catch (e) {
        errors.push({ index: i, name: cards[i].name, error: e instanceof Error ? e.message : 'Unknown error' });
      }
    }
    return { created, errors };
  }

  // Card history
  async getCardHistory(cardId: string, filter?: string, limit?: number): Promise<TrelloAction[]> {
    const params: Record<string, string> = {};
    if (filter) params.filter = filter;
    if (limit) params.limit = String(limit);
    return this.get(`/cards/${cardId}/actions`, params);
  }

  // Helpers
  private toCheckListItem(item: TrelloCheckItem, parentId: string): CheckListItem {
    return { id: item.id, text: item.name, complete: item.state === 'complete', parentCheckListId: parentId };
  }

  private formatCardAsMarkdown(card: EnhancedTrelloCard): string {
    let md = `# ${card.name}\n\n`;
    if (card.board && card.list) md += `**Board**: ${card.board.name} > **List**: ${card.list.name}\n\n`;
    if (card.labels?.length) {
      md += `## Labels\n`;
      card.labels.forEach(l => { md += `- \`${l.color}\` ${l.name || '(no name)'}\n`; });
      md += '\n';
    }
    if (card.due) md += `## Due Date\n${card.dueComplete ? '✅' : '⏰'}: ${card.due}\n\n`;
    if (card.members?.length) {
      md += `## Members\n`;
      card.members.forEach(m => { md += `- @${m.username} (${m.fullName})\n`; });
      md += '\n';
    }
    if (card.desc) md += `## Description\n${card.desc}\n\n`;
    if (card.checklists?.length) {
      md += `## Checklists\n`;
      card.checklists.forEach(cl => {
        const done = cl.checkItems.filter(i => i.state === 'complete').length;
        md += `### ${cl.name} (${done}/${cl.checkItems.length})\n`;
        [...cl.checkItems].sort((a, b) => a.pos - b.pos).forEach(i => {
          md += `- [${i.state === 'complete' ? 'x' : ' '}] ${i.name}\n`;
        });
        md += '\n';
      });
    }
    if (card.attachments?.length) {
      md += `## Attachments\n`;
      card.attachments.forEach(a => { md += `- [${a.name}](${a.url})\n`; });
      md += '\n';
    }
    md += `---\n*Card ID: ${card.id}* | [Open](${card.url})\n`;
    return md;
  }
}
