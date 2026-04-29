// --- Cloudflare Worker bindings ---

export interface Env {
  TRELLO_API_KEY: string;
  TRELLO_TOKEN: string;
  TRELLO_BOARD_ID?: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  COOKIE_ENCRYPTION_KEY: string;
  OAUTH_KV: KVNamespace;
  ALLOWED_USERS: string; // comma-separated GitHub usernames
}

// --- Trello API types ---

export interface TrelloConfig {
  apiKey: string;
  token: string;
  defaultBoardId?: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
  idOrganization: string;
  url: string;
  shortUrl: string;
}

export interface TrelloWorkspace {
  id: string;
  name: string;
  displayName: string;
  desc?: string;
  url: string;
  website?: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  due: string | null;
  idList: string;
  idLabels: string[];
  closed: boolean;
  url: string;
  shortUrl: string;
  dateLastActivity: string;
}

export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  idBoard: string;
  pos: number;
}

export interface TrelloAction {
  id: string;
  idMemberCreator: string;
  type: string;
  date: string;
  data: {
    text?: string;
    card?: { id: string; name: string };
    list?: { id: string; name: string };
    board: { id: string; name: string };
  };
  memberCreator: {
    id: string;
    fullName: string;
    username: string;
  };
}

export interface TrelloMember {
  id: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
}

export interface TrelloLabel {
  id: string;
  idBoard?: string;
  name: string;
  color: string;
}

export interface TrelloAttachment {
  id: string;
  name: string;
  url: string;
  fileName: string | null;
  bytes: number | null;
  date: string;
  mimeType: string;
  previews: Array<{ id: string; url: string; width: number; height: number }>;
  isUpload: boolean;
}

export interface TrelloCheckItem {
  id: string;
  name: string;
  state: 'complete' | 'incomplete';
  pos: number;
  due?: string | null;
  dueReminder?: number | null;
  idMember?: string | null;
}

export type TrelloCheckItemUpdate = Partial<Pick<TrelloCheckItem, 'name' | 'state' | 'due' | 'dueReminder' | 'idMember'>> & {
  pos?: number | 'top' | 'bottom';
};

export interface TrelloChecklist {
  id: string;
  name: string;
  idCard: string;
  pos: number;
  checkItems: TrelloCheckItem[];
}

export interface TrelloComment {
  id: string;
  date: string;
  data: {
    text: string;
    card?: { id: string; name: string };
  };
  memberCreator: {
    id: string;
    fullName: string;
    username: string;
    avatarUrl?: string;
  };
}

export interface TrelloBadges {
  checkItems: number;
  checkItemsChecked: number;
  comments: number;
  attachments: number;
  votes: number;
  description: boolean;
  due?: string | null;
  dueComplete: boolean;
}

export interface EnhancedTrelloCard extends TrelloCard {
  dueComplete: boolean;
  start: string | null;
  idBoard: string;
  pos: number;
  labels: TrelloLabel[];
  attachments: TrelloAttachment[];
  checklists: TrelloChecklist[];
  members: TrelloMember[];
  idMembers: string[];
  comments: TrelloComment[];
  badges: TrelloBadges;
  list?: { id: string; name: string };
  board?: { id: string; name: string; url: string };
}

// --- MCP response helpers ---

export type McpTextContent = { type: 'text'; text: string };
export type McpImageContent = { type: 'image'; data: string; mimeType: string };
export type McpContent = McpTextContent | McpImageContent;
export type McpResult = { content: McpContent[]; isError?: boolean };

// --- Derived checklist types ---

export interface CheckList {
  id: string;
  name: string;
  items: CheckListItem[];
  percentComplete: number;
}

export interface CheckListItem {
  id: string;
  text: string;
  complete: boolean;
  parentCheckListId: string;
}
