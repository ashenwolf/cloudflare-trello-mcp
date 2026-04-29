// Typed Trello API path builder — centralizes all routes, makes typos impossible.

const me = {
  boards: '/members/me/boards',
  cards: '/members/me/cards',
  organizations: '/members/me/organizations',
} as const;

const boards = (id: string) => ({
  self: `/boards/${id}`,
  lists: `/boards/${id}/lists`,
  actions: `/boards/${id}/actions`,
  checklists: `/boards/${id}/checklists`,
  members: `/boards/${id}/members`,
  labels: `/boards/${id}/labels`,
}) as const;

const cards = (id: string) => ({
  self: `/cards/${id}`,
  attachments: `/cards/${id}/attachments`,
  attachment: (attachmentId: string) => `/cards/${id}/attachments/${attachmentId}`,
  attachmentDownload: (attachmentId: string, fileName: string) =>
    `/cards/${id}/attachments/${attachmentId}/download/${encodeURIComponent(fileName)}`,
  comments: `/cards/${id}/actions/comments`,
  actions: `/cards/${id}/actions`,
  checklists: `/cards/${id}/checklists`,
  checkItem: (checkItemId: string) => `/cards/${id}/checkItem/${checkItemId}`,
  members: `/cards/${id}/idMembers`,
  member: (memberId: string) => `/cards/${id}/idMembers/${memberId}`,
}) as const;

const lists = (id: string) => ({
  self: `/lists/${id}`,
  cards: `/lists/${id}/cards`,
  closed: `/lists/${id}/closed`,
  pos: `/lists/${id}/pos`,
}) as const;

const checklists = (id: string) => ({
  self: `/checklists/${id}`,
  checkItems: `/checklists/${id}/checkItems`,
}) as const;

const organizations = (id: string) => ({
  self: `/organizations/${id}`,
  boards: `/organizations/${id}/boards`,
}) as const;

const actions = (id: string) => ({
  self: `/actions/${id}`,
}) as const;

const labels = (id: string) => ({
  self: `/labels/${id}`,
}) as const;

export const paths = { me, boards, cards, lists, checklists, organizations, actions, labels } as const;
