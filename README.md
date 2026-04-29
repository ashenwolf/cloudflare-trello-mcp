# Trello MCP Server — Cloudflare Workers

A remote MCP server for managing Trello boards, deployed on Cloudflare Workers. Ported from [delorenj/mcp-server-trello](https://github.com/delorenj/mcp-server-trello).

## Architecture

- **Stateless Worker** — uses `createMcpHandler` (no Durable Objects), so you only pay for Worker invocations. On the free tier this is 100k requests/day.
- **Secrets via `wrangler secret`** — API keys are never in code or config files.
- **Native `fetch`** — no axios/Node.js dependencies; runs on the Workers runtime directly.
- **Streamable HTTP transport** — MCP clients connect via HTTP POST to `/mcp`.

## Prerequisites

1. A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
2. [Node.js](https://nodejs.org/) 18+
3. Trello API credentials:
   - **API Key**: https://trello.com/power-ups/admin → select your Power-Up → API Key
   - **Token**: Click "Token" link on the same page to generate one

## Setup

```bash
# Install dependencies
npm ci

# Set your Trello secrets (never committed to code)
npx wrangler secret put TRELLO_API_KEY
npx wrangler secret put TRELLO_TOKEN

# Optional: set a default board ID
npx wrangler secret put TRELLO_BOARD_ID
```

## Deploy

### Via GitHub Actions (recommended)

Pushes to `main` auto-deploy via the workflow in `.github/workflows/deploy.yml`.

1. Fork/clone this repo and push to GitHub.
2. Add a **repository secret** named `CLOUDFLARE_API_TOKEN` with a Cloudflare API token that has `Workers Scripts:Edit` permission.
3. Your Trello secrets (`TRELLO_API_KEY`, `TRELLO_TOKEN`) must already be set via `wrangler secret put` (they live in Cloudflare, not GitHub).
4. Push to `main` — the workflow installs, builds, and deploys.

### Manual

```bash
npm run deploy
```

Your MCP server will be live at `https://trello-mcp.<your-subdomain>.workers.dev/mcp`.

## Local Development

```bash
# Create a .dev.vars file for local secrets (git-ignored)
cat > .dev.vars << 'EOF'
TRELLO_API_KEY=your_api_key_here
TRELLO_TOKEN=your_token_here
TRELLO_BOARD_ID=optional_board_id
EOF

npm run dev
```

The dev server runs at `http://localhost:8787/mcp`.

## Connect from an MCP Client

### Claude Desktop / Cursor / etc.

Add to your MCP config:

```json
{
  "mcpServers": {
    "trello": {
      "url": "https://trello-mcp.<your-subdomain>.workers.dev/mcp"
    }
  }
}
```

## Available Tools (40+)

| Category | Tools |
|---|---|
| Boards | `list_boards`, `set_active_board`, `get_active_board_info`, `create_board` |
| Workspaces | `list_workspaces`, `set_active_workspace`, `list_boards_in_workspace` |
| Lists | `get_lists`, `add_list_to_board`, `archive_list`, `update_list_position` |
| Cards | `get_cards_by_list_id`, `get_my_cards`, `get_card`, `add_card_to_list`, `update_card_details`, `archive_card`, `move_card`, `get_recent_activity`, `get_card_history` |
| Attachments | `attach_image_to_card`, `attach_file_to_card`, `attach_image_data_to_card`, `download_attachment` |
| Comments | `add_comment`, `update_comment`, `delete_comment`, `get_card_comments` |
| Checklists | `create_checklist`, `get_checklist_items`, `add_checklist_item`, `find_checklist_items_by_description`, `get_acceptance_criteria`, `get_checklist_by_name`, `update_checklist_item`, `delete_checklist_item` |
| Members | `get_board_members`, `assign_member_to_card`, `remove_member_from_card` |
| Labels | `get_board_labels`, `create_label`, `update_label`, `delete_label` |
| Copy | `copy_card`, `copy_checklist` |
| Batch | `add_cards_to_list` |

## Cost

On the **Workers Free tier** you get 100,000 requests/day. For personal Trello use this is effectively free. No Durable Objects or KV storage are used.

## Security & Supply Chain

- **Secrets** — Trello credentials are stored as [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) (encrypted at rest, never in source). `.dev.vars` is git-ignored.
- **Per-request isolation** — A new `TrelloClient` is created per request to prevent cross-request data leakage (MCP SDK 1.26.0+ security fix).
- **Pinned dependencies** — All npm packages use exact versions in `package.json` (no `^` or `~` ranges).
- **Lockfile enforcement** — `npm ci` is used in CI and locally; `.npmrc` sets `package-lock=true` so the lockfile is always respected.
- **No install scripts** — `.npmrc` sets `ignore-scripts=true` to block malicious postinstall hooks.
- **SHA-pinned GitHub Actions** — All actions in the deploy workflow are pinned to full commit SHAs, not mutable tags, preventing tag-hijack attacks.
- **Least-privilege CI** — The workflow requests only `contents: read` and `deployments: write` permissions.
