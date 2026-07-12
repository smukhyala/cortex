# J-Space Native: Workspace-First Cortex Redesign

**Date:** 2026-07-12
**Status:** Approved
**Reference:** [Verbalizable Representations Form a Global Workspace in Language Models](https://transformer-circuits.pub/2026/workspace/index.html) (Gurnee et al., Anthropic, 2026)

## Motivation

Cortex currently operates as a memory vault — extract facts from AI conversations, store them, search them, export them. This pattern converges with Obsidian and every other note/knowledge-management tool. The J-Space paper provides a sharper conceptual frame: instead of storing everything and searching later, Cortex should maintain a small, dynamic, capacity-constrained **workspace** that represents what the user is actively thinking about, and broadcast it consistently to all connected AI tools.

The paper demonstrates that large language models maintain a privileged subset of representations (the "J-space") that are:
- **Capacity-constrained** (~10-25 active concepts simultaneously)
- **Verbalizable** (available for report/broadcast)
- **Flexibly deployable** (used across diverse downstream operations)
- **Subject to directed control** (can be foregrounded or suppressed on instruction)
- **Distinct from background processing** (grammar, syntax, routine operations happen outside the workspace)

Cortex adopts this architecture for human-AI context management.

---

## Core Conceptual Model

Three tiers of representation, mapped from the paper:

### 1. Background Memory (non-J-space)

Durable facts that shape behavior but are not actively surfaced. The user's name, school, tool preferences, completed projects — always true, always available if explicitly queried, but never broadcast proactively. Analogous to how transformers handle grammar and syntax outside the workspace: functional, important, but not occupying workspace capacity.

- Stored in DB as they are today (the existing Memory table)
- Served only on explicit deep queries via `cortex_search_background`
- No decay, no loading score
- The vast majority of memories live here

### 2. Workspace Slots (J-space)

A **hard-capped set of 20 slots** representing what the user is currently thinking about. Each slot holds a reference to a memory (or a synthesized concept derived from a coherence cluster of memories) plus workspace metadata.

Properties per slot:
- **Loading score** (0.0-1.0): How strongly this concept is loaded. Analogous to "workspace loading" in the paper. Higher loading = more available for flexible downstream use.
- **Decay**: Loading decreases over time. Default half-life of **7 days** (decayRate ~0.0000688 per minute, derived from ln(2)/10080). A concept untouched for ~2 weeks naturally evicts.
- **Source signal**: What caused loading — activity inference, explicit pin, MCP query pattern, or pipeline sync.
- **Concept label**: Human-readable name for the slot (e.g., "cold-start research", "Oasis BD push").
- **Activation timestamp**: Last time this slot was reinforced by any signal.

Eviction threshold: loading < 0.15. When a slot drops below this, the memory returns to background. When all 20 slots are full and a new concept needs loading, the lowest-loading slot gets evicted.

### 3. J-Lens (Readout/Inference Engine)

A service that observes user activity across AI tools and infers what should be in the workspace. It does not store memories — it decides **which memories are workspace-active** and at **what loading level**.

Analogous to the paper's Jacobian lens: computing the linearized effect of activations on outputs to determine what concepts are "poised to be verbalized."

### 4. Directed Modulation

Users (and their AI tools) can explicitly control the workspace:

- **Hold in mind**: Pin a concept to a workspace slot. Loading locked at 1.0, no decay. Parallels the paper's finding that models can be instructed to foreground concepts.
- **Suppress**: Force-evict a concept and block re-loading for a configurable duration (default 24h). Parallels the paper's suppression experiments.
- **Release**: Unpin a held concept, resuming normal decay.
- **Manual load**: Explicitly promote a background memory into the workspace.

---

## Data Model Changes

### Memory table additions

Two new columns on the existing Memory model:

```prisma
tier            String    @default("background")  // "background" | "workspace"
suppressedUntil DateTime?                          // null = not suppressed
```

`tier` is a denormalized snapshot reflecting whether this memory currently occupies a workspace slot. Source of truth is the WorkspaceSlot table. Updated on load/evict.

### New: WorkspaceSlot model

```prisma
model WorkspaceSlot {
  id              String    @id @default(cuid())
  position        Int       @unique              // 0-19 (the 20 slots)
  memoryId        String?                        // FK to Memory, null = empty slot
  memory          Memory?   @relation(fields: [memoryId], references: [id])
  conceptLabel    String?                        // synthesized label for cluster slots
  loading         Float     @default(0.0)        // 0.0-1.0
  decayRate       Float     @default(0.0000688)  // ln(2)/10080 — loading units per minute (~7-day half-life)
  pinned          Boolean   @default(false)      // directed modulation: hold in mind
  sourceSignal    String    @default("activity") // "activity" | "explicit" | "query" | "sync"
  activatedAt     DateTime  @default(now())      // last reinforcement
  loadedAt        DateTime  @default(now())      // when first loaded into this slot
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}
```

20 rows created at initialization. Empty slots have `memoryId: null, loading: 0`. The capacity constraint is physical — slot 21 cannot exist.

### New: ActivitySignal model

```prisma
model ActivitySignal {
  id          String   @id @default(cuid())
  type        String                          // "mcp_query" | "conversation_sync" | "file_change" | "manual"
  keywords    String                          // extracted keywords (JSON array stored as string)
  categories  String                          // touched categories (JSON array stored as string)
  sourceType  String?                         // which AI tool generated this
  timestamp   DateTime @default(now())
  processed   Boolean  @default(false)        // has J-Lens consumed this?
  createdAt   DateTime @default(now())
}
```

Raw input for the J-Lens. Every MCP call, sync run, and file watch trigger logs a signal.

### Unchanged models

Source, Conversation, Conflict, ReviewItem, SyncRun, Category, Folder, MemoryFolder, ActivityLog, ExportLog — all unchanged.

### Migration path

1. Add `tier` and `suppressedUntil` columns to Memory (default values, non-breaking)
2. Create WorkspaceSlot table, seed 20 empty rows (positions 0-19)
3. Create ActivitySignal table
4. Run J-Lens cold start against last 7 days of SyncRun data and MCP logs to seed initial workspace

---

## J-Lens Service

### Scoring function

```
score(memory, signals) =
    0.40 * keywordOverlap(memory.content, signals.keywords)
  + 0.25 * categoryMatch(memory.category, signals.categories)
  + 0.20 * recencyBoost(memory.lastReferencedAt)       // exponential decay, 7-day half-life
  + 0.15 * coOccurrence(memory, currentWorkspaceSlots)  // from coherence clusters
```

Weights are configurable via settings. Starting point for tuning, not final.

### Operating modes

**Batch mode** — runs after pipeline commit, on scheduled tick (every 6h):
1. Consume all unprocessed ActivitySignal rows
2. Extract topic vector: keywords, categories, project names from signals
3. Score every background memory against the topic vector
4. Apply decay to all current workspace slots: `loading = loading * e^(-decayRate * minutesSinceActivation)`
5. Compare top-scoring background memories against lowest-loading workspace slots
6. If a background memory scores higher than the weakest slot, evict and replace
7. Mark consumed signals as `processed: true`

**Inline mode** — runs on MCP query:
1. Take query keywords
2. Boost loading on matching workspace slots (+0.2, capped at 1.0), reset `activatedAt`
3. If query implies a concept not currently loaded, run mini scoring pass on matching-category memories only
4. Load if score beats weakest slot

**Immediate mode** — runs on directed modulation:
- Hold/suppress/release/manual load bypass scoring entirely. Direct slot manipulation.

### Concept synthesis

When multiple memories in the same coherence cluster are workspace-relevant, J-Lens loads them as **one slot** with a synthesized concept label. The `memoryId` points to the highest-confidence memory in the cluster (the anchor). When MCP serves this slot, it pulls all memories in the cluster. One slot, multiple memories. This is how density works without burning capacity.

### Decay mechanics

- Default half-life: **7 days**
- Pinned slots: loading locked at 1.0, no decay
- Reinforcement: any matching activity resets `activatedAt` and bumps loading by +0.2 (capped at 1.0)
- Eviction threshold: loading < 0.15
- On eviction: memory `tier` flips to "background", slot becomes empty or filled by next-highest candidate
- Scheduled decay tick runs every 6 hours even without activity

### Cold start

First run with empty workspace and no activity history: J-Lens seeds workspace from the 20 highest-confidence, most-recently-referenced memories across all categories. Immediate usable workspace.

### Error handling

If J-Lens fails (LLM timeout, scoring error), workspace stays as-is. Decay still applies via scheduled tick. No data loss — worst case is a stale workspace for a few hours. Workspace is never empty unless truly no memories exist.

---

## MCP Serving

### New tool interface

Replaces the current 10 category-specific tools with a workspace-first model.

**Primary: `cortex_get_workspace`**
Returns the full workspace state. Default context injection for any connected AI tool.

Response shape:
```json
{
  "slots": [
    {
      "position": 0,
      "conceptLabel": "cold-start research",
      "loading": 0.92,
      "pinned": false,
      "sourceSignal": "activity",
      "activatedAt": "2026-07-12T10:30:00Z",
      "memories": [
        "Working on cold-start prompt selection using multi-armed bandits and e-processes on WebArena",
        "Uses WebArena Gmail tasks as evaluation environment",
        "Collaborates with Ian Waudby-Smith on sequential LLM evaluation"
      ]
    }
  ],
  "capacity": { "used": 14, "total": 20 },
  "lastUpdated": "2026-07-12T14:00:00Z"
}
```

**Secondary: `cortex_search_background(query)`**
Keyword/category search across all background memories. For when a tool needs something not in the workspace. Explicitly positioned as reaching outside the workspace.

**Modulation tools:**
- `cortex_hold_in_mind(concept: string)` — Find matching memories, load into a slot, pin at 1.0
- `cortex_suppress(concept: string, duration?: string)` — Force-evict, block re-loading (default 24h)
- `cortex_release(concept: string)` — Unpin a held concept, resume decay

**Activity logging:**
- `cortex_log_signal(keywords: string[], categories?: string[], source?: string)` — Feed activity signals into J-Lens. Replaces current `cortex_log_context`.

### Broadcast consistency

All tools see the same workspace. Claude Code, Poke, ChatGPT — identical slots, identical loading scores. This is the "global broadcast" from the paper.

### Deprecated tools

The 10 category-specific tools (`cortex_get_identity_profile`, `cortex_get_education_career`, etc.) are removed. Replaced by workspace slots (active concepts) and `cortex_search_background` (everything else). Category taxonomy still exists for memory classification — it just doesn't drive serving.

---

## Exporter Changes

Propagation now exports **workspace slots**, not the full memory library.

### Claude Code exporter
CLAUDE.md gets a `## Current Workspace` section (inside cortex markers) with workspace slot contents instead of the full categorized memory dump. Background memories are not exported unless exchange policy explicitly includes them.

### ChatGPT exporter
Custom instructions text contains workspace concepts only. Focused, capacity-constrained context instead of everything.

### Poke exporter
Webhook payload contains workspace slots with loading scores. Same content as other tools.

### Exchange policies
Still apply. Users can configure per-destination filtering. The difference is the default set being exported is the workspace, not all memories.

---

## UI Changes

### Primary view: Workspace Dashboard (replaces /memories as default)

**Slot Ring**: Circular visualization of all 20 slots. Occupied slots are filled nodes sized by loading score. Empty slots are dim outlines. Pinned slots show a lock/anchor icon. Decaying slots show subtle fade.

Each slot node displays:
- Concept label
- Loading bar (0.0-1.0)
- Time since last activation
- Source signal indicator (inferred / pinned / query-reinforced)

Slot interactions:
- Click: expand to show all memories in the cluster
- Right-click / long-press: context menu with Hold in Mind, Suppress (duration picker: 1h/24h/1w/indefinite), Release, Evict

**Decay Timeline**: Horizontal strip below the ring showing projected evictions with time estimates. "cold-start research evicts in ~5 days" / "Oasis BD evicts in ~2 days". Surfaces what's about to leave so the user can pin if needed.

### Secondary view: Background Library (current /memories, repositioned)

The existing memories page, essentially unchanged — searchable, filterable list of all memories. Repositioned as "everything you know" vs. the workspace "what you're thinking about." Any memory can be loaded to workspace via a "Load to workspace" action.

### Review Queue

Unchanged mechanics. One addition: after approval, if J-Lens scores the memory high enough, an indicator shows "will load to workspace" vs. "will stay in background."

### Settings additions

- Workspace capacity: adjustable 10-30, default 20
- Default half-life: adjustable 1-30 days, default 7 days
- Eviction threshold: adjustable, default 0.15
- Auto-load on approval: toggle for high-scoring new memories

### Design language

Targeting maze.co/ai aesthetic — warm cream palette, soft shadows, rounded elements. The slot ring is the hero element. The shift from card grid to workspace ring + decay timeline is the visual differentiator from note-taking apps.

---

## Pipeline Integration

### Changes to existing pipeline

**Commit stage only**: After writing memories to DB, commit calls J-Lens batch mode. New memories plus conversation topics become activity signals. J-Lens scores them and decides workspace loading. Memories that don't make the cut land as `tier: "background"`.

No changes to:
- Parsers (ChatGPT, Claude, Granola, Poke)
- Extraction prompts or LLM calls
- Deduplication logic
- Review queue mechanics
- Conflict resolution

### J-Lens trigger map

| Trigger | Mode | Effect |
|---|---|---|
| MCP query (`cortex_get_workspace`) | Inline | Decay current slots, return workspace |
| MCP signal (`cortex_log_signal`) | Inline | Boost matching slots, check for new loads |
| Pipeline commit completes | Batch | Full scoring pass, evict/load decisions |
| Directed modulation (hold/suppress/release) | Immediate | Direct slot manipulation |
| Scheduled tick (every 6 hours) | Batch | Decay pass, evict dead slots |

### End-to-end example flow

1. User talks to Claude about WebArena bugs for an hour
2. Claude calls `cortex_get_workspace` → gets current slots
3. Claude calls `cortex_log_signal` → keywords: ["webarena", "bug", "adapter"]
4. J-Lens inline: boosts "cold-start research" slot loading 0.6 → 0.8
5. Conversation saved, pipeline runs ingest → extract → dedup → commit
6. Commit writes 3 new memories, triggers J-Lens batch
7. J-Lens decays all slots, scores new memories, evicts low-loading slot, loads high-scoring new concept
8. User opens Poke next — calls `cortex_get_workspace` → sees same workspace state, minus evicted slot, plus new concept
9. User says "hold Ian meeting prep in mind" → `cortex_hold_in_mind("Ian meeting prep")` → pinned slot at 1.0
10. All tools now see the Ian meeting slot until released

### Error resilience

- J-Lens failure: workspace unchanged, decay continues via scheduled tick
- All slots pinned + new concept: "workspace full" indicator in UI, concept queued
- No data loss in any failure mode — memories always safe in DB, workspace is a view layer

---

## What This Is NOT

- **Not Obsidian**: No vault, no graph of everything, no manual organization required. 20 slots, automatic loading, natural decay.
- **Not a note-taking app**: You don't write to Cortex. It reads your activity and infers your workspace.
- **Not a RAG system**: Not retrieving relevant chunks per query. Broadcasting a consistent, capacity-constrained workspace to all tools simultaneously.
- **Not a second brain**: It's a first brain's working memory — small, focused, dynamic, lossy by design.

---

## Success Criteria

1. Opening Cortex shows a workspace ring, not a memory list
2. All connected AI tools receive the same workspace state
3. Concepts naturally enter and leave the workspace based on activity without manual curation
4. User can override with hold/suppress/release
5. Workspace capacity constraint (20 slots) is enforced and felt as a feature
6. Background memories remain accessible but don't clutter the workspace
7. Existing pipeline (ingest/extract/dedup/commit) continues working unchanged
