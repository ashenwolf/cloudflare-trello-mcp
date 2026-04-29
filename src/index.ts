import { createMcpHandler } from 'agents/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TrelloClient } from './trello-client.js';
import { Env } from './types.js';

function createServer(env: Env) {
  const server = new McpServer({ name: 'trello-mcp', version: '1.0.0' });

  const client = new TrelloClient({
    apiKey: env.TRELLO_API_KEY,
    token: env.TRELLO_TOKEN,
    defaultBoardId: env.TRELLO_BOARD_ID,
    boardId: env.TRELLO_BOARD_ID,
  });

  const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
  const json = (o: unknown) => text(JSON.stringify(o, null, 2));
  const err = (e: unknown) => ({
    content: [{ type: 'text' as const, text: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }],
    isError: true,
  });

  // Board tools
  server.tool('list_boards', 'List all boards', {}, async () => {
    try { return json(await client.listBoards()); } catch (e) { return err(e); }
  });

  server.tool('set_active_board', 'Set the active board', { boardId: z.string() }, async ({ boardId }) => {
    try {
      const board = await client.setActiveBoard(boardId);
      return text(`Active board set to "${board.name}" (${board.id})`);
    } catch (e) { return err(e); }
  });

  server.tool('get_active_board_info', 'Get active board info', {}, async () => {
    try {
      const id = client.activeBoardId;
      if (!id) return { ...text('No active board set'), isError: true };
      return json(await client.getBoardById(id));
    } catch (e) { return err(e); }
  });

  server.tool('create_board', 'Create a new board', {
    name: z.string(),
    desc: z.string().optional(),
    idOrganization: z.string().optional(),
    defaultLabels: z.boolean().optional(),
    defaultLists: z.boolean().optional(),
  }, async (args) => {
    try { return json(await client.createBoard(args)); } catch (e) { return err(e); }
  });

  // Workspace tools
  server.tool('list_workspaces', 'List all workspaces', {}, async () => {
    try { return json(await client.listWorkspaces()); } catch (e) { return err(e); }
  });

  server.tool('set_active_workspace', 'Set active workspace', { workspaceId: z.string() }, async ({ workspaceId }) => {
    try {
      const ws = await client.setActiveWorkspace(workspaceId);
      return text(`Active workspace set to "${ws.displayName}" (${ws.id})`);
    } catch (e) { return err(e); }
  });

  server.tool('list_boards_in_workspace', 'List boards in a workspace', { workspaceId: z.string() }, async ({ workspaceId }) => {
    try { return json(await client.listBoardsInWorkspace(workspaceId)); } catch (e) { return err(e); }
  });

  // List tools
  server.tool('get_lists', 'Get all lists from a board', {
    boardId: z.string().optional(),
  }, async ({ boardId }) => {
    try { return json(await client.getLists(boardId)); } catch (e) { return err(e); }
  });

  server.tool('add_list_to_board', 'Add a new list to a board', {
    boardId: z.string().optional(),
    name: z.string(),
  }, async ({ boardId, name }) => {
    try { return json(await client.addList(boardId, name)); } catch (e) { return err(e); }
  });

  server.tool('archive_list', 'Archive a list', {
    boardId: z.string().optional(),
    listId: z.string(),
  }, async ({ boardId, listId }) => {
    try { return json(await client.archiveList(boardId, listId)); } catch (e) { return err(e); }
  });

  server.tool('update_list_position', 'Update list position', {
    listId: z.string(),
    position: z.string(),
  }, async ({ listId, position }) => {
    try {
      const pos = position === 'top' || position === 'bottom' ? position : Number(position);
      return json(await client.updateListPosition(listId, pos));
    } catch (e) { return err(e); }
  });

  // Card tools
  server.tool('get_cards_by_list_id', 'Get cards from a list', {
    listId: z.string(),
    fields: z.string().optional(),
  }, async ({ listId, fields }) => {
    try { return json(await client.getCardsByList(listId, fields)); } catch (e) { return err(e); }
  });

  server.tool('get_my_cards', 'Get cards assigned to me', {}, async () => {
    try { return json(await client.getMyCards()); } catch (e) { return err(e); }
  });

  server.tool('get_card', 'Get card details', {
    cardId: z.string(),
    includeMarkdown: z.boolean().optional(),
  }, async ({ cardId, includeMarkdown }) => {
    try { return json(await client.getCard(cardId, includeMarkdown)); } catch (e) { return err(e); }
  });

  server.tool('add_card_to_list', 'Add a card to a list', {
    boardId: z.string().optional(),
    listId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    start: z.string().optional(),
    labels: z.array(z.string()).optional(),
  }, async (args) => {
    try { return json(await client.addCard(args.boardId, args)); } catch (e) { return err(e); }
  });

  server.tool('update_card_details', 'Update a card', {
    boardId: z.string().optional(),
    cardId: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    start: z.string().optional(),
    dueComplete: z.boolean().optional(),
    labels: z.array(z.string()).optional(),
  }, async (args) => {
    try { return json(await client.updateCard(args.boardId, args)); } catch (e) { return err(e); }
  });

  server.tool('archive_card', 'Archive a card', {
    boardId: z.string().optional(),
    cardId: z.string(),
  }, async ({ boardId, cardId }) => {
    try { return json(await client.archiveCard(boardId, cardId)); } catch (e) { return err(e); }
  });

  server.tool('move_card', 'Move a card to a different list', {
    boardId: z.string().optional(),
    cardId: z.string(),
    listId: z.string(),
  }, async ({ boardId, cardId, listId }) => {
    try { return json(await client.moveCard(boardId, cardId, listId)); } catch (e) { return err(e); }
  });

  server.tool('get_recent_activity', 'Get recent board activity', {
    boardId: z.string().optional(),
    limit: z.number().optional(),
    since: z.string().optional(),
    before: z.string().optional(),
  }, async ({ boardId, limit, since, before }) => {
    try { return json(await client.getRecentActivity(boardId, limit ?? 10, since, before)); } catch (e) { return err(e); }
  });

  server.tool('get_card_history', 'Get card action history', {
    cardId: z.string(),
    filter: z.string().optional(),
    limit: z.number().optional(),
  }, async ({ cardId, filter, limit }) => {
    try { return json(await client.getCardHistory(cardId, filter, limit)); } catch (e) { return err(e); }
  });

  // Attachment tools
  server.tool('attach_image_to_card', 'Attach an image URL to a card', {
    boardId: z.string().optional(),
    cardId: z.string(),
    imageUrl: z.string(),
    name: z.string().optional(),
  }, async ({ boardId, cardId, imageUrl, name }) => {
    try { return json(await client.attachImageToCard(boardId, cardId, imageUrl, name)); } catch (e) { return err(e); }
  });

  server.tool('attach_file_to_card', 'Attach a file URL to a card', {
    boardId: z.string().optional(),
    cardId: z.string(),
    fileUrl: z.string(),
    name: z.string().optional(),
    mimeType: z.string().optional(),
  }, async ({ boardId, cardId, fileUrl, name, mimeType }) => {
    try { return json(await client.attachFileToCard(boardId, cardId, fileUrl, name, mimeType)); } catch (e) { return err(e); }
  });

  server.tool('attach_image_data_to_card', 'Attach base64 image data to a card', {
    boardId: z.string().optional(),
    cardId: z.string(),
    imageData: z.string(),
    name: z.string().optional(),
    mimeType: z.string().optional(),
  }, async ({ boardId, cardId, imageData, name, mimeType }) => {
    try { return json(await client.attachImageDataToCard(boardId, cardId, imageData, name, mimeType)); } catch (e) { return err(e); }
  });

  server.tool('download_attachment', 'Download an attachment from a card', {
    cardId: z.string(),
    attachmentId: z.string(),
  }, async ({ cardId, attachmentId }) => {
    try {
      const result = await client.downloadAttachment(cardId, attachmentId);
      if (result.mimeType.startsWith('image/')) {
        return {
          content: [
            { type: 'image' as const, data: result.data, mimeType: result.mimeType },
            { type: 'text' as const, text: `Downloaded: ${result.fileName}` },
          ],
        };
      }
      return json(result);
    } catch (e) { return err(e); }
  });

  // Comment tools
  server.tool('add_comment', 'Add a comment to a card', {
    cardId: z.string(),
    text: z.string(),
  }, async ({ cardId, text: t }) => {
    try { return json(await client.addCommentToCard(cardId, t)); } catch (e) { return err(e); }
  });

  server.tool('update_comment', 'Update a comment', {
    commentId: z.string(),
    text: z.string(),
  }, async ({ commentId, text: t }) => {
    try {
      await client.updateCommentOnCard(commentId, t);
      return text('success');
    } catch (e) { return err(e); }
  });

  server.tool('delete_comment', 'Delete a comment', { commentId: z.string() }, async ({ commentId }) => {
    try {
      await client.deleteCommentFromCard(commentId);
      return text('success');
    } catch (e) { return err(e); }
  });

  server.tool('get_card_comments', 'Get comments on a card', {
    cardId: z.string(),
    limit: z.number().optional(),
  }, async ({ cardId, limit }) => {
    try { return json(await client.getCardComments(cardId, limit)); } catch (e) { return err(e); }
  });

  // Checklist tools
  server.tool('create_checklist', 'Create a checklist on a card', {
    name: z.string(),
    cardId: z.string(),
  }, async ({ name, cardId }) => {
    try { return json(await client.createChecklist(name, cardId)); } catch (e) { return err(e); }
  });

  server.tool('get_checklist_items', 'Get checklist items by name', {
    name: z.string(),
    cardId: z.string().optional(),
    boardId: z.string().optional(),
  }, async ({ name, cardId, boardId }) => {
    try { return json(await client.getChecklistItems(name, cardId, boardId)); } catch (e) { return err(e); }
  });

  server.tool('add_checklist_item', 'Add item to a checklist', {
    text: z.string(),
    checkListName: z.string(),
    cardId: z.string().optional(),
    boardId: z.string().optional(),
  }, async ({ text: t, checkListName, cardId, boardId }) => {
    try { return json(await client.addChecklistItem(t, checkListName, cardId, boardId)); } catch (e) { return err(e); }
  });

  server.tool('find_checklist_items_by_description', 'Search checklist items', {
    description: z.string(),
    cardId: z.string().optional(),
    boardId: z.string().optional(),
  }, async ({ description, cardId, boardId }) => {
    try { return json(await client.findChecklistItemsByDescription(description, cardId, boardId)); } catch (e) { return err(e); }
  });

  server.tool('get_acceptance_criteria', 'Get acceptance criteria checklist', {
    cardId: z.string().optional(),
    boardId: z.string().optional(),
  }, async ({ cardId, boardId }) => {
    try { return json(await client.getAcceptanceCriteria(cardId, boardId)); } catch (e) { return err(e); }
  });

  server.tool('get_checklist_by_name', 'Get a checklist with completion info', {
    name: z.string(),
    cardId: z.string().optional(),
    boardId: z.string().optional(),
  }, async ({ name, cardId, boardId }) => {
    try {
      const cl = await client.getChecklistByName(name, cardId, boardId);
      if (!cl) return { ...text(`Checklist "${name}" not found`), isError: true };
      return json(cl);
    } catch (e) { return err(e); }
  });

  server.tool('update_checklist_item', 'Update a checklist item', {
    cardId: z.string(),
    checkItemId: z.string(),
    state: z.enum(['complete', 'incomplete']).optional(),
    name: z.string().optional(),
    pos: z.union([z.number(), z.enum(['top', 'bottom'])]).optional(),
    due: z.string().nullable().optional(),
    dueReminder: z.number().nullable().optional(),
    idMember: z.string().nullable().optional(),
  }, async ({ cardId, checkItemId, ...updates }) => {
    try { return json(await client.updateChecklistItem(cardId, checkItemId, updates)); } catch (e) { return err(e); }
  });

  server.tool('delete_checklist_item', 'Delete a checklist item', {
    cardId: z.string(),
    checkItemId: z.string(),
  }, async ({ cardId, checkItemId }) => {
    try { return json({ deleted: await client.deleteChecklistItem(cardId, checkItemId) }); } catch (e) { return err(e); }
  });

  // Member tools
  server.tool('get_board_members', 'Get board members', {
    boardId: z.string().optional(),
  }, async ({ boardId }) => {
    try { return json(await client.getBoardMembers(boardId)); } catch (e) { return err(e); }
  });

  server.tool('assign_member_to_card', 'Assign member to card', {
    cardId: z.string(),
    memberId: z.string(),
  }, async ({ cardId, memberId }) => {
    try { return json(await client.assignMemberToCard(cardId, memberId)); } catch (e) { return err(e); }
  });

  server.tool('remove_member_from_card', 'Remove member from card', {
    cardId: z.string(),
    memberId: z.string(),
  }, async ({ cardId, memberId }) => {
    try { return json(await client.removeMemberFromCard(cardId, memberId)); } catch (e) { return err(e); }
  });

  // Label tools
  server.tool('get_board_labels', 'Get board labels', {
    boardId: z.string().optional(),
  }, async ({ boardId }) => {
    try { return json(await client.getBoardLabels(boardId)); } catch (e) { return err(e); }
  });

  server.tool('create_label', 'Create a label', {
    boardId: z.string().optional(),
    name: z.string(),
    color: z.string().optional(),
  }, async ({ boardId, name, color }) => {
    try { return json(await client.createLabel(boardId, name, color)); } catch (e) { return err(e); }
  });

  server.tool('update_label', 'Update a label', {
    labelId: z.string(),
    name: z.string().optional(),
    color: z.string().optional(),
  }, async ({ labelId, name, color }) => {
    try { return json(await client.updateLabel(labelId, name, color)); } catch (e) { return err(e); }
  });

  server.tool('delete_label', 'Delete a label', { labelId: z.string() }, async ({ labelId }) => {
    try { await client.deleteLabel(labelId); return text('Label deleted'); } catch (e) { return err(e); }
  });

  // Copy tools
  server.tool('copy_card', 'Copy a card', {
    sourceCardId: z.string(),
    listId: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    keepFromSource: z.string().optional(),
    pos: z.string().optional(),
  }, async (args) => {
    try { return json(await client.copyCard(args)); } catch (e) { return err(e); }
  });

  server.tool('copy_checklist', 'Copy a checklist to another card', {
    sourceChecklistId: z.string(),
    cardId: z.string(),
    name: z.string().optional(),
    pos: z.string().optional(),
  }, async (args) => {
    try { return json(await client.copyChecklist(args)); } catch (e) { return err(e); }
  });

  // Batch tools
  server.tool('add_cards_to_list', 'Add multiple cards to a list', {
    listId: z.string(),
    cards: z.array(z.object({
      name: z.string(),
      description: z.string().optional(),
      dueDate: z.string().optional(),
      start: z.string().optional(),
      labels: z.array(z.string()).optional(),
    })),
  }, async ({ listId, cards }) => {
    try { return json(await client.batchAddCards(listId, cards)); } catch (e) { return err(e); }
  });

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const server = createServer(env);
    return createMcpHandler(server)(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
