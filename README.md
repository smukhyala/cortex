# Cortex

Cortex keeps one memory of you and syncs it across the AI tools you already use — ChatGPT, Claude, Claude Code, Poke, and local notes.

Every assistant starts from zero. You explain your stack, your projects, and how you like things written, and the moment you switch tabs it's gone. I got tired of being a stranger to my own tools, so I built a place that reads context out of each one, works out what's actually worth remembering, and writes a clean version back to all of them.

It runs locally. Your memories live in a SQLite file on your machine, and nothing leaves until you approve it.

## How it works

When you hand Cortex a conversation export or point it at a memory file, it runs a four-step pipeline:

1. **Ingest** — unpack ChatGPT `.zip`/`.json`, Claude.ai JSON, or Claude Code `CLAUDE.md` / `MEMORY.md` / session `.jsonl`, and flatten everything into normalized conversations. Each one is hashed, so re-importing the same export doesn't reprocess it.
2. **Extract** — Claude reads the conversations and pulls out durable facts, not passing chatter. Each fact gets a category, a read on whether it's lasting or temporary, and a sensitivity flag. Structured output means it comes back as typed data instead of prose I have to parse.
3. **Deduplicate** — every new fact is checked against what's already stored. Cortex looks for contradictions, duplicates, refinements, and facts that supersede an older memory, and proposes what to do with each.
4. **Commit** — survivors are written to the database. New or sensitive ones wait in a review queue; trusted, unambiguous ones can go straight through.

Once a memory is approved, Cortex propagates it back out in each tool's native shape: ChatGPT custom instructions, a Claude `CLAUDE.md` (wrapped in markers so it never clobbers sections you wrote by hand), the Poke API, or plain JSON.

Every step is defined by a Zod schema, so the contract between stages is checked at runtime and the data can't quietly drift.

## The workspace

A big pile of memories isn't useful if the assistant has to wade through all of it. Cortex keeps a small, active set — the workspace — that gets served first, ahead of a much larger background store.

The idea, and some of the vocabulary, comes from ["Verbalizable Representations Form a Global Workspace in Language Models"](https://transformer-circuits.pub/2026/workspace/index.html), which describes a small privileged set of things a model is "poised to verbalize" sitting on top of a lot of automatic processing. I borrowed the metaphor, not the mechanism:

- Memories occupy workspace **slots** with a **loading** value that decays exponentially (7-day half-life by default). Reference a memory and it's refreshed; ignore it and it fades until it's evicted back to the background.
- You can **pin** a memory so it never decays, or **suppress** one you don't want surfacing right now.
- When a cluster of related memories lights up together, an **ignition** boost pulls the whole cluster into focus — a nod to how the theory describes ideas cohering into a single conscious moment.

The scoring underneath is ordinary — keyword overlap, category match, recency, co-occurrence — dressed in the paper's language on purpose.

## Talking to your assistants (MCP)

Cortex runs a Model Context Protocol server so assistants can read your memory live instead of waiting for the next export. It speaks stdio (for Claude Desktop) or Streamable HTTP (for Poke and anything else that can reach it).

Some of the tools an assistant can call:

- `cortex_get_context` / `cortex_get_workspace` — the current workspace plus related background memories.
- `cortex_search_memories` / `cortex_search_background` — search by keyword or category.
- `cortex_get_relevant_memories` / `cortex_answer_personal_question` — answer a specific personal question from stored facts.
- `cortex_hold_in_mind` / `cortex_suppress` / `cortex_release` — pin, hide, or unpin a memory.
- `cortex_log_signal` / `cortex_log_context` / `cortex_save_conversation` — feed activity and new context back in.

## What's real, and what isn't yet

Working today:

- Imports from ChatGPT, Claude.ai, Claude Code, and Granola, plus filesystem watchers for Claude Code, Granola, and your Downloads folder.
- Anthropic-powered extraction, categorization, deduplication, and conflict detection.
- Review queue, memory library, quick edits, graph view, and the workspace (j-space) UI.
- Exports to ChatGPT custom instructions, Claude `CLAUDE.md`, JSON, and the Poke inbound API.
- MCP servers over stdio and HTTP.

Not there yet:

- Gmail, Google Drive, and Notion appear as connector cards, but the actual service scanning isn't built.
- Connector configuration is a UI/API preview, not a durable background sync system.

## Stack

Next.js 16 (App Router), TypeScript, Prisma 7 on SQLite via `better-sqlite3`, Tailwind + shadcn/ui, Zod for every contract, and the Anthropic SDK for structured extraction. No cloud services — it's meant to run on your own machine.

## Setup

```bash
npm install
npm run db:migrate
npm run dev            # web UI on http://localhost:3000
```

Create a `.env`:

```bash
DATABASE_URL="file:../data/cortex.db"
ANTHROPIC_API_KEY="..."
POKE_API_KEY="..."     # only if you connect a Poke account in Settings
```

### Other commands

```bash
npm run build          # production build
npm run lint           # ESLint
npm test               # Vitest
npm run db:studio      # Prisma Studio
npm run mcp            # MCP server over stdio
npm run mcp:http       # MCP server over Streamable HTTP
npm run watch:claude   # watch ~/.claude for changes
npm run watch:granola
npm run watch:downloads
```

## Data

Everything lives under `data/`:

- `data/cortex.db` — sources, conversations, memories, workspace slots, review items, conflicts, activity, export logs, and categories.
- `data/uploads/` — the raw conversation exports you've imported.

## Good to know

- New memories stay pending until you approve them.
- Approving, editing, deleting, or quick-updating a memory triggers propagation to your connected tools.
- Sensitive memories are held back from ChatGPT, Claude, and Poke exports unless an exporter is explicitly called with `includeSensitive`.
- Custom categories are stored in the database and passed into every extraction run, so the model sorts new facts the way you do.
