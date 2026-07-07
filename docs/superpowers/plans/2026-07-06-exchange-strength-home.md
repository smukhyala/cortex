# Exchange Orchestrator, Memory Strength & Home Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a formal Exchange Orchestrator agent with Zod contracts, a memory strength score (frequency × recency) that drives sort order and visual hierarchy in the memories list, and a redesigned Home page that explains the product.

**Architecture:** Memory strength is a pure function in `src/lib/memory-strength.ts` consumed by the API route and UI. The Exchange Orchestrator wraps the existing dedup→commit→propagate pipeline with Zod-validated input/output and a new `skippedCategories` field. The Home page replaces the current landing page content with a static explainer.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod v4, Prisma v7 + better-sqlite3, shadcn/ui (Base UI), Tailwind CSS, Vitest

## Global Constraints

- Zod v4: use `z.toJSONSchema()`, never import `zod-to-json-schema`
- shadcn/ui: use `render` prop, NOT `asChild`
- Prisma v7: constructor requires `PrismaBetterSqlite3` adapter + options object
- Tests live in `__tests__/` mirroring `src/` structure, use Vitest
- Run tests with: `npm test` (or `npx vitest run <path>` for individual files)
- No background workers — pipeline runs synchronously
- Do not add error handling for scenarios that cannot happen; do not add docstrings to unchanged code

---

## Task 1: Memory Strength Function + Unit Tests

**Files:**
- Create: `src/lib/memory-strength.ts`
- Create: `__tests__/lib/memory-strength.test.ts`

**Interfaces:**
- Produces: `computeMemoryStrength(refCount: number, lastReferencedAt: Date): number` — used by Tasks 3 and 4

---

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/lib/memory-strength.test.ts
import { describe, expect, it } from "vitest";
import { computeMemoryStrength } from "@/lib/memory-strength";

describe("computeMemoryStrength", () => {
  it("returns a score in (0.4, 1] for a memory referenced today", () => {
    const strength = computeMemoryStrength(1, new Date());
    expect(strength).toBeGreaterThan(0.4);
    expect(strength).toBeLessThanOrEqual(1.0);
  });

  it("returns a low score for a memory from 365 days ago with 1 reference", () => {
    const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const strength = computeMemoryStrength(1, oldDate);
    expect(strength).toBeLessThan(0.2);
  });

  it("10 references scores higher than 1 reference for same date", () => {
    const now = new Date();
    expect(computeMemoryStrength(10, now)).toBeGreaterThan(computeMemoryStrength(1, now));
  });

  it("always returns a value in [0, 1]", () => {
    expect(computeMemoryStrength(0, new Date())).toBeGreaterThanOrEqual(0);
    expect(computeMemoryStrength(0, new Date())).toBeLessThanOrEqual(1);
    expect(computeMemoryStrength(100, new Date())).toBeLessThanOrEqual(1);
    expect(computeMemoryStrength(1, new Date(0))).toBeGreaterThanOrEqual(0);
  });

  it("does not crash with refCount 0", () => {
    expect(() => computeMemoryStrength(0, new Date())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run __tests__/lib/memory-strength.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/memory-strength'`

- [ ] **Step 3: Implement the function**

```typescript
// src/lib/memory-strength.ts
const MAX_REF = 20;
const HALF_LIFE_DAYS = 90;

export function computeMemoryStrength(refCount: number, lastReferencedAt: Date): number {
  const frequencyScore = Math.log(refCount + 1) / Math.log(MAX_REF + 1);
  const daysSince = (Date.now() - lastReferencedAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.exp(-daysSince / HALF_LIFE_DAYS);
  return Math.max(0, Math.min(1, 0.6 * frequencyScore + 0.4 * recencyScore));
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run __tests__/lib/memory-strength.test.ts
```
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory-strength.ts __tests__/lib/memory-strength.test.ts
git commit -m "feat: add memory strength scoring function (frequency × recency)"
```

---

## Task 2: Exchange Orchestrator Agent + Contract Extensions

**Files:**
- Modify: `src/contracts/exchange.ts` — add `ExchangeOrchestratorInputSchema`, `ExchangeOrchestratorOutputSchema`
- Create: `src/pipeline/agents/exchange-orchestrator.ts`
- Modify: `src/services/exchange-ingest.ts` — delegate to orchestrator

**Interfaces:**
- Consumes: existing `ExchangeOriginSchema`, `ExchangeFactSchema` from `src/contracts/exchange.ts`; `deduplicateMemories` from `src/pipeline/deduplicate`; `commit` from `src/pipeline/commit`; `propagateToAllPlatforms` from `src/services/propagate`; `getExchangePolicy`, `filterMemoriesForDestination` from `src/services/exchange-policy`; `prisma` from `src/lib/db`
- Produces: `ExchangeOrchestrator` class with `run(input: ExchangeOrchestratorInput): Promise<ExchangeOrchestratorOutput>`; `ExchangeOrchestratorInputSchema`, `ExchangeOrchestratorOutputSchema` Zod schemas exported from `src/contracts/exchange.ts`

---

- [ ] **Step 1: Extend contracts**

Add to the bottom of `src/contracts/exchange.ts`:

```typescript
export const ExchangeOrchestratorInputSchema = z.object({
  origin: ExchangeOriginSchema,
  facts: z.array(ExchangeFactSchema).min(1),
  topic: z.string().optional(),
  summary: z.string().optional(),
  propagate: z.boolean().default(true),
});
export type ExchangeOrchestratorInput = z.infer<typeof ExchangeOrchestratorInputSchema>;

export const ExchangeOrchestratorOutputSchema = z.object({
  sourceId: z.string(),
  memoriesCreated: z.number(),
  referencesUpdated: z.number(),
  conflictsCreated: z.number(),
  reviewItemsCreated: z.number(),
  propagatedDestinations: z.array(
    z.object({
      type: z.string(),
      name: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })
  ),
  skippedCategories: z.array(z.string()),
});
export type ExchangeOrchestratorOutput = z.infer<typeof ExchangeOrchestratorOutputSchema>;
```

- [ ] **Step 2: Create the orchestrator**

```typescript
// src/pipeline/agents/exchange-orchestrator.ts
import { prisma } from "@/lib/db";
import { z } from "zod";
import {
  ExchangeOrchestratorInputSchema,
  ExchangeOrchestratorOutputSchema,
  type ExchangeOrchestratorInput,
  type ExchangeOrchestratorOutput,
  type ExchangeOrigin,
  type ExchangeFact,
  type ExchangeDestination,
} from "@/contracts/exchange";
import { MEMORY_CATEGORIES, type MemoryCategory } from "@/contracts/memory";
import type { ExtractedMemory } from "@/contracts/pipeline";
import { deduplicateMemories } from "@/pipeline/deduplicate";
import { commit } from "@/pipeline/commit";
import { propagateToAllPlatforms } from "@/services/propagate";
import { getExchangePolicy, filterMemoriesForDestination } from "@/services/exchange-policy";

const ORIGIN_SOURCE: Record<ExchangeOrigin, { type: string; name: string }> = {
  claude: { type: "claude_desktop", name: "Claude (Exchange)" },
  poke: { type: "poke", name: "Poke (Exchange)" },
  manual: { type: "manual", name: "Cortex Manual" },
};

const TOPIC_TO_CATEGORY: Record<string, MemoryCategory> = {
  identity: "identity", personal: "identity", profile: "identity", background: "identity",
  education: "education_career", school: "education_career", career: "education_career", work: "education_career",
  project: "projects", startup: "projects",
  research: "research", interest: "research",
  preference: "preferences", favorite: "preferences", style: "preferences",
  goal: "goals", plan: "goals",
  relationship: "relationships", people: "relationships",
  writing: "writing_voice", voice: "writing_voice",
  workflow: "workflows", tool: "workflows",
  temporary: "temporary", current: "temporary",
};

function inferCategory(text: string | undefined): MemoryCategory {
  const lower = (text || "").toLowerCase();
  for (const [keyword, category] of Object.entries(TOPIC_TO_CATEGORY)) {
    if (lower.includes(keyword)) return category;
  }
  return "identity";
}

function normalizeCategory(fact: ExchangeFact, topic?: string): string {
  if (fact.category && fact.category.length > 0) return fact.category;
  const inferred = inferCategory(`${topic || ""} ${fact.content}`);
  return MEMORY_CATEGORIES.includes(inferred) ? inferred : "identity";
}

async function getOrCreateExchangeSource(origin: ExchangeOrigin): Promise<string> {
  const cfg = ORIGIN_SOURCE[origin];
  const existing = await prisma.source.findFirst({
    where: { type: cfg.type, name: cfg.name },
    select: { id: true },
  });
  if (existing) return existing.id;
  const source = await prisma.source.create({
    data: { type: cfg.type, name: cfg.name, status: "active", config: JSON.stringify({ exchangeOrigin: origin }) },
  });
  return source.id;
}

function buildPokeMessage(origin: ExchangeOrigin, facts: ExtractedMemory[]): string {
  const label = origin === "claude" ? "Claude" : origin === "poke" ? "Poke" : "Cortex";
  return [
    `Cortex exchange update from ${label}.`,
    "Please remember these user facts and use them in future answers automatically:",
    ...facts.map((f) => `- ${f.content}`),
  ].join("\n");
}

async function computeSkippedCategories(
  facts: ExchangeFact[],
  skipOriginDestinations: string[],
  topic?: string
): Promise<string[]> {
  const inputCategories = Array.from(
    new Set(facts.map((f) => normalizeCategory(f, topic)))
  );
  const sources = await prisma.source.findMany({ where: { status: "active" } });
  const skipped = new Set<string>();
  const DESTINATION_TYPES = new Set<ExchangeDestination>(["claude_code", "poke"]);

  for (const source of sources) {
    const destType = source.type as ExchangeDestination;
    if (!DESTINATION_TYPES.has(destType)) continue;
    if (skipOriginDestinations.includes(source.type)) continue;
    const policy = getExchangePolicy(source.config, destType);
    for (const cat of inputCategories) {
      if (filterMemoriesForDestination([{ category: cat, sensitive: false }], policy).length === 0) {
        skipped.add(cat);
      }
    }
  }

  return Array.from(skipped);
}

export class ExchangeOrchestrator {
  async run(rawInput: ExchangeOrchestratorInput): Promise<ExchangeOrchestratorOutput> {
    const input = ExchangeOrchestratorInputSchema.parse(rawInput);
    const sourceId = await getOrCreateExchangeSource(input.origin);

    const extractedMemories: ExtractedMemory[] = input.facts.map((fact) => ({
      content: fact.content,
      subject: "user",
      category: normalizeCategory(fact, input.topic),
      confidence: 0.9,
      verbatimQuote: fact.content,
      temporality: "durable",
      sensitive: fact.sensitive ?? false,
      isCorrection: false,
    }));

    let clean = extractedMemories;
    let conflicts: Awaited<ReturnType<typeof deduplicateMemories>>["output"]["conflicts"] = [];
    let duplicateReferences: Awaited<ReturnType<typeof deduplicateMemories>>["output"]["duplicateReferences"] = [];
    let duplicatesDropped = 0;

    try {
      const dedupResult = await deduplicateMemories(extractedMemories);
      clean = dedupResult.output.clean;
      conflicts = dedupResult.output.conflicts;
      duplicateReferences = dedupResult.output.duplicateReferences;
      duplicatesDropped = dedupResult.output.duplicatesDropped;
    } catch (error) {
      console.error("Exchange dedup failed, committing all facts as active:", error);
    }

    const commitResult = await commit({
      sourceId,
      clean,
      conflicts,
      duplicateReferences,
      initialStatus: "active",
      conversationMap: new Map(),
    });

    await prisma.activityLog.create({
      data: {
        action: "exchange_ingest",
        summary: `${input.origin} shared ${input.facts.length} fact(s) with Cortex`,
        details: JSON.stringify({
          origin: input.origin,
          topic: input.topic,
          summary: input.summary,
          factsReceived: input.facts.length,
          memoriesCreated: commitResult.memoriesCreated,
          duplicatesDropped,
          referencesUpdated: commitResult.referencesUpdated,
          conflictsCreated: commitResult.conflictsCreated,
        }),
      },
    });

    const skipDestinations = input.origin === "poke" ? ["poke"] : [];
    const skippedCategories = await computeSkippedCategories(input.facts, skipDestinations, input.topic);

    let propagatedDestinations: ExchangeOrchestratorOutput["propagatedDestinations"] = [];
    if (input.propagate) {
      const propagation = await propagateToAllPlatforms({
        pokeMessage: buildPokeMessage(input.origin, extractedMemories),
        pokeRunId: `cortex-exchange-${input.origin}-${Date.now()}`,
        pokeMetadata: {
          type: "exchange_ingest",
          origin: input.origin,
          categories: Array.from(new Set(extractedMemories.map((m) => m.category))),
        },
        skipDestinations,
      });
      propagatedDestinations = propagation.destinations;
    }

    const output: ExchangeOrchestratorOutput = {
      sourceId,
      memoriesCreated: commitResult.memoriesCreated,
      referencesUpdated: commitResult.referencesUpdated,
      conflictsCreated: commitResult.conflictsCreated,
      reviewItemsCreated: commitResult.reviewItemsCreated,
      propagatedDestinations,
      skippedCategories,
    };

    return ExchangeOrchestratorOutputSchema.parse(output);
  }
}
```

- [ ] **Step 3: Refactor exchange-ingest.ts to delegate to orchestrator**

Replace the entire contents of `src/services/exchange-ingest.ts`:

```typescript
// src/services/exchange-ingest.ts
import { ExchangeOrchestrator } from "@/pipeline/agents/exchange-orchestrator";
import type { ExchangeFact, ExchangeOrigin } from "@/contracts/exchange";

interface ExchangeIngestParams {
  origin: ExchangeOrigin;
  facts: ExchangeFact[];
  topic?: string;
  summary?: string;
  propagate?: boolean;
}

export interface ExchangeIngestResult {
  sourceId: string;
  memoriesCreated: number;
  referencesUpdated: number;
  conflictsCreated: number;
  reviewItemsCreated: number;
  propagatedDestinations: Array<{ type: string; name: string; success: boolean; error?: string }>;
}

export async function ingestExchangeFacts(params: ExchangeIngestParams): Promise<ExchangeIngestResult> {
  const orchestrator = new ExchangeOrchestrator();
  const result = await orchestrator.run({
    origin: params.origin,
    facts: params.facts,
    topic: params.topic,
    summary: params.summary,
    propagate: params.propagate ?? true,
  });
  return {
    sourceId: result.sourceId,
    memoriesCreated: result.memoriesCreated,
    referencesUpdated: result.referencesUpdated,
    conflictsCreated: result.conflictsCreated,
    reviewItemsCreated: result.reviewItemsCreated,
    propagatedDestinations: result.propagatedDestinations,
  };
}
```

- [ ] **Step 4: Run existing exchange-ingest tests to verify nothing broke**

```bash
npx vitest run __tests__/services/exchange-ingest.test.ts
```
Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/contracts/exchange.ts src/pipeline/agents/exchange-orchestrator.ts src/services/exchange-ingest.ts
git commit -m "feat: add ExchangeOrchestrator agent with Zod contracts and skippedCategories"
```

---

## Task 3: Memories API Strength Field + Sort (depends on Task 1)

**Files:**
- Modify: `src/app/api/memories/route.ts`

**Interfaces:**
- Consumes: `computeMemoryStrength(refCount: number, lastReferencedAt: Date): number` from `src/lib/memory-strength.ts`
- Produces: `GET /api/memories` response now includes `strength: number` on each memory, sorted `strength DESC`

---

- [ ] **Step 1: Update the GET handler in `src/app/api/memories/route.ts`**

Replace the `GET` function:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeMemoryStrength } from "@/lib/memory-strength";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const status = searchParams.get("status") || "active";
  const search = searchParams.get("q");

  const where: Record<string, unknown> = { status };
  if (category) where.category = category;
  if (search) where.content = { contains: search };

  const memories = await prisma.memory.findMany({
    where,
    include: {
      source: { select: { name: true, type: true, config: true } },
      conversation: { select: { title: true, externalId: true } },
    },
  });

  const memoriesWithStrength = memories
    .map((m) => ({
      ...m,
      strength: computeMemoryStrength(m.referenceCount, new Date(m.lastReferencedAt)),
    }))
    .sort((a, b) => b.strength - a.strength);

  return NextResponse.json(memoriesWithStrength);
}
```

Leave `POST` unchanged.

- [ ] **Step 2: Verify the app compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/memories/route.ts
git commit -m "feat: attach strength score to memories API response, sort by strength DESC"
```

---

## Task 4: Memory Card Visual Hierarchy (depends on Task 3)

**Files:**
- Modify: `src/app/memories/page.tsx`

**Interfaces:**
- Consumes: `strength: number` on each `Memory` object from `GET /api/memories`

---

- [ ] **Step 1: Add `strength` to the `Memory` interface and add helper functions**

In `src/app/memories/page.tsx`, update the `Memory` interface:

```typescript
interface Memory {
  id: string;
  content: string;
  subject: string;
  category: string;
  confidence: number;
  temporality: string;
  sensitive: boolean;
  referenceCount: number;
  lastReferencedAt: string;
  strength: number;  // ← add this
  createdAt: string;
  source: { name: string; type: string; config: string };
  conversation: { title: string; externalId: string } | null;
}
```

Add these helper functions after the `formatLastReferenced` function:

```typescript
function strengthBarColor(strength: number): string {
  if (strength >= 0.8) return "bg-amber-400";
  if (strength >= 0.4) return "bg-lime";
  return "bg-muted-foreground/20";
}

function strengthTooltip(memory: Memory): string {
  const date = new Date(memory.lastReferencedAt);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `Referenced ${memory.referenceCount}x · Last seen ${dateStr} · Strength ${memory.strength.toFixed(2)}`;
}
```

- [ ] **Step 2: Remove `Clock` from the imports**

Change this import line:

```typescript
import { Search, Download, Archive, Brain, Pencil, Sparkles, GitMerge, X, Zap } from "lucide-react";
```

(Remove `Clock` from the lucide-react import)

- [ ] **Step 3: Update each memory card**

Replace the memory card JSX. Find the block starting at `filtered.map((memory) => (` and replace the card:

```tsx
filtered.map((memory) => (
  <div
    key={memory.id}
    className={`maze-card group relative overflow-hidden ${
      memory.strength < 0.1 ? "opacity-60" : ""
    } ${memory.strength > 0.7 ? "border-lime/30" : ""}`}
  >
    <div className="flex items-start justify-between p-5">
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] leading-relaxed ${memory.strength > 0.7 ? "font-medium" : ""}`}>
          {memory.content}
        </p>
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span className={`maze-tag ${categoryColors[memory.category] || ""}`}>
            {memory.category.replace("_", " ")}
          </span>
          <span className="text-[11px] text-muted-foreground">
            via {memory.source.name}
            {memory.conversation?.title && (
              <> &middot; {memory.conversation.title.length > 40 ? memory.conversation.title.slice(0, 40) + "..." : memory.conversation.title}</>
            )}
            {(() => {
              try {
                const config = JSON.parse(memory.source.config || "{}");
                if (config.path) {
                  const short = config.path.replace(/.*\/\.claude\//, "~/.claude/").replace(/\/Users\/\w+\//, "~/");
                  return <> &middot; <span className="font-mono text-[10px]">{short}</span></>;
                }
              } catch { /* ignore */ }
              return null;
            })()}
          </span>
          {memory.sensitive && (
            <span className="maze-tag bg-red-50 text-red-600">sensitive</span>
          )}
        </div>
      </div>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-4">
        <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => setEditDialog({ memory, content: memory.content })} title="Edit">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => handleArchive(memory.id)} title="Archive">
          <Archive className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
    {/* Heat bar */}
    <div
      className={`absolute bottom-0 left-0 h-1 transition-all duration-500 ${strengthBarColor(memory.strength)}`}
      style={{ width: `${(memory.strength * 100).toFixed(1)}%` }}
      title={strengthTooltip(memory)}
    />
  </div>
))
```

- [ ] **Step 4: Verify the app compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/memories/page.tsx
git commit -m "feat: memory card heat bar and visual weight based on strength score"
```

---

## Task 5: Home Page Redesign (independent)

**Files:**
- Modify: `src/app/landing/page.tsx` — full rewrite

**Interfaces:**
- Consumes: `GET /api/status` → `{ stats: { memories, pending, sources, lastSync }, connections: Record<string, { connected, label }> }`

---

- [ ] **Step 1: Rewrite `src/app/landing/page.tsx`**

Replace the entire file:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Brain, RefreshCw, CheckCircle, Share2 } from "lucide-react";

interface StatusStats {
  memories: number;
  sources: number;
  lastSync: string | null;
}

interface StatusConnections {
  [key: string]: { connected: boolean; label: string };
}

export default function HomePage() {
  const [stats, setStats] = useState<StatusStats | null>(null);
  const [connections, setConnections] = useState<StatusConnections>({});

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats ?? null);
        setConnections(data.connections ?? {});
      })
      .catch(() => {});
  }, []);

  const connectedCount = Object.values(connections).filter((c) => c.connected).length;

  function formatLastSync(lastSync: string | null): string {
    if (!lastSync) return "Never";
    const date = new Date(lastSync);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-20 max-w-3xl">

      {/* Hero */}
      <div className="space-y-6 pt-8" data-animate>
        <p className="maze-eyebrow">Cortex</p>
        <h1 className="text-4xl font-semibold tracking-tight leading-tight">
          Your AI tools don't talk to each other.
          <br />
          <span className="text-lime">Cortex fixes that.</span>
        </h1>
        <p className="maze-body text-lg max-w-xl">
          Every conversation you have with Claude or Poke starts from scratch. Cortex syncs your context across tools — automatically.
        </p>
        <Link
          href="/dashboard"
          className="maze-btn inline-flex items-center gap-2 h-11 px-6 text-[14px]"
        >
          Open Dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Problem */}
      <div data-animate="1">
        <p className="maze-eyebrow mb-6">The Problem</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              title: "Context doesn't transfer",
              body: "You told Claude your dog's name is Brian. Poke has no idea. Every tool starts with a blank slate.",
            },
            {
              title: "You repeat yourself",
              body: "Every new session, you re-explain who you are, what you're working on, what you care about.",
            },
            {
              title: "Facts drift out of sync",
              body: "The same information lives in 3 different tools, maintained separately, slowly diverging.",
            },
          ].map((item) => (
            <div key={item.title} className="maze-card p-5 space-y-2">
              <p className="text-[13px] font-medium tracking-tight">{item.title}</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div data-animate="2">
        <p className="maze-eyebrow mb-6">How It Works</p>
        <div className="space-y-3">
          {[
            {
              step: "01",
              icon: Brain,
              title: "Ingest",
              body: "Cortex reads from Claude Code memory files, Claude.ai conversation exports, and Poke. Upload once and it watches for changes automatically.",
            },
            {
              step: "02",
              icon: CheckCircle,
              title: "Curate",
              body: "Review extracted facts before they're committed. Resolve conflicts when two tools disagree. Control exactly what gets remembered.",
            },
            {
              step: "03",
              icon: Share2,
              title: "Sync",
              body: "Push approved memories to all connected platforms. Set per-destination policies to control which categories each tool receives.",
            },
          ].map(({ step, icon: Icon, title, body }) => (
            <div key={step} className="maze-card p-5 flex items-start gap-5">
              <div className="h-10 w-10 rounded-xl bg-lime/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-lime" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="maze-eyebrow">{step}</p>
                  <p className="text-[13px] font-medium tracking-tight">{title}</p>
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Memory strength callout */}
      <div data-animate="3" className="maze-card p-6 border-lime/20 bg-lime/5 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-lime" />
          <p className="text-[13px] font-medium tracking-tight">Memories get stronger over time</p>
        </div>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Facts you mention once are stored. Facts you mention repeatedly, across time and across tools, earn a higher strength score — and surface first when your AI tools pull context from Cortex.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-[30%] bg-muted-foreground/30 rounded-full" />
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">mentioned once</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-[72%] bg-lime rounded-full" />
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">mentioned often, recently</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-[95%] bg-amber-400 rounded-full" />
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">core fact, always referenced</span>
        </div>
      </div>

      {/* Live stats strip */}
      {stats && (
        <div data-animate="4" className="grid grid-cols-3 gap-4">
          <div className="maze-card p-4 text-center">
            <p className="text-2xl font-semibold tracking-tight">{stats.memories}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Active memories</p>
          </div>
          <div className="maze-card p-4 text-center">
            <p className="text-2xl font-semibold tracking-tight">{connectedCount}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Connected tools</p>
          </div>
          <div className="maze-card p-4 text-center">
            <p className="text-[13px] font-medium tracking-tight truncate">{formatLastSync(stats.lastSync)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Last sync</p>
          </div>
        </div>
      )}

    </div>
  );
}
```

- [ ] **Step 2: Verify the app compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/landing/page.tsx
git commit -m "feat: redesign Home page as product explainer with problem/how-it-works/strength sections"
```

---

## Task 6: Exchange Orchestrator Tests + Exchange Policy Extensions (depends on Task 2)

**Files:**
- Create: `__tests__/pipeline/exchange-orchestrator.test.ts`
- Modify: `__tests__/services/exchange-policy.test.ts`

**Interfaces:**
- Consumes: `ExchangeOrchestrator` from `src/pipeline/agents/exchange-orchestrator`; `ExchangeOrchestratorInputSchema`, `ExchangeOrchestratorOutputSchema` from `src/contracts/exchange`; `deriveExchangePolicyFromText` from `src/services/exchange-policy`

---

- [ ] **Step 1: Write the orchestrator test file**

```typescript
// __tests__/pipeline/exchange-orchestrator.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    source: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    activityLog: { create: vi.fn() },
  },
}));

vi.mock("@/pipeline/deduplicate", () => ({
  deduplicateMemories: vi.fn(),
}));

vi.mock("@/pipeline/commit", () => ({
  commit: vi.fn(),
}));

vi.mock("@/services/propagate", () => ({
  propagateToAllPlatforms: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { deduplicateMemories } from "@/pipeline/deduplicate";
import { commit } from "@/pipeline/commit";
import { propagateToAllPlatforms } from "@/services/propagate";
import { ExchangeOrchestrator } from "@/pipeline/agents/exchange-orchestrator";
import { ExchangeOrchestratorInputSchema, ExchangeOrchestratorOutputSchema } from "@/contracts/exchange";

const mockedPrisma = vi.mocked(prisma);
const mockedDeduplicate = vi.mocked(deduplicateMemories);
const mockedCommit = vi.mocked(commit);
const mockedPropagate = vi.mocked(propagateToAllPlatforms);

const dedupOutput = {
  output: {
    clean: [{
      content: "My dog is named Brian",
      subject: "user", category: "relationships", confidence: 0.9,
      verbatimQuote: "My dog is named Brian", temporality: "durable",
      sensitive: false, isCorrection: false,
    }],
    conflicts: [], duplicatesDropped: 0, duplicateReferences: [],
  },
  tokens: { input: 0, output: 0 },
};

const commitOutput = {
  memoriesCreated: 1, reviewItemsCreated: 0, conflictsCreated: 0,
  autoApproved: 0, autoSuperseded: 0, referencesUpdated: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedPrisma.source.findFirst.mockResolvedValue({ id: "src-1" } as any);
  mockedPrisma.source.create.mockResolvedValue({ id: "src-1" } as any);
  mockedPrisma.source.findMany.mockResolvedValue([]);
  mockedPrisma.activityLog.create.mockResolvedValue({} as any);
  mockedDeduplicate.mockResolvedValue(dedupOutput as any);
  mockedCommit.mockResolvedValue(commitOutput);
  mockedPropagate.mockResolvedValue({ destinations: [{ type: "claude_code", name: "Claude", success: true }] });
});

describe("ExchangeOrchestrator", () => {
  it("input passes ExchangeOrchestratorInputSchema validation", () => {
    const input = { origin: "poke", facts: [{ content: "My dog is named Brian" }] };
    expect(() => ExchangeOrchestratorInputSchema.parse(input)).not.toThrow();
  });

  it("output passes ExchangeOrchestratorOutputSchema validation", async () => {
    const orchestrator = new ExchangeOrchestrator();
    const result = await orchestrator.run({ origin: "poke", facts: [{ content: "My dog is named Brian" }] });
    expect(() => ExchangeOrchestratorOutputSchema.parse(result)).not.toThrow();
  });

  it("includes skippedCategories in output", async () => {
    const orchestrator = new ExchangeOrchestrator();
    const result = await orchestrator.run({ origin: "claude", facts: [{ content: "I study at UC Berkeley", category: "education_career" }] });
    expect(Array.isArray(result.skippedCategories)).toBe(true);
  });

  it("poke origin does not echo back to poke destination", async () => {
    const orchestrator = new ExchangeOrchestrator();
    await orchestrator.run({ origin: "poke", facts: [{ content: "User likes coffee" }] });
    expect(mockedPropagate).toHaveBeenCalledWith(
      expect.objectContaining({ skipDestinations: ["poke"] })
    );
  });

  it("skippedCategories includes education_career when a poke source blocks it", async () => {
    mockedPrisma.source.findMany.mockResolvedValue([{
      id: "poke-src",
      type: "poke",
      name: "Poke",
      status: "active",
      config: JSON.stringify({
        exchangePolicies: [{
          destination: "poke",
          mode: "block",
          allowedCategories: [],
          blockedCategories: ["education_career"],
        }],
      }),
    }] as any);

    const orchestrator = new ExchangeOrchestrator();
    const result = await orchestrator.run({
      origin: "claude",
      facts: [{ content: "I study at UC Berkeley", category: "education_career" }],
    });

    expect(result.skippedCategories).toContain("education_career");
  });
});
```

- [ ] **Step 2: Run to confirm they pass**

```bash
npx vitest run __tests__/pipeline/exchange-orchestrator.test.ts
```
Expected: 5 tests pass

- [ ] **Step 3: Add two cases to exchange-policy.test.ts**

Append inside the `describe("exchange policy orchestration", ...)` block in `__tests__/services/exchange-policy.test.ts`:

```typescript
  it("natural language: don't send school memories to Poke → mode block, education_career blocked", () => {
    const policy = deriveExchangePolicyFromText({
      destination: "poke",
      instruction: "don't send school memories to Poke",
      categories: [
        { slug: "education_career", label: "Education & Career" },
        { slug: "projects", label: "Projects" },
      ],
    });
    expect(policy.mode).toBe("block");
    expect(policy.blockedCategories).toContain("education_career");
  });

  it("natural language: only share projects with Claude → mode allow_only, projects allowed", () => {
    const policy = deriveExchangePolicyFromText({
      destination: "claude_code",
      instruction: "only share projects with Claude",
      categories: [
        { slug: "education_career", label: "Education & Career" },
        { slug: "projects", label: "Projects" },
      ],
    });
    expect(policy.mode).toBe("allow_only");
    expect(policy.allowedCategories).toContain("projects");
  });
```

- [ ] **Step 4: Run exchange-policy tests to confirm all pass**

```bash
npx vitest run __tests__/services/exchange-policy.test.ts
```
Expected: 6 tests pass (4 existing + 2 new)

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add __tests__/pipeline/exchange-orchestrator.test.ts __tests__/services/exchange-policy.test.ts
git commit -m "test: add exchange orchestrator tests and exchange policy natural language cases"
```

---

## Self-Review

**Spec coverage:**
- ✅ Exchange Orchestrator with `ExchangeOrchestratorInputSchema` / `ExchangeOrchestratorOutputSchema` (Task 2)
- ✅ `skippedCategories` field (Task 2, Step 2)
- ✅ `exchange-ingest.ts` delegates to orchestrator (Task 2, Step 3)
- ✅ `computeMemoryStrength` pure function (Task 1)
- ✅ `GET /api/memories` attaches strength, sorts DESC (Task 3)
- ✅ Heat bar with color thresholds (Task 4)
- ✅ Card weight: `font-medium` and `border-lime/30` at >0.7, `opacity-60` at <0.1 (Task 4)
- ✅ Badge replacement: `referenceCount` badge and `Clock` inline text removed (Task 4)
- ✅ Home page: hero, problem cards, how-it-works steps, strength callout, live stats (Task 5)
- ✅ `__tests__/lib/memory-strength.test.ts` (Task 1)
- ✅ `__tests__/pipeline/exchange-orchestrator.test.ts` (Task 6)
- ✅ Extended `__tests__/services/exchange-policy.test.ts` (Task 6)

**Type consistency check:**
- `computeMemoryStrength(refCount: number, lastReferencedAt: Date): number` — used identically in Tasks 1, 3, and 4 ✅
- `ExchangeOrchestratorInput` / `ExchangeOrchestratorOutput` — defined in Task 2 Step 1, used identically in Tasks 2 Step 2 and 6 ✅
- `strength: number` on `Memory` interface — added in Task 4 Step 1, consumed in same task ✅

**Placeholder scan:** No TBDs, TODOs, or vague steps found ✅

**Parallelization note for agent swarm:**
- Tasks 1, 2, 5 can run in parallel (no shared dependencies)
- Task 3 requires Task 1 complete
- Task 4 requires Task 3 complete
- Task 6 requires Task 2 complete
