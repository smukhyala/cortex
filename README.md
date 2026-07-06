# Cortex

Personal AI memory synchronization for ChatGPT, Claude, Claude Code, Poke, and local knowledge sources.

Cortex imports conversation exports and local memory files, extracts durable user facts with Claude, deduplicates/conflict-checks them, queues new memories for review, and exports the approved profile back into formats each AI tool can consume.

## Current Status

Implemented:

- ChatGPT export import from `.zip` or `.json`.
- Claude.ai export import from JSON.
- Claude Code memory/session import from `CLAUDE.md`, `MEMORY.md`, and `.jsonl` sessions.
- Granola markdown note import and watcher.
- Anthropic-powered extraction, categorization, deduplication, and conflict detection.
- Review queue, memory library, quick memory updates, and graph view.
- Export to ChatGPT Custom Instructions text, Claude `CLAUDE.md`, JSON, and Poke inbound API.
- MCP stdio and HTTP servers for reading and logging memories.

Preview/scaffolded:

- Gmail, Google Drive, and Notion connector cards are present, but service scanning is not implemented yet.
- Connector configuration is a UI/API preview rather than a durable background sync system.

## Architecture

- Next.js 16 App Router application.
- Prisma v7 with SQLite through the `better-sqlite3` adapter.
- Synchronous 4-step pipeline: ingest, extract/classify, deduplicate/conflict-check, commit.
- Direct Anthropic SDK calls for structured LLM output.
- Local filesystem watchers for Claude Code, Granola, and Downloads import workflows.

## Commands

```bash
npm run dev          # Start web UI on port 3000
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest
npm run db:migrate   # Prisma migrations
npm run db:studio    # Prisma Studio
npm run mcp          # MCP server over stdio
npm run mcp:http     # MCP server over Streamable HTTP
npm run watch:claude # Watch ~/.claude
npm run watch:granola
npm run watch:downloads
```

## Environment

Create `.env` with:

```bash
DATABASE_URL="file:../data/cortex.db"
ANTHROPIC_API_KEY="..."
POKE_API_KEY="..." # optional if you configure a Poke account in Settings
```

## Data

Runtime data lives under `data/`:

- `data/cortex.db` stores sources, conversations, memories, review items, conflicts, activity, export logs, and categories.
- `data/uploads/` stores uploaded conversation exports.

## Notes

- New memories are pending until approved.
- Approved memory edits, deletes, review approvals, and quick updates trigger platform propagation.
- Sensitive memories are excluded from ChatGPT, Claude, and Poke exports unless an exporter is explicitly called with `includeSensitive`.
- Custom categories are stored in the database and are passed into new extraction runs.
