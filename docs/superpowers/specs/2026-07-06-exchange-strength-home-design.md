# Cortex: Exchange Orchestrator, Memory Strength & Home Page

**Date:** 2026-07-06
**Status:** Approved

---

## Overview

Three coordinated improvements to Cortex:

1. **Exchange Orchestrator Agent** — a formal typed agent wrapping the bidirectional Claude↔Poke info exchange pipeline
2. **Memory Strength Scoring** — frequency × recency score (0–1) driving sort order and visual hierarchy in the memories list
3. **Home Page Redesign** — replace the current landing page with a true product explainer (not a dashboard)

---

## 1. Exchange Orchestrator Agent

### What it does
Wraps the existing ingest → dedup → commit → propagate pipeline in a single, formally-typed agent class with explicit Zod contracts. Makes the exchange flow testable in isolation and gives callers a structured result that includes what was filtered by policy.

### Location
`src/pipeline/agents/exchange-orchestrator.ts`

### Contracts (extend `src/contracts/exchange.ts`)

```ts
ExchangeOrchestratorInputSchema = z.object({
  origin: ExchangeOriginSchema,                 // "claude" | "poke" | "manual"
  facts: z.array(ExchangeFactSchema).min(1),
  topic: z.string().optional(),
  summary: z.string().optional(),
  propagate: z.boolean().default(true),
})

ExchangeOrchestratorOutputSchema = z.object({
  memoriesCreated: z.number(),
  referencesUpdated: z.number(),
  conflictsCreated: z.number(),
  reviewItemsCreated: z.number(),
  propagatedDestinations: z.array(z.object({
    type: z.string(),
    name: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  })),
  skippedCategories: z.array(z.string()),   // ← new: categories present in input facts that were blocked by at least one destination's exchange policy during propagation
})
```

### Implementation notes
- `ExchangeOrchestrator` is a class with a single `run(input)` method
- `exchange-ingest.ts` becomes a thin wrapper calling `new ExchangeOrchestrator().run(...)`
- `skippedCategories` is derived by diffing `facts` categories against what `filterMemoriesForDestination` passed through — computed before propagation
- Origin `"poke"` always adds `"poke"` to `skipDestinations` (no echo-back)

---

## 2. Memory Strength Scoring

### Formula
`strength = 0.6 * frequencyScore + 0.4 * recencyScore`

- `frequencyScore = log(refCount + 1) / log(MAX_REF + 1)` where `MAX_REF = 20` (scores saturate gracefully beyond that)
- `recencyScore = exp(-daysSinceLastRef / HALF_LIFE_DAYS)` where `HALF_LIFE_DAYS = 90`
- Output clamped to `[0, 1]`

### Location
`src/lib/memory-strength.ts` — pure function, no DB calls.

```ts
export function computeMemoryStrength(refCount: number, lastReferencedAt: Date): number
```

### API integration
`GET /api/memories` attaches `strength: number` to each memory in the response. No DB schema change — computed on read.

### Sort order
Default sort: `strength DESC`. Existing filters (category, search) layer on top of this sort.

---

## 3. Memory Card Visual Hierarchy

Tied to the `strength` score computed above.

### Heat bar
- Slim bar at bottom of each card, `h-1`, width = `strength * 100%`
- Color: `bg-muted` (0–0.4) → `bg-lime` (0.4–0.8) → `bg-amber-400` (0.8–1.0)
- Hover tooltip: `"Referenced 7x · Last seen Jun 12 · Strength 0.84"`

### Card weight
- `strength > 0.7`: border brightens to `border-lime/30`, content text becomes `font-medium`
- `strength < 0.1`: card gets `opacity-60` treatment (de-emphasized, not hidden)
- Default: no change from current styling

### Badge replacement
- Remove the plain `"referenced Nx"` badge and `"last [date]"` inline text from cards
- These values surface via the heat bar tooltip instead (cleaner card surface)

---

## 4. Home Page Redesign

### Route
`/` → `src/app/landing/page.tsx` (file stays, content replaced)

### Structure

**Hero**
- Headline: *"Your AI tools don't talk to each other. Cortex fixes that."*
- Subhead: *"Every conversation you have with Claude or Poke starts from scratch. Cortex syncs your context across tools — automatically."*
- CTA: "Open Dashboard →" (links to `/dashboard`)

**Problem section** — 3 cards:
1. "You told Claude your dog's name is Brian. Poke has no idea."
2. "Every new session, you start over. Your AI tools have no memory of each other."
3. "The same facts live in 3 different tools, out of sync."

**How it works** — 3-step flow (Ingest → Curate → Sync):
1. **Ingest** — Cortex reads from Claude Code, Claude.ai exports, and Poke
2. **Curate** — Review and approve memories, resolve conflicts
3. **Sync** — Push to all connected platforms with category-based policies

**Memory strength callout**
- Short section explaining: facts mentioned once are stored, but facts mentioned repeatedly across time earn higher strength and surface first when your AI tools pull context

**Live stats strip** (from `/api/status`)
- X memories active · Connected to Claude + Poke · Last sync [time]

### What it is NOT
- No file upload widget
- No dashboard metrics
- No action buttons beyond the CTA
- No sync controls

---

## 5. Tests

### New: `__tests__/lib/memory-strength.test.ts`
- `computeMemoryStrength(1, now)` → near 1.0
- `computeMemoryStrength(1, 365 days ago)` → near 0
- `computeMemoryStrength(10, now)` > `computeMemoryStrength(1, now)`
- Output always in [0, 1]
- `computeMemoryStrength(0, now)` → valid (no crash)

### New: `__tests__/pipeline/exchange-orchestrator.test.ts`
- Valid input passes Zod schema validation
- Output passes `ExchangeOrchestratorOutputSchema` validation
- When policy blocks `"education_career"` for poke, `skippedCategories` includes it
- Origin `"poke"` → poke not in `propagatedDestinations`
- Uses mocked `prisma` and `propagateToAllPlatforms`

### Extend: `__tests__/services/exchange-policy.test.ts`
- `"don't send school memories to Poke"` → `mode: "block"`, `blockedCategories` includes `"education_career"`
- `"only share projects with Claude"` → `mode: "allow_only"`, `allowedCategories` includes `"projects"`

---

## Implementation Order (for agent swarm)

These tasks are independent and can be parallelized:

1. **Agent A** — `memory-strength.ts` + `__tests__/lib/memory-strength.test.ts`
2. **Agent B** — `ExchangeOrchestrator` class + Zod contracts + `exchange-ingest.ts` refactor
3. **Agent C** — Memory card UI (heat bar, visual hierarchy, sort order, API `strength` field)
4. **Agent D** — Home page redesign
5. **Agent E** — Tests: exchange-orchestrator + exchange-policy extensions

Agent A must complete before Agent C (C depends on the strength function).
Agent B must complete before Agent E (E tests the orchestrator).
All others are independent.

---

## Files Changed

| File | Action |
|------|--------|
| `src/lib/memory-strength.ts` | Create |
| `src/contracts/exchange.ts` | Extend (add orchestrator schemas) |
| `src/pipeline/agents/exchange-orchestrator.ts` | Create |
| `src/services/exchange-ingest.ts` | Refactor (delegate to orchestrator) |
| `src/app/api/memories/route.ts` | Edit (attach strength, sort by strength) |
| `src/app/memories/page.tsx` | Edit (heat bar, card weight, sort) |
| `src/app/landing/page.tsx` | Rewrite |
| `__tests__/lib/memory-strength.test.ts` | Create |
| `__tests__/pipeline/exchange-orchestrator.test.ts` | Create |
| `__tests__/services/exchange-policy.test.ts` | Extend |
