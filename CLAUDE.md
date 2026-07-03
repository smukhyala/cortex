# Cortex

Personal AI memory synchronization layer. Extracts memories from AI conversations (ChatGPT, Claude, Poke), curates them via review queue, exports to each platform's native format.

## Architecture

- Single Next.js 15 app with App Router (no monorepo)
- Prisma v7 + SQLite via better-sqlite3 adapter (data/cortex.db)
- 4-agent pipeline: Ingest → Extract+Classify → Deduplicate+Conflict → Commit
- LLM calls via Anthropic SDK directly (no abstraction layer)
- MCP server for Poke/Claude to pull context (stdio transport)
- fs.watch script for Claude Code auto-sync

## Key Directories

- `src/pipeline/` — 4 agents (ingest, extract, deduplicate, commit) + orchestrator (run.ts)
- `src/parsers/` — ChatGPT ZIP/JSON tree flattener, Claude Code CLAUDE.md parser/writer, Claude.ai JSON parser
- `src/exporters/` — ChatGPT Custom Instructions text, Claude CLAUDE.md w/ cortex markers, Poke API push
- `src/contracts/` — Zod schemas for all data types and pipeline I/O
- `src/mcp/` — MCP server: cortex_get_memories, cortex_get_context, cortex_search_memories
- `src/app/api/` — API routes: sync, upload, memories, review, export, sources, activity, writeback
- `src/components/` — App sidebar, file upload (drag-and-drop), shadcn/ui primitives
- `src/watcher.ts` — Standalone fs.watch script for Claude Code directories

## Conventions

- Zod v4: use `z.toJSONSchema()`, not zod-to-json-schema package
- shadcn/ui uses Base UI: use `render` prop, NOT `asChild`
- Prisma v7: requires adapter (`PrismaBetterSqlite3`), constructor requires options object
- Pipeline runs synchronously on trigger — no background worker, no polling
- Tests in `__tests__/` with Vitest, fixtures in `fixtures/`
- Auto-approve: only refinements of existing approved + not sensitive + not correction
- ChatGPT parser handles both .zip and .json files
- CLAUDE.md write-back uses `<!-- cortex:begin -->` / `<!-- cortex:end -->` markers

## Commands

- `npm run dev` — Start web UI (port 3000)
- `npm run mcp` — Start MCP server (stdio)
- `npm run watch:claude` — Watch ~/.claude/ for changes, auto-trigger sync
- `npm test` — Run all tests
- `npm run db:migrate` — Run Prisma migrations
- `npm run db:studio` — Open Prisma Studio
