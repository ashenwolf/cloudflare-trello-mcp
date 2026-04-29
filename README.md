# Trello MCP Server — Cloudflare Workers

A remote MCP server for managing Trello boards, deployed on Cloudflare Workers with GitHub OAuth authorization. Only users you explicitly allow can access it.

Ported from [delorenj/mcp-server-trello](https://github.com/delorenj/mcp-server-trello).

## Architecture

- **GitHub OAuth 2.1** — only authorized GitHub users can access the MCP tools. The `ALLOWED_USERS` secret controls who gets in.
- **Stateless Worker** — uses `createMcpHandler` (no Durable Objects), so you only pay for Worker invocations + minimal KV reads for OAuth tokens.
- **Secrets via `wrangler secret`** — API keys are never in code or config files.
- **Native `fetch`** — no axios/Node.js dependencies; runs on the Workers runtime directly.

## Prerequisites

1. A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
2. [Node.js](https://nodejs.org/) 18+
3. Trello API credentials:
   - **API Key**: https://trello.com/power-ups/admin → select your Power-Up → API Key
   - **Token**: Click "Token" link on the same page to generate one
4. A [GitHub OAuth App](https://github.com/settings/developers) (see setup below)

## Setup

### 1. Create a GitHub OAuth App

Go to [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**:

| Field | Value |
|---|---|
| Application name | `Trello MCP` |
| Homepage URL | `https://trello-mcp.<your-subdomain>.workers.dev` |
| Authorization callback URL | `https://trello-mcp.<your-subdomain>.workers.dev/callback` |

Note the **Client ID** and generate a **Client Secret**.

For local development, create a second OAuth App with `http://localhost:8787` as the URLs.

### 2. Create a KV namespace

```bash
npx wrangler kv namespace create OAUTH_KV
```

Copy the output ID into `wrangler.toml` replacing `REPLACE_ME`.

### 3. Set secrets

```bash
# Trello
npx wrangler secret put TRELLO_API_KEY
npx wrangler secret put TRELLO_TOKEN
npx wrangler secret put TRELLO_BOARD_ID          # optional

# GitHub OAuth
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET

# Security
npx wrangler secret put COOKIE_ENCRYPTION_KEY     # openssl rand -hex 32
npx wrangler secret put ALLOWED_USERS             # e.g. "ashenwolf" or "user1,user2"
```

### 4. Deploy

```bash
npm ci
npm run deploy
```

Or connect via **Cloudflare Dashboard → Workers & Pages → Connect to Git** for auto-deploy on push.

## Local Development

```bash
cat > .dev.vars << 'EOF'
TRELLO_API_KEY=your_api_key_here
TRELLO_TOKEN=your_token_here
GITHUB_CLIENT_ID=your_local_oauth_client_id
GITHUB_CLIENT_SECRET=your_local_oauth_client_secret
COOKIE_ENCRYPTION_KEY=any_random_hex_string
ALLOWED_USERS=your_github_username
EOF

npm run dev
```

The dev server runs at `http://localhost:8787/mcp`.

## Connect from an MCP Client

MCP clients that support OAuth (like Claude Desktop via `mcp-remote`) will be redirected to GitHub to log in, then back to the MCP server with an access token.

```json
{
  "mcpServers": {
    "trello": {
      "command": "npx",
      "args": ["mcp-remote", "https://trello-mcp.<your-subdomain>.workers.dev/mcp"]
    }
  }
}
```

On first connection, your browser will open for GitHub login. After authorizing, the MCP client receives a token and can call tools.

## Available Tools (40+)

| Category | Tools |
|---|---|
| Boards | `list_boards`, `set_active_board`, `get_active_board_info`, `create_board` |
| Workspaces | `list_workspaces`, `set_active_workspace`, `list_boards_in_workspace` |
| Lists | `get_lists`, `add_list_to_board`, `archive_list`, `update_list_position` |
| Cards | `get_cards_by_list_id`, `get_my_cards`, `get_card`, `add_card_to_list`, `update_card_details`, `archive_card`, `move_card`, `get_recent_activity`, `get_card_history` |
| Attachments | `attach_file_to_card`, `attach_image_data_to_card`, `download_attachment` |
| Comments | `add_comment`, `update_comment`, `delete_comment`, `get_card_comments` |
| Checklists | `create_checklist`, `get_checklist_items`, `add_checklist_item`, `find_checklist_items_by_description`, `get_acceptance_criteria`, `get_checklist_by_name`, `update_checklist_item`, `delete_checklist_item` |
| Members | `get_board_members`, `assign_member_to_card`, `remove_member_from_card` |
| Labels | `get_board_labels`, `create_label`, `update_label`, `delete_label` |
| Copy | `copy_card`, `copy_checklist` |
| Batch | `add_cards_to_list` |

## Cost

On the **Workers Free tier** you get 100,000 requests/day and 1,000 KV reads/day. For personal Trello use this is effectively free.

## Security & Supply Chain

- **OAuth 2.1 authorization** — MCP endpoint requires a valid access token. Unauthenticated requests get 401. The `OAuthProvider` library handles token issuance, PKCE, and refresh.
- **GitHub user allowlist** — The `ALLOWED_USERS` secret restricts access to specific GitHub usernames. Users not on the list get 403 at login time.
- **Secrets** — All credentials stored as [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/) (encrypted at rest, never in source). `.dev.vars` is git-ignored.
- **Per-request isolation** — A new `TrelloClient` is created per request to prevent cross-request data leakage.
- **Pinned dependencies** — All npm packages use exact versions in `package.json`.
- **Lockfile enforcement** — `npm ci` + `.npmrc` with `package-lock=true`.
- **No install scripts** — `.npmrc` sets `ignore-scripts=true` to block malicious postinstall hooks.
