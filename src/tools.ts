import { z, type ZodRawShape } from 'zod';
import type { TrelloClient } from './trello-client.js';
import type { McpResult } from './types.js';
import { mcpJson, mcpText } from './mcp-helpers.js';

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
    schema: { boardId: z.string() },
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
      name: z.string(), desc: z.string().optional(),
      idOrganization: z.string().optional(),
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
    schema: { workspaceId: z.string() },
    handler: async (c, { workspaceId }) => {
      const ws = await c.setActiveWorkspace(workspaceId);
      return mcpText(`Active workspace set to "${ws.displayName}" (${ws.id})`);
    },
  },
  {
    name: 'list_boards_in_workspace',
    description: 'List boards in a workspace',
    schema: { workspaceId: z.string() },
    handler: async (c, { workspaceId }) => mcpJson(await c.listBoardsInWorkspace(workspaceId)),
  },
];

// --- List tools ---

const listTools: ToolDef[] = [
  {
    name: 'get_lists',
    description: 'Get all lists from a board',
    schema: { boardId: z.string().optional() },
    handler: async (c, { boardId }) => mcpJson(await c.getLists(boardId)),
  },
  {
    name: 'add_list_to_board',
    description: 'Add a new list to a board',
    schema: { name: z.string(), boardId: z.string().optional() },
    handler: async (c, { name, boardId }) => mcpJson(await c.addList(name, boardId)),
  },
  {
    name: 'archive_list',
    description: 'Archive a list',
    schema: { listId: z.string() },
    handler: async (c, { listId }) => mcpJson(await c.archiveList(listId)),
  },
  {
    name: 'update_list_position',
    description: 'Update list position ("top", "bottom", or numeric)',
    schema: { listId: z.string(), position: z.string() },
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
    schema: { listId: z.string(), fields: z.string().optional() },
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
    schema: { cardId: z.string(), includeMarkdown: z.boolean().optional() },
    handler: async (c, { cardId, includeMarkdown }) => mcpJson(await c.getCard(cardId, includeMarkdown)),
  },
  {
    name: 'add_card_to_list',
    description: 'Add a card to a list',
    schema: {
      listId: z.string(), name: z.string(), description: z.string().optional(),
      dueDate: z.string().optional(), start: z.string().optional(),
      labels: z.array(z.string()).optional(),
    },
    handler: async (c, args) => mcpJson(await c.addCard(args)),
  },
  {
    name: 'update_card_details',
    description: 'Update a card',
    schema: {
      cardId: z.string(), name: z.string().optional(), description: z.string().optional(),
      dueDate: z.string().optional(), start: z.string().optional(),
      dueComplete: z.boolean().optional(), labels: z.array(z.string()).optional(),
    },
    handler: async (c, args) => mcpJson(await c.updateCard(args)),
  },
  {
    name: 'archive_card',
    description: 'Archive a card',
    schema: { cardId: z.string() },
    handler: async (c, { cardId }) => mcpJson(await c.archiveCard(cardId)),
  },
  {
    name: 'move_card',
    description: 'Move a card to a different list',
    schema: { cardId: z.string(), listId: z.string(), boardId: z.string().optional() },
    handler: async (c, { cardId, listId, boardId }) => mcpJson(await c.moveCard(cardId, listId, boardId)),
  },
  {
    name: 'get_recent_activity',
    description: 'Get recent board activity',
    schema: { boardId: z.string().optional(), limit: z.number().optional(), since: z.string().optional(), before: z.string().optional() },
    handler: async (c, { boardId, limit, since, before }) => mcpJson(await c.getRecentActivity(boardId, limit ?? 10, since, before)),
  },
  {
    name: 'get_card_history',
    description: 'Get card action history',
    schema: { cardId: z.string(), filter: z.string().optional(), limit: z.number().optional() },
    handler: async (c, { cardId, filter, limit }) => mcpJson(await c.getCardHistory(cardId, filter, limit)),
  },
];

// --- Attachment tools ---

const attachmentTools: ToolDef[] = [
  {
    name: 'attach_file_to_card',
    description: 'Attach a file or image URL to a card',
    schema: { cardId: z.string(), fileUrl: z.string(), name: z.string().optional() },
    handler: async (c, { cardId, fileUrl, name }) => mcpJson(await c.attachFileToCard(cardId, fileUrl, name)),
  },
  {
    name: 'attach_image_data_to_card',
    description: 'Attach base64 image data to a card',
    schema: { cardId: z.string(), imageData: z.string(), name: z.string().optional(), mimeType: z.string().optional() },
    handler: async (c, { cardId, imageData, name, mimeType }) => mcpJson(await c.attachImageDataToCard(cardId, imageData, name, mimeType)),
  },
  {
    name: 'download_attachment',
    description: 'Download an attachment from a card',
    schema: { cardId: z.string(), attachmentId: z.string() },
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
    schema: { cardId: z.string(), text: z.string() },
    handler: async (c, { cardId, text }) => mcpJson(await c.addComment(cardId, text)),
  },
  {
    name: 'update_comment',
    description: 'Update a comment',
    schema: { commentId: z.string(), text: z.string() },
    handler: async (c, { commentId, text }) => { await c.updateComment(commentId, text); return mcpText('success'); },
  },
  {
    name: 'delete_comment',
    description: 'Delete a comment',
    schema: { commentId: z.string() },
    handler: async (c, { commentId }) => { await c.deleteComment(commentId); return mcpText('success'); },
  },
  {
    name: 'get_card_comments',
    description: 'Get comments on a card',
    schema: { cardId: z.string(), limit: z.number().optional() },
    handler: async (c, { cardId, limit }) => mcpJson(await c.getCardComments(cardId, limit)),
  },
];

// --- Checklist tools ---

const checklistTools: ToolDef[] = [
  {
    name: 'create_checklist',
    description: 'Create a checklist on a card',
    schema: { cardId: z.string(), name: z.string() },
    handler: async (c, { cardId, name }) => mcpJson(await c.createChecklist(cardId, name)),
  },
  {
    name: 'get_checklist_items',
    description: 'Get checklist items by name',
    schema: { name: z.string(), cardId: z.string().optional(), boardId: z.string().optional() },
    handler: async (c, { name, cardId, boardId }) => mcpJson(await c.getChecklistItems(name, cardId, boardId)),
  },
  {
    name: 'add_checklist_item',
    description: 'Add item to a checklist',
    schema: { text: z.string(), checkListName: z.string(), cardId: z.string().optional(), boardId: z.string().optional() },
    handler: async (c, { text, checkListName, cardId, boardId }) => mcpJson(await c.addChecklistItem(text, checkListName, cardId, boardId)),
  },
  {
    name: 'find_checklist_items_by_description',
    description: 'Search checklist items',
    schema: { description: z.string(), cardId: z.string().optional(), boardId: z.string().optional() },
    handler: async (c, args) => mcpJson(await c.findChecklistItemsByDescription(args.description, args.cardId, args.boardId)),
  },
  {
    name: 'get_acceptance_criteria',
    description: 'Get acceptance criteria checklist',
    schema: { cardId: z.string().optional(), boardId: z.string().optional() },
    handler: async (c, { cardId, boardId }) => mcpJson(await c.getAcceptanceCriteria(cardId, boardId)),
  },
  {
    name: 'get_checklist_by_name',
    description: 'Get a checklist with completion info',
    schema: { name: z.string(), cardId: z.string().optional(), boardId: z.string().optional() },
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
      cardId: z.string(), checkItemId: z.string(),
      state: z.enum(['complete', 'incomplete']).optional(), name: z.string().optional(),
      pos: z.union([z.number(), z.enum(['top', 'bottom'])]).optional(),
      due: z.string().nullable().optional(), dueReminder: z.number().nullable().optional(),
      idMember: z.string().nullable().optional(),
    },
    handler: async (c, { cardId, checkItemId, ...updates }) => mcpJson(await c.updateChecklistItem(cardId, checkItemId, updates)),
  },
  {
    name: 'delete_checklist_item',
    description: 'Delete a checklist item',
    schema: { cardId: z.string(), checkItemId: z.string() },
    handler: async (c, { cardId, checkItemId }) => { await c.deleteChecklistItem(cardId, checkItemId); return mcpJson({ deleted: true }); },
  },
];

// --- Member tools ---

const memberTools: ToolDef[] = [
  {
    name: 'get_board_members',
    description: 'Get board members',
    schema: { boardId: z.string().optional() },
    handler: async (c, { boardId }) => mcpJson(await c.getBoardMembers(boardId)),
  },
  {
    name: 'assign_member_to_card',
    description: 'Assign member to card',
    schema: { cardId: z.string(), memberId: z.string() },
    handler: async (c, { cardId, memberId }) => mcpJson(await c.assignMemberToCard(cardId, memberId)),
  },
  {
    name: 'remove_member_from_card',
    description: 'Remove member from card',
    schema: { cardId: z.string(), memberId: z.string() },
    handler: async (c, { cardId, memberId }) => mcpJson(await c.removeMemberFromCard(cardId, memberId)),
  },
];

// --- Label tools ---

const labelTools: ToolDef[] = [
  {
    name: 'get_board_labels',
    description: 'Get board labels',
    schema: { boardId: z.string().optional() },
    handler: async (c, { boardId }) => mcpJson(await c.getBoardLabels(boardId)),
  },
  {
    name: 'create_label',
    description: 'Create a label',
    schema: { name: z.string(), color: z.string().optional(), boardId: z.string().optional() },
    handler: async (c, { name, color, boardId }) => mcpJson(await c.createLabel(name, color, boardId)),
  },
  {
    name: 'update_label',
    description: 'Update a label',
    schema: { labelId: z.string(), name: z.string().optional(), color: z.string().optional() },
    handler: async (c, { labelId, ...updates }) => mcpJson(await c.updateLabel(labelId, updates)),
  },
  {
    name: 'delete_label',
    description: 'Delete a label',
    schema: { labelId: z.string() },
    handler: async (c, { labelId }) => { await c.deleteLabel(labelId); return mcpText('Label deleted'); },
  },
];

// --- Copy tools ---

const copyTools: ToolDef[] = [
  {
    name: 'copy_card',
    description: 'Copy a card',
    schema: { sourceCardId: z.string(), listId: z.string(), name: z.string().optional(), description: z.string().optional(), keepFromSource: z.string().optional(), pos: z.string().optional() },
    handler: async (c, args) => mcpJson(await c.copyCard(args)),
  },
  {
    name: 'copy_checklist',
    description: 'Copy a checklist to another card',
    schema: { sourceChecklistId: z.string(), cardId: z.string(), name: z.string().optional(), pos: z.string().optional() },
    handler: async (c, args) => mcpJson(await c.copyChecklist(args)),
  },
];

// --- Batch tools ---

const batchTools: ToolDef[] = [
  {
    name: 'add_cards_to_list',
    description: 'Add multiple cards to a list',
    schema: {
      listId: z.string(),
      cards: z.array(z.object({
        name: z.string(), description: z.string().optional(),
        dueDate: z.string().optional(), start: z.string().optional(),
        labels: z.array(z.string()).optional(),
      })),
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
