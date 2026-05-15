import { z, type ZodRawShape } from 'zod';
import type { TrelloClient } from './trello-client.js';
import type { McpResult } from './types.js';
import { mcpJson, mcpText } from './mcp-helpers.js';
import { MAX_IMAGE_DATA_LENGTH } from './trello-client.js';

// --- Reusable input schemas ---
//
// Trello IDs are 24-char lowercase hex. Constraining shape rejects garbage at
// the worker before it costs a Trello round-trip and removes string-length
// DoS vectors. Free-text fields are capped at Trello's documented per-field
// limit (16384). The image-data cap is intentionally well below the Worker's
// 128 MB memory budget.
//
// Trello label colors are a documented closed set, including the literal
// string 'null' (used to clear a label color). Using `z.enum` here forces
// callers to use one of those values.
//
// `isoDate` accepts ISO 8601 date or datetime with optional offset. It does
// NOT accept Trello's `lastView` shortcut for `since`/`before` — callers
// should pass an explicit datetime instead.

const schemas = {
  id: z.string().regex(/^[a-f0-9]{24}$/, 'Must be a 24-char hex Trello ID'),
  name: z.string().min(1).max(16_384),
  desc: z.string().max(16_384),
  color: z.enum(['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black', 'null']),
  pos: z.string().max(32),
  fields: z.string().max(500),
  shortText: z.string().max(200),
  isoDate: z.string().max(64).regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/,
    'Must be an ISO 8601 date or datetime',
  ),
  fileUrl: z.string().url().max(2048),
  imageData: z.string().min(1).max(MAX_IMAGE_DATA_LENGTH),
} as const;

// A tool definition: declarative config + handler.
// Schema types are validated at runtime by zod; the handler receives the parsed output.
// We use `any` for the erased args type because the generic schema is only known
// at each definition site — the registration loop in index.ts doesn't need it.
interface ToolDef {
  name: string;
  description: string;
  schema: ZodRawShape;
  handler: (client: TrelloClient, args: any) => Promise<McpResult>;
}

// --- Board tools ---

const boardTools: ToolDef[] = [
  {
    name: 'list_boards',
    description: 'List all boards',
    schema: {},
    handler: async (c) => mcpJson(await c.listBoards()),
  },
  {
    name: 'set_active_board',
    description: 'Set the active board',
    schema: { boardId: schemas.id },
    handler: async (c, { boardId }) => {
      const board = await c.setActiveBoard(boardId);
      return mcpText(`Active board set to "${board.name}" (${board.id})`);
    },
  },
  {
    name: 'get_active_board_info',
    description: 'Get active board info',
    schema: {},
    handler: async (c) => {
      const id = c.activeBoardId;
      if (!id) return { ...mcpText('No active board set'), isError: true };
      return mcpJson(await c.getBoardById(id));
    },
  },
  {
    name: 'create_board',
    description: 'Create a new board',
    schema: {
      name: schemas.name, desc: schemas.desc.optional(),
      idOrganization: schemas.id.optional(),
      defaultLabels: z.boolean().optional(), defaultLists: z.boolean().optional(),
    },
    handler: async (c, args) => mcpJson(await c.createBoard(args)),
  },
];

// --- Workspace tools ---

const workspaceTools: ToolDef[] = [
  {
    name: 'list_workspaces',
    description: 'List all workspaces',
    schema: {},
    handler: async (c) => mcpJson(await c.listWorkspaces()),
  },
  {
    name: 'set_active_workspace',
    description: 'Set active workspace',
    schema: { workspaceId: schemas.id },
    handler: async (c, { workspaceId }) => {
      const ws = await c.setActiveWorkspace(workspaceId);
      return mcpText(`Active workspace set to "${ws.displayName}" (${ws.id})`);
    },
  },
  {
    name: 'list_boards_in_workspace',
    description: 'List boards in a workspace',
    schema: { workspaceId: schemas.id },
    handler: async (c, { workspaceId }) => mcpJson(await c.listBoardsInWorkspace(workspaceId)),
  },
];

// --- List tools ---

const listTools: ToolDef[] = [
  {
    name: 'get_lists',
    description: 'Get all lists from a board',
    schema: { boardId: schemas.id.optional() },
    handler: async (c, { boardId }) => mcpJson(await c.getLists(boardId)),
  },
  {
    name: 'add_list_to_board',
    description: 'Add a new list to a board',
    schema: { name: schemas.name, boardId: schemas.id.optional() },
    handler: async (c, { name, boardId }) => mcpJson(await c.addList(name, boardId)),
  },
  {
    name: 'archive_list',
    description: 'Archive a list',
    schema: { listId: schemas.id },
    handler: async (c, { listId }) => mcpJson(await c.archiveList(listId)),
  },
  {
    name: 'update_list_position',
    description: 'Update list position ("top", "bottom", or numeric)',
    schema: { listId: schemas.id, position: schemas.pos },
    handler: async (c, { listId, position }) => {
      const pos = position === 'top' || position === 'bottom' ? position : Number(position);
      return mcpJson(await c.updateListPosition(listId, pos));
    },
  },
];

// --- Card tools ---

const cardTools: ToolDef[] = [
  {
    name: 'get_cards_by_list_id',
    description: 'Get cards from a list',
    schema: { listId: schemas.id, fields: schemas.fields.optional() },
    handler: async (c, { listId, fields }) => mcpJson(await c.getCardsByList(listId, fields)),
  },
  {
    name: 'get_my_cards',
    description: 'Get cards assigned to me',
    schema: {},
    handler: async (c) => mcpJson(await c.getMyCards()),
  },
  {
    name: 'get_card',
    description: 'Get card details',
    schema: { cardId: schemas.id, includeMarkdown: z.boolean().optional() },
    handler: async (c, { cardId, includeMarkdown }) => mcpJson(await c.getCard(cardId, includeMarkdown)),
  },
  {
    name: 'add_card_to_list',
    description: 'Add a card to a list',
    schema: {
      listId: schemas.id, name: schemas.name, description: schemas.desc.optional(),
      dueDate: schemas.isoDate.optional(), start: schemas.isoDate.optional(),
      labels: z.array(schemas.id).optional(),
    },
    handler: async (c, args) => mcpJson(await c.addCard(args)),
  },
  {
    name: 'update_card_details',
    description: 'Update a card',
    schema: {
      cardId: schemas.id, name: schemas.name.optional(), description: schemas.desc.optional(),
      dueDate: schemas.isoDate.optional(), start: schemas.isoDate.optional(),
      dueComplete: z.boolean().optional(), labels: z.array(schemas.id).optional(),
    },
    handler: async (c, args) => mcpJson(await c.updateCard(args)),
  },
  {
    name: 'archive_card',
    description: 'Archive a card',
    schema: { cardId: schemas.id },
    handler: async (c, { cardId }) => mcpJson(await c.archiveCard(cardId)),
  },
  {
    name: 'move_card',
    description: 'Move a card to a different list',
    schema: { cardId: schemas.id, listId: schemas.id, boardId: schemas.id.optional() },
    handler: async (c, { cardId, listId, boardId }) => mcpJson(await c.moveCard(cardId, listId, boardId)),
  },
  {
    name: 'get_recent_activity',
    description: 'Get recent board activity',
    schema: { boardId: schemas.id.optional(), limit: z.number().int().positive().max(1000).optional(), since: schemas.isoDate.optional(), before: schemas.isoDate.optional() },
    handler: async (c, { boardId, limit, since, before }) => mcpJson(await c.getRecentActivity(boardId, limit ?? 10, since, before)),
  },
  {
    name: 'get_card_history',
    description: 'Get card action history',
    schema: { cardId: schemas.id, filter: schemas.shortText.optional(), limit: z.number().int().positive().max(1000).optional() },
    handler: async (c, { cardId, filter, limit }) => mcpJson(await c.getCardHistory(cardId, filter, limit)),
  },
];

// --- Attachment tools ---

const attachmentTools: ToolDef[] = [
  {
    name: 'attach_file_to_card',
    description: 'Attach a file or image URL to a card',
    schema: { cardId: schemas.id, fileUrl: schemas.fileUrl, name: schemas.name.optional() },
    handler: async (c, { cardId, fileUrl, name }) => mcpJson(await c.attachFileToCard(cardId, fileUrl, name)),
  },
  {
    name: 'attach_image_data_to_card',
    description: `Attach base64 image data to a card (max ~${Math.round(MAX_IMAGE_DATA_LENGTH / (1024 * 1024))} MB base64)`,
    schema: { cardId: schemas.id, imageData: schemas.imageData, name: schemas.name.optional(), mimeType: schemas.shortText.optional() },
    handler: async (c, { cardId, imageData, name, mimeType }) => mcpJson(await c.attachImageDataToCard(cardId, imageData, name, mimeType)),
  },
  {
    name: 'download_attachment',
    description: 'Download an attachment from a card',
    schema: { cardId: schemas.id, attachmentId: schemas.id },
    handler: async (c, { cardId, attachmentId }) => {
      const result = await c.downloadAttachment(cardId, attachmentId);
      if (result.mimeType.startsWith('image/')) {
        return {
          content: [
            { type: 'image' as const, data: result.data, mimeType: result.mimeType },
            { type: 'text' as const, text: `Downloaded: ${result.fileName}` },
          ],
        };
      }
      return mcpJson(result);
    },
  },
];

// --- Comment tools ---

const commentTools: ToolDef[] = [
  {
    name: 'add_comment',
    description: 'Add a comment to a card',
    schema: { cardId: schemas.id, text: schemas.desc.min(1) },
    handler: async (c, { cardId, text }) => mcpJson(await c.addComment(cardId, text)),
  },
  {
    name: 'update_comment',
    description: 'Update a comment',
    schema: { commentId: schemas.id, text: schemas.desc.min(1) },
    handler: async (c, { commentId, text }) => { await c.updateComment(commentId, text); return mcpText('success'); },
  },
  {
    name: 'delete_comment',
    description: 'Delete a comment',
    schema: { commentId: schemas.id },
    handler: async (c, { commentId }) => { await c.deleteComment(commentId); return mcpText('success'); },
  },
  {
    name: 'get_card_comments',
    description: 'Get comments on a card',
    schema: { cardId: schemas.id, limit: z.number().int().positive().max(1000).optional() },
    handler: async (c, { cardId, limit }) => mcpJson(await c.getCardComments(cardId, limit)),
  },
];

// --- Checklist tools ---

const checklistTools: ToolDef[] = [
  {
    name: 'create_checklist',
    description: 'Create a checklist on a card',
    schema: { cardId: schemas.id, name: schemas.name },
    handler: async (c, { cardId, name }) => mcpJson(await c.createChecklist(cardId, name)),
  },
  {
    name: 'get_checklist_items',
    description: 'Get checklist items by name',
    schema: { name: schemas.name, cardId: schemas.id.optional(), boardId: schemas.id.optional() },
    handler: async (c, { name, cardId, boardId }) => mcpJson(await c.getChecklistItems(name, cardId, boardId)),
  },
  {
    name: 'add_checklist_item',
    description: 'Add item to a checklist',
    schema: { text: schemas.name, checkListName: schemas.name, cardId: schemas.id.optional(), boardId: schemas.id.optional() },
    handler: async (c, { text, checkListName, cardId, boardId }) => mcpJson(await c.addChecklistItem(text, checkListName, cardId, boardId)),
  },
  {
    name: 'find_checklist_items_by_description',
    description: 'Search checklist items',
    schema: { description: schemas.name, cardId: schemas.id.optional(), boardId: schemas.id.optional() },
    handler: async (c, args) => mcpJson(await c.findChecklistItemsByDescription(args.description, args.cardId, args.boardId)),
  },
  {
    name: 'get_acceptance_criteria',
    description: 'Get acceptance criteria checklist',
    schema: { cardId: schemas.id.optional(), boardId: schemas.id.optional() },
    handler: async (c, { cardId, boardId }) => mcpJson(await c.getAcceptanceCriteria(cardId, boardId)),
  },
  {
    name: 'get_checklist_by_name',
    description: 'Get a checklist with completion info',
    schema: { name: schemas.name, cardId: schemas.id.optional(), boardId: schemas.id.optional() },
    handler: async (c, { name, cardId, boardId }) => {
      const cl = await c.getChecklistByName(name, cardId, boardId);
      if (!cl) return { ...mcpText(`Checklist "${name}" not found`), isError: true };
      return mcpJson(cl);
    },
  },
  {
    name: 'update_checklist_item',
    description: 'Update a checklist item',
    schema: {
      cardId: schemas.id, checkItemId: schemas.id,
      state: z.enum(['complete', 'incomplete']).optional(), name: schemas.name.optional(),
      pos: z.union([z.number(), z.enum(['top', 'bottom'])]).optional(),
      due: schemas.isoDate.nullable().optional(), dueReminder: z.number().nullable().optional(),
      idMember: schemas.id.nullable().optional(),
    },
    handler: async (c, { cardId, checkItemId, ...updates }) => mcpJson(await c.updateChecklistItem(cardId, checkItemId, updates)),
  },
  {
    name: 'delete_checklist_item',
    description: 'Delete a checklist item',
    schema: { cardId: schemas.id, checkItemId: schemas.id },
    handler: async (c, { cardId, checkItemId }) => { await c.deleteChecklistItem(cardId, checkItemId); return mcpJson({ deleted: true }); },
  },
];

// --- Member tools ---

const memberTools: ToolDef[] = [
  {
    name: 'get_board_members',
    description: 'Get board members',
    schema: { boardId: schemas.id.optional() },
    handler: async (c, { boardId }) => mcpJson(await c.getBoardMembers(boardId)),
  },
  {
    name: 'assign_member_to_card',
    description: 'Assign member to card',
    schema: { cardId: schemas.id, memberId: schemas.id },
    handler: async (c, { cardId, memberId }) => mcpJson(await c.assignMemberToCard(cardId, memberId)),
  },
  {
    name: 'remove_member_from_card',
    description: 'Remove member from card',
    schema: { cardId: schemas.id, memberId: schemas.id },
    handler: async (c, { cardId, memberId }) => mcpJson(await c.removeMemberFromCard(cardId, memberId)),
  },
];

// --- Label tools ---

const labelTools: ToolDef[] = [
  {
    name: 'get_board_labels',
    description: 'Get board labels',
    schema: { boardId: schemas.id.optional() },
    handler: async (c, { boardId }) => mcpJson(await c.getBoardLabels(boardId)),
  },
  {
    name: 'create_label',
    description: 'Create a label',
    schema: { name: schemas.name, color: schemas.color.optional(), boardId: schemas.id.optional() },
    handler: async (c, { name, color, boardId }) => mcpJson(await c.createLabel(name, color, boardId)),
  },
  {
    name: 'update_label',
    description: 'Update a label',
    schema: { labelId: schemas.id, name: schemas.name.optional(), color: schemas.color.optional() },
    handler: async (c, { labelId, ...updates }) => mcpJson(await c.updateLabel(labelId, updates)),
  },
  {
    name: 'delete_label',
    description: 'Delete a label',
    schema: { labelId: schemas.id },
    handler: async (c, { labelId }) => { await c.deleteLabel(labelId); return mcpText('Label deleted'); },
  },
];

// --- Copy tools ---

const copyTools: ToolDef[] = [
  {
    name: 'copy_card',
    description: 'Copy a card',
    schema: { sourceCardId: schemas.id, listId: schemas.id, name: schemas.name.optional(), description: schemas.desc.optional(), keepFromSource: schemas.shortText.optional(), pos: schemas.pos.optional() },
    handler: async (c, args) => mcpJson(await c.copyCard(args)),
  },
  {
    name: 'copy_checklist',
    description: 'Copy a checklist to another card',
    schema: { sourceChecklistId: schemas.id, cardId: schemas.id, name: schemas.name.optional(), pos: schemas.pos.optional() },
    handler: async (c, args) => mcpJson(await c.copyChecklist(args)),
  },
];

// --- Batch tools ---

const batchTools: ToolDef[] = [
  {
    name: 'add_cards_to_list',
    description: 'Add multiple cards to a list',
    schema: {
      listId: schemas.id,
      cards: z.array(z.object({
        name: schemas.name, description: schemas.desc.optional(),
        dueDate: schemas.isoDate.optional(), start: schemas.isoDate.optional(),
        labels: z.array(schemas.id).optional(),
      })).min(1).max(50),
    },
    handler: async (c, { listId, cards }) => mcpJson(await c.batchAddCards(listId, cards)),
  },
];

// --- Export flat array ---

export const allTools: ToolDef[] = [
  ...boardTools, ...workspaceTools, ...listTools, ...cardTools,
  ...attachmentTools, ...commentTools, ...checklistTools,
  ...memberTools, ...labelTools, ...copyTools, ...batchTools,
];
