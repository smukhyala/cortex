# J-Space Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Cortex's memory-vault model with a J-Space-inspired workspace: 20 capacity-constrained slots with decay, a J-Lens inference engine that loads/evicts concepts based on activity, directed modulation (hold/suppress/release), and workspace-first MCP serving.

**Architecture:** Three new layers on top of the existing memory system. WorkspaceSlot (20 fixed rows) holds the active set. ActivitySignal captures usage patterns. J-Lens service scores memories and manages slot loading/decay. MCP tools swap from 10 category endpoints to a single workspace broadcast + background search + modulation controls.

**Tech Stack:** Prisma v7 + SQLite, Vitest, Zod v4, Next.js App Router API routes, MCP SDK

## Global Constraints

- Prisma v7: requires adapter (`PrismaBetterSqlite3`), constructor requires options object
- Zod v4: use `z.toJSONSchema()`, not zod-to-json-schema
- SQLite: no native JSON operators — store JSON arrays as strings, parse in app code
- Existing pipeline (ingest/extract/dedup/commit) must continue working unchanged
- Existing test suite must keep passing
- Decay rate for 7-day half-life: `ln(2) / 10080 ≈ 0.0000688` loading units per minute

---

### Task 1: Schema Migration — WorkspaceSlot, ActivitySignal, Memory tier

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_j_space_workspace/migration.sql` (auto-generated)
- Create: `src/lib/seed-workspace.ts`
- Test: `__tests__/lib/seed-workspace.test.ts`

**Interfaces:**
- Produces: `WorkspaceSlot` model (position 0-19, memoryId, conceptLabel, loading, decayRate, pinned, sourceSignal, activatedAt, loadedAt), `ActivitySignal` model, Memory.tier column, Memory.suppressedUntil column
- Produces: `seedWorkspaceSlots()` function for initializing 20 empty rows

- [ ] **Step 1: Add WorkspaceSlot and ActivitySignal models to Prisma schema, add tier/suppressedUntil to Memory**

Add to `prisma/schema.prisma` after the existing `MemoryFolder` model:

```prisma
model WorkspaceSlot {
  id            String    @id @default(cuid())
  position      Int       @unique              // 0-19
  memoryId      String?
  memory        Memory?   @relation(fields: [memoryId], references: [id])
  conceptLabel  String?
  loading       Float     @default(0.0)        // 0.0-1.0
  decayRate     Float     @default(0.0000688)  // ln(2)/10080 per minute (~7-day half-life)
  pinned        Boolean   @default(false)
  sourceSignal  String    @default("activity") // activity | explicit | query | sync
  activatedAt   DateTime  @default(now())
  loadedAt      DateTime  @default(now())
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model ActivitySignal {
  id         String   @id @default(cuid())
  type       String                          // mcp_query | conversation_sync | file_change | manual
  keywords   String                          // JSON array as string
  categories String                          // JSON array as string
  sourceType String?
  timestamp  DateTime @default(now())
  processed  Boolean  @default(false)
  createdAt  DateTime @default(now())

  @@index([processed])
  @@index([timestamp])
}
```

Add to the `Memory` model (after `project String?`):

```prisma
  tier            String   @default("background") // background | workspace
  suppressedUntil DateTime?
```

Add to the `Memory` model's relations:

```prisma
  workspaceSlot WorkspaceSlot?
```

- [ ] **Step 2: Generate and apply migration**

Run:
```bash
npx prisma migrate dev --name j_space_workspace
```

Expected: Migration created, schema synced, Prisma client regenerated.

- [ ] **Step 3: Write seed-workspace.ts**

Create `src/lib/seed-workspace.ts`:

```typescript
import { prisma } from "@/lib/db";

export async function seedWorkspaceSlots(): Promise<number> {
  const existing = await prisma.workspaceSlot.count();
  if (existing >= 20) return 0;

  const existingPositions = await prisma.workspaceSlot.findMany({
    select: { position: true },
  });
  const taken = new Set(existingPositions.map((s) => s.position));

  let created = 0;
  for (let i = 0; i < 20; i++) {
    if (taken.has(i)) continue;
    await prisma.workspaceSlot.create({
      data: { position: i },
    });
    created++;
  }
  return created;
}
```

- [ ] **Step 4: Write test for seedWorkspaceSlots**

Create `__tests__/lib/seed-workspace.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceSlot: {
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { seedWorkspaceSlots } from "@/lib/seed-workspace";
import { prisma } from "@/lib/db";

const mockedCount = prisma.workspaceSlot.count as unknown as ReturnType<typeof vi.fn>;
const mockedFindMany = prisma.workspaceSlot.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedCreate = prisma.workspaceSlot.create as unknown as ReturnType<typeof vi.fn>;

describe("seedWorkspaceSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates 20 slots when none exist", async () => {
    mockedCount.mockResolvedValue(0);
    mockedFindMany.mockResolvedValue([]);
    mockedCreate.mockResolvedValue({ id: "test" });

    const created = await seedWorkspaceSlots();
    expect(created).toBe(20);
    expect(mockedCreate).toHaveBeenCalledTimes(20);

    // Verify positions 0-19 are created
    const positions = mockedCreate.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { position: number } }).data.position
    );
    expect(positions.sort((a: number, b: number) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i)
    );
  });

  it("skips seeding when 20 slots already exist", async () => {
    mockedCount.mockResolvedValue(20);

    const created = await seedWorkspaceSlots();
    expect(created).toBe(0);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("fills gaps when some slots exist", async () => {
    mockedCount.mockResolvedValue(18);
    mockedFindMany.mockResolvedValue(
      Array.from({ length: 18 }, (_, i) => ({ position: i }))
    );
    mockedCreate.mockResolvedValue({ id: "test" });

    const created = await seedWorkspaceSlots();
    expect(created).toBe(2);
    const positions = mockedCreate.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { position: number } }).data.position
    );
    expect(positions.sort((a: number, b: number) => a - b)).toEqual([18, 19]);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run __tests__/lib/seed-workspace.test.ts`
Expected: 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/lib/seed-workspace.ts __tests__/lib/seed-workspace.test.ts src/generated/
git commit -m "feat(j-space): add WorkspaceSlot, ActivitySignal models and Memory tier column"
```

---

### Task 2: Workspace Contracts — Zod schemas for the new J-Space types

**Files:**
- Modify: `src/contracts/workspace.ts`
- Test: `__tests__/contracts/workspace.test.ts`

**Interfaces:**
- Consumes: nothing new (builds on existing `MemoryCategorySchema`)
- Produces: `WorkspaceSlotSchema`, `ActivitySignalSchema`, `JLensConfigSchema`, `WorkspaceResponseSchema`, `MemoryTierSchema`, `SourceSignalSchema` — used by J-Lens service (Task 3), MCP server (Task 4), and API routes (Task 5)

- [ ] **Step 1: Write failing test for new schemas**

Create `__tests__/contracts/workspace.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  WorkspaceSlotSchema,
  ActivitySignalSchema,
  JLensConfigSchema,
  WorkspaceResponseSchema,
  MemoryTierSchema,
  SourceSignalSchema,
  DEFAULT_JLENS_CONFIG,
} from "@/contracts/workspace";

describe("J-Space workspace contracts", () => {
  it("validates a workspace slot", () => {
    const slot = {
      position: 0,
      memoryId: "mem-123",
      conceptLabel: "cold-start research",
      loading: 0.85,
      pinned: false,
      sourceSignal: "activity",
      activatedAt: "2026-07-12T10:00:00Z",
      memories: ["fact 1", "fact 2"],
    };
    expect(WorkspaceSlotSchema.parse(slot)).toEqual(slot);
  });

  it("rejects slot with position > 29", () => {
    expect(() =>
      WorkspaceSlotSchema.parse({
        position: 30,
        loading: 0.5,
        pinned: false,
        sourceSignal: "activity",
        activatedAt: "2026-07-12T10:00:00Z",
        memories: [],
      })
    ).toThrow();
  });

  it("validates an activity signal", () => {
    const signal = {
      type: "mcp_query",
      keywords: ["webarena", "bug"],
      categories: ["projects"],
      sourceType: "claude_code",
    };
    expect(ActivitySignalSchema.parse(signal)).toEqual(signal);
  });

  it("validates memory tier enum", () => {
    expect(MemoryTierSchema.parse("workspace")).toBe("workspace");
    expect(MemoryTierSchema.parse("background")).toBe("background");
    expect(() => MemoryTierSchema.parse("other")).toThrow();
  });

  it("validates source signal enum", () => {
    expect(SourceSignalSchema.parse("activity")).toBe("activity");
    expect(SourceSignalSchema.parse("explicit")).toBe("explicit");
    expect(SourceSignalSchema.parse("query")).toBe("query");
    expect(SourceSignalSchema.parse("sync")).toBe("sync");
  });

  it("validates J-Lens config with defaults", () => {
    const config = JLensConfigSchema.parse({});
    expect(config.halfLifeDays).toBe(7);
    expect(config.evictionThreshold).toBe(0.15);
    expect(config.reinforcementBoost).toBe(0.2);
    expect(config.capacity).toBe(20);
  });

  it("validates workspace response shape", () => {
    const response = {
      slots: [
        {
          position: 0,
          memoryId: "mem-1",
          conceptLabel: "test",
          loading: 0.9,
          pinned: false,
          sourceSignal: "activity",
          activatedAt: "2026-07-12T10:00:00Z",
          memories: ["fact"],
        },
      ],
      capacity: { used: 1, total: 20 },
      lastUpdated: "2026-07-12T14:00:00Z",
    };
    expect(WorkspaceResponseSchema.parse(response)).toEqual(response);
  });

  it("has sensible default J-Lens config", () => {
    expect(DEFAULT_JLENS_CONFIG.halfLifeDays).toBe(7);
    expect(DEFAULT_JLENS_CONFIG.capacity).toBe(20);
    expect(DEFAULT_JLENS_CONFIG.evictionThreshold).toBe(0.15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/contracts/workspace.test.ts`
Expected: FAIL — missing exports

- [ ] **Step 3: Update workspace contracts**

Replace the contents of `src/contracts/workspace.ts` with:

```typescript
import { z } from "zod";
import { MemoryCategorySchema } from "@/contracts/memory";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const MemoryTierSchema = z.enum(["background", "workspace"]);
export type MemoryTier = z.infer<typeof MemoryTierSchema>;

export const SourceSignalSchema = z.enum(["activity", "explicit", "query", "sync"]);
export type SourceSignal = z.infer<typeof SourceSignalSchema>;

// ─── J-Lens Configuration ────────────────────────────────────────────────────

export const JLensConfigSchema = z.object({
  /** Max workspace slots */
  capacity: z.number().int().min(10).max(30).default(20),
  /** Half-life in days for loading decay */
  halfLifeDays: z.number().min(1).max(30).default(7),
  /** Loading threshold below which a slot is evicted */
  evictionThreshold: z.number().min(0).max(0.5).default(0.15),
  /** Loading boost applied on reinforcement */
  reinforcementBoost: z.number().min(0.05).max(0.5).default(0.2),
  /** Scoring weights */
  weights: z.object({
    keywordOverlap: z.number().default(0.40),
    categoryMatch: z.number().default(0.25),
    recencyBoost: z.number().default(0.20),
    coOccurrence: z.number().default(0.15),
  }).default({}),
});

export type JLensConfig = z.infer<typeof JLensConfigSchema>;

export const DEFAULT_JLENS_CONFIG: JLensConfig = JLensConfigSchema.parse({});

// ─── Workspace Slot (MCP response shape) ─────────────────────────────────────

export const WorkspaceSlotSchema = z.object({
  position: z.number().int().min(0).max(29),
  memoryId: z.string().nullable().optional(),
  conceptLabel: z.string().nullable().optional(),
  loading: z.number().min(0).max(1),
  pinned: z.boolean(),
  sourceSignal: SourceSignalSchema,
  activatedAt: z.string(),
  memories: z.array(z.string()),
});

export type WorkspaceSlotResponse = z.infer<typeof WorkspaceSlotSchema>;

// ─── Activity Signal ─────────────────────────────────────────────────────────

export const ActivitySignalSchema = z.object({
  type: z.enum(["mcp_query", "conversation_sync", "file_change", "manual"]),
  keywords: z.array(z.string()),
  categories: z.array(z.string()),
  sourceType: z.string().optional(),
});

export type ActivitySignalInput = z.infer<typeof ActivitySignalSchema>;

// ─── Workspace Response (full MCP response) ──────────────────────────────────

export const WorkspaceResponseSchema = z.object({
  slots: z.array(WorkspaceSlotSchema),
  capacity: z.object({
    used: z.number(),
    total: z.number(),
  }),
  lastUpdated: z.string(),
});

export type WorkspaceResponse = z.infer<typeof WorkspaceResponseSchema>;

// ─── Legacy types (kept for existing code compatibility during migration) ────

export const WorkspaceConfigSchema = z.object({
  capacity: z.number().int().min(5).max(50).default(20),
  ignitionThreshold: z.number().int().min(2).max(10).default(3),
  ignitionBoost: z.number().min(1).max(5).default(2.0),
  suppressionFactor: z.number().min(0).max(1).default(0.3),
  coherenceWeight: z.number().min(0).max(1).default(0.4),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  capacity: 20,
  ignitionThreshold: 3,
  ignitionBoost: 2.0,
  suppressionFactor: 0.3,
  coherenceWeight: 0.4,
};

export const FocusModeSchema = z.object({
  id: z.string(),
  label: z.string(),
  boostedCategories: z.array(MemoryCategorySchema),
  suppressedCategories: z.array(MemoryCategorySchema),
});

export type FocusMode = z.infer<typeof FocusModeSchema>;

export const FOCUS_MODES: FocusMode[] = [
  { id: "balanced", label: "Balanced", boostedCategories: [], suppressedCategories: [] },
  { id: "work", label: "Work Mode", boostedCategories: ["projects", "workflows", "goals"], suppressedCategories: ["relationships", "writing_voice"] },
  { id: "personal", label: "Personal Mode", boostedCategories: ["relationships", "preferences", "identity"], suppressedCategories: ["workflows", "research"] },
  { id: "research", label: "Research Mode", boostedCategories: ["research", "education_career", "projects"], suppressedCategories: ["relationships", "temporary"] },
];

export const WorkspaceCandidateSchema = z.object({
  memoryId: z.string(),
  content: z.string(),
  category: MemoryCategorySchema,
  relevanceScore: z.number(),
  strengthScore: z.number(),
  coherenceScore: z.number(),
  totalScore: z.number(),
  clusterId: z.string().nullable(),
  pinned: z.boolean(),
});

export type WorkspaceCandidate = z.infer<typeof WorkspaceCandidateSchema>;

export const IgnitionClusterSchema = z.object({
  id: z.string(),
  label: z.string(),
  members: z.array(z.string()),
  totalScore: z.number(),
});

export type IgnitionCluster = z.infer<typeof IgnitionClusterSchema>;

export const WorkspaceStateSchema = z.object({
  active: z.array(WorkspaceCandidateSchema),
  suppressed: z.array(WorkspaceCandidateSchema),
  ignitionCluster: IgnitionClusterSchema.nullable(),
  capacity: z.number(),
  totalCandidates: z.number(),
  varianceExplained: z.number(),
  steeringApplied: z.array(z.string()),
  computedAt: z.string(),
});

export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/contracts/workspace.test.ts`
Expected: All 7 tests pass

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `npx vitest run`
Expected: All existing tests pass (workspace.ts kept legacy exports)

- [ ] **Step 6: Commit**

```bash
git add src/contracts/workspace.ts __tests__/contracts/workspace.test.ts
git commit -m "feat(j-space): add J-Space Zod contracts — slots, signals, J-Lens config"
```

---

### Task 3: J-Lens Service — scoring, decay, load/evict, directed modulation

**Files:**
- Create: `src/services/j-lens.ts`
- Test: `__tests__/services/j-lens.test.ts`

**Interfaces:**
- Consumes: `prisma.workspaceSlot`, `prisma.activitySignal`, `prisma.memory`, `JLensConfig` from Task 2
- Produces:
  - `decayAllSlots(): Promise<{ decayed: number; evicted: number }>` — applies exponential decay, evicts below threshold
  - `scoreBatch(): Promise<{ loaded: number; evicted: number }>` — consumes signals, scores background memories, loads/evicts
  - `reinforceSlots(keywords: string[]): Promise<number>` — inline mode, boosts matching slots
  - `holdInMind(concept: string): Promise<{ slotPosition: number; conceptLabel: string }>` — directed modulation
  - `suppress(concept: string, durationHours?: number): Promise<{ evictedSlot: number; suppressedUntil: string }>` — directed modulation
  - `release(concept: string): Promise<{ slotPosition: number }>` — directed modulation
  - `logSignal(input: ActivitySignalInput): Promise<string>` — persist an activity signal
  - `getWorkspaceResponse(): Promise<WorkspaceResponse>` — full workspace state for MCP
  - `coldStart(): Promise<number>` — seed workspace from top memories

- [ ] **Step 1: Write failing tests for J-Lens core functions**

Create `__tests__/services/j-lens.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceSlot: {
      findMany: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    memory: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    activitySignal: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import {
  decayAllSlots,
  reinforceSlots,
  holdInMind,
  suppress,
  release,
  logSignal,
  getWorkspaceResponse,
} from "@/services/j-lens";
import { prisma } from "@/lib/db";

const mockSlotFindMany = prisma.workspaceSlot.findMany as unknown as ReturnType<typeof vi.fn>;
const mockSlotUpdate = prisma.workspaceSlot.update as unknown as ReturnType<typeof vi.fn>;
const mockSlotFindFirst = prisma.workspaceSlot.findFirst as unknown as ReturnType<typeof vi.fn>;
const mockMemoryFindMany = prisma.memory.findMany as unknown as ReturnType<typeof vi.fn>;
const mockMemoryUpdate = prisma.memory.update as unknown as ReturnType<typeof vi.fn>;
const mockSignalCreate = prisma.activitySignal.create as unknown as ReturnType<typeof vi.fn>;

function makeSlot(overrides: Partial<{
  id: string;
  position: number;
  memoryId: string | null;
  conceptLabel: string | null;
  loading: number;
  decayRate: number;
  pinned: boolean;
  sourceSignal: string;
  activatedAt: Date;
  loadedAt: Date;
  memory: { id: string; content: string; category: string } | null;
}> = {}) {
  return {
    id: overrides.id ?? `slot-${overrides.position ?? 0}`,
    position: overrides.position ?? 0,
    memoryId: overrides.memoryId ?? null,
    conceptLabel: overrides.conceptLabel ?? null,
    loading: overrides.loading ?? 0,
    decayRate: overrides.decayRate ?? 0.0000688,
    pinned: overrides.pinned ?? false,
    sourceSignal: overrides.sourceSignal ?? "activity",
    activatedAt: overrides.activatedAt ?? new Date(),
    loadedAt: overrides.loadedAt ?? new Date(),
    memory: overrides.memory ?? null,
  };
}

describe("J-Lens Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("decayAllSlots", () => {
    it("applies exponential decay to occupied, non-pinned slots", async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const slots = [
        makeSlot({ position: 0, memoryId: "mem-1", loading: 0.8, activatedAt: twoHoursAgo }),
        makeSlot({ position: 1, memoryId: null, loading: 0 }),
        makeSlot({ position: 2, memoryId: "mem-2", loading: 1.0, pinned: true, activatedAt: twoHoursAgo }),
      ];
      mockSlotFindMany.mockResolvedValue(slots);
      mockSlotUpdate.mockResolvedValue({});
      mockMemoryUpdate.mockResolvedValue({});

      const result = await decayAllSlots();

      // Slot 0 should decay (occupied, not pinned)
      // Slot 1 is empty — skip
      // Slot 2 is pinned — skip
      expect(mockSlotUpdate).toHaveBeenCalledTimes(1);
      const updateCall = mockSlotUpdate.mock.calls[0][0];
      expect(updateCall.where.id).toBe("slot-0");
      // After 120 minutes with rate 0.0000688: 0.8 * e^(-0.0000688 * 120) ≈ 0.793
      expect(updateCall.data.loading).toBeGreaterThan(0.78);
      expect(updateCall.data.loading).toBeLessThan(0.80);
      expect(result.evicted).toBe(0);
    });

    it("evicts slots that decay below threshold", async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const slots = [
        makeSlot({ position: 0, memoryId: "mem-1", loading: 0.3, activatedAt: tenDaysAgo }),
      ];
      mockSlotFindMany.mockResolvedValue(slots);
      mockSlotUpdate.mockResolvedValue({});
      mockMemoryUpdate.mockResolvedValue({});

      const result = await decayAllSlots();

      // After 10 days (~14400 min), loading should be well below 0.15
      expect(result.evicted).toBe(1);
      // Should clear the slot
      const clearCall = mockSlotUpdate.mock.calls.find(
        (call: unknown[]) => (call[0] as { data: { memoryId: null } }).data.memoryId === null
      );
      expect(clearCall).toBeDefined();
      // Should set memory tier back to background
      expect(mockMemoryUpdate).toHaveBeenCalledWith({
        where: { id: "mem-1" },
        data: { tier: "background" },
      });
    });
  });

  describe("reinforceSlots", () => {
    it("boosts loading of slots matching keywords", async () => {
      const slots = [
        makeSlot({
          position: 0,
          memoryId: "mem-1",
          loading: 0.6,
          memory: { id: "mem-1", content: "Working on WebArena cold-start research", category: "projects" },
        }),
        makeSlot({
          position: 1,
          memoryId: "mem-2",
          loading: 0.5,
          memory: { id: "mem-2", content: "User prefers Prisma ORM", category: "preferences" },
        }),
      ];
      mockSlotFindMany.mockResolvedValue(slots);
      mockSlotUpdate.mockResolvedValue({});

      const boosted = await reinforceSlots(["webarena", "cold-start"]);

      expect(boosted).toBe(1);
      expect(mockSlotUpdate).toHaveBeenCalledTimes(1);
      const updateCall = mockSlotUpdate.mock.calls[0][0];
      expect(updateCall.where.id).toBe("slot-0");
      expect(updateCall.data.loading).toBe(0.8); // 0.6 + 0.2, capped at 1.0
    });

    it("caps loading at 1.0", async () => {
      const slots = [
        makeSlot({
          position: 0,
          memoryId: "mem-1",
          loading: 0.95,
          memory: { id: "mem-1", content: "Working on WebArena research", category: "projects" },
        }),
      ];
      mockSlotFindMany.mockResolvedValue(slots);
      mockSlotUpdate.mockResolvedValue({});

      await reinforceSlots(["webarena"]);

      const updateCall = mockSlotUpdate.mock.calls[0][0];
      expect(updateCall.data.loading).toBe(1.0);
    });
  });

  describe("holdInMind", () => {
    it("loads a matching memory into an empty slot and pins it", async () => {
      mockMemoryFindMany.mockResolvedValue([
        { id: "mem-1", content: "Ian meeting prep notes and agenda", category: "projects", confidence: 0.9 },
      ]);
      mockSlotFindMany.mockResolvedValue([
        makeSlot({ position: 0, memoryId: null }),
      ]);
      mockSlotUpdate.mockResolvedValue({});
      mockMemoryUpdate.mockResolvedValue({});

      const result = await holdInMind("Ian meeting prep");

      expect(result.slotPosition).toBe(0);
      expect(result.conceptLabel).toContain("Ian");
      expect(mockSlotUpdate).toHaveBeenCalled();
      const updateData = mockSlotUpdate.mock.calls[0][0].data;
      expect(updateData.pinned).toBe(true);
      expect(updateData.loading).toBe(1.0);
    });
  });

  describe("suppress", () => {
    it("evicts a matching slot and sets suppressedUntil on the memory", async () => {
      const slots = [
        makeSlot({
          position: 3,
          memoryId: "mem-5",
          loading: 0.7,
          conceptLabel: "guitar practice",
          memory: { id: "mem-5", content: "User practices guitar", category: "preferences" },
        }),
      ];
      mockSlotFindMany.mockResolvedValue(slots);
      mockSlotUpdate.mockResolvedValue({});
      mockMemoryUpdate.mockResolvedValue({});

      const result = await suppress("guitar practice");

      expect(result.evictedSlot).toBe(3);
      expect(mockSlotUpdate).toHaveBeenCalled();
      expect(mockMemoryUpdate).toHaveBeenCalled();
      const memUpdate = mockMemoryUpdate.mock.calls[0][0];
      expect(memUpdate.data.tier).toBe("background");
      expect(memUpdate.data.suppressedUntil).toBeDefined();
    });
  });

  describe("release", () => {
    it("unpins a held slot and resumes decay", async () => {
      const slots = [
        makeSlot({
          position: 0,
          memoryId: "mem-1",
          loading: 1.0,
          pinned: true,
          conceptLabel: "Ian meeting",
          memory: { id: "mem-1", content: "Ian meeting prep", category: "projects" },
        }),
      ];
      mockSlotFindMany.mockResolvedValue(slots);
      mockSlotUpdate.mockResolvedValue({});

      const result = await release("Ian meeting");

      expect(result.slotPosition).toBe(0);
      const updateData = mockSlotUpdate.mock.calls[0][0].data;
      expect(updateData.pinned).toBe(false);
    });
  });

  describe("logSignal", () => {
    it("creates an activity signal record", async () => {
      mockSignalCreate.mockResolvedValue({ id: "sig-1" });

      const id = await logSignal({
        type: "mcp_query",
        keywords: ["webarena", "bug"],
        categories: ["projects"],
        sourceType: "claude_code",
      });

      expect(id).toBe("sig-1");
      expect(mockSignalCreate).toHaveBeenCalledWith({
        data: {
          type: "mcp_query",
          keywords: JSON.stringify(["webarena", "bug"]),
          categories: JSON.stringify(["projects"]),
          sourceType: "claude_code",
        },
      });
    });
  });

  describe("getWorkspaceResponse", () => {
    it("returns formatted workspace with occupied slots only", async () => {
      const slots = [
        makeSlot({
          position: 0,
          memoryId: "mem-1",
          loading: 0.9,
          conceptLabel: "cold-start research",
          memory: { id: "mem-1", content: "Working on cold-start prompts", category: "projects" },
        }),
        makeSlot({ position: 1, memoryId: null }),
      ];
      mockSlotFindMany.mockResolvedValue(slots);

      const response = await getWorkspaceResponse();

      expect(response.slots).toHaveLength(1);
      expect(response.slots[0].position).toBe(0);
      expect(response.slots[0].conceptLabel).toBe("cold-start research");
      expect(response.slots[0].loading).toBe(0.9);
      expect(response.slots[0].memories).toEqual(["Working on cold-start prompts"]);
      expect(response.capacity.used).toBe(1);
      expect(response.capacity.total).toBe(20);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/services/j-lens.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement J-Lens service**

Create `src/services/j-lens.ts`:

```typescript
import { prisma } from "@/lib/db";
import { DEFAULT_JLENS_CONFIG, type ActivitySignalInput, type WorkspaceResponse } from "@/contracts/workspace";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "what", "would", "should", "could", "might", "will", "using",
    "name", "named", "call", "called", "the", "an", "my", "me",
    "you", "your", "about", "from", "with", "for", "and", "or", "to", "do",
    "is", "are", "was", "were", "be", "been", "has", "have", "had", "this",
    "that", "these", "those", "it", "its", "of", "in", "on", "at", "by",
  ]);
  return Array.from(new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !stopWords.has(w))
  ));
}

function contentMatchesKeywords(content: string, keywords: string[]): boolean {
  const lower = content.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// ─── Decay ───────────────────────────────────────────────────────────────────

export async function decayAllSlots(): Promise<{ decayed: number; evicted: number }> {
  const config = DEFAULT_JLENS_CONFIG;
  const now = new Date();
  const slots = await prisma.workspaceSlot.findMany({
    where: { memoryId: { not: null } },
  });

  let decayed = 0;
  let evicted = 0;

  for (const slot of slots) {
    if (slot.pinned) continue;

    const minutesElapsed = (now.getTime() - slot.activatedAt.getTime()) / 60000;
    const newLoading = slot.loading * Math.exp(-slot.decayRate * minutesElapsed);

    if (newLoading < config.evictionThreshold) {
      // Evict
      await prisma.workspaceSlot.update({
        where: { id: slot.id },
        data: {
          memoryId: null,
          conceptLabel: null,
          loading: 0,
          pinned: false,
          sourceSignal: "activity",
        },
      });
      if (slot.memoryId) {
        await prisma.memory.update({
          where: { id: slot.memoryId },
          data: { tier: "background" },
        });
      }
      evicted++;
    } else {
      await prisma.workspaceSlot.update({
        where: { id: slot.id },
        data: { loading: newLoading },
      });
      decayed++;
    }
  }

  return { decayed, evicted };
}

// ─── Reinforce (inline mode) ─────────────────────────────────────────────────

export async function reinforceSlots(keywords: string[]): Promise<number> {
  const config = DEFAULT_JLENS_CONFIG;
  const slots = await prisma.workspaceSlot.findMany({
    where: { memoryId: { not: null } },
    include: { memory: { select: { id: true, content: true, category: true } } },
  });

  let boosted = 0;
  for (const slot of slots) {
    if (!slot.memory) continue;
    if (contentMatchesKeywords(slot.memory.content, keywords) ||
        (slot.conceptLabel && contentMatchesKeywords(slot.conceptLabel, keywords))) {
      const newLoading = Math.min(1.0, slot.loading + config.reinforcementBoost);
      await prisma.workspaceSlot.update({
        where: { id: slot.id },
        data: { loading: newLoading, activatedAt: new Date() },
      });
      boosted++;
    }
  }

  return boosted;
}

// ─── Directed Modulation ─────────────────────────────────────────────────────

export async function holdInMind(concept: string): Promise<{ slotPosition: number; conceptLabel: string }> {
  const keywords = extractKeywords(concept);

  // Find matching memories
  const memories = await prisma.memory.findMany({
    where: { status: "active" },
    select: { id: true, content: true, category: true, confidence: true },
  });

  const scored = memories
    .map((mem) => {
      const matches = keywords.filter((kw) => mem.content.toLowerCase().includes(kw));
      return { ...mem, score: matches.length };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);

  if (scored.length === 0) {
    throw new Error(`No memories match concept "${concept}"`);
  }

  const bestMemory = scored[0];

  // Find an empty slot, or the lowest-loading non-pinned slot
  const allSlots = await prisma.workspaceSlot.findMany({
    orderBy: { loading: "asc" },
  });

  const emptySlot = allSlots.find((s) => s.memoryId === null);
  const targetSlot = emptySlot ?? allSlots.find((s) => !s.pinned);

  if (!targetSlot) {
    throw new Error("Workspace full — all slots are pinned. Release a slot first.");
  }

  // Evict if occupied
  if (targetSlot.memoryId) {
    await prisma.memory.update({
      where: { id: targetSlot.memoryId },
      data: { tier: "background" },
    });
  }

  const label = concept.slice(0, 60);
  await prisma.workspaceSlot.update({
    where: { id: targetSlot.id },
    data: {
      memoryId: bestMemory.id,
      conceptLabel: label,
      loading: 1.0,
      pinned: true,
      sourceSignal: "explicit",
      activatedAt: new Date(),
      loadedAt: new Date(),
    },
  });

  await prisma.memory.update({
    where: { id: bestMemory.id },
    data: { tier: "workspace" },
  });

  return { slotPosition: targetSlot.position, conceptLabel: label };
}

export async function suppress(
  concept: string,
  durationHours: number = 24,
): Promise<{ evictedSlot: number; suppressedUntil: string }> {
  const keywords = extractKeywords(concept);

  const slots = await prisma.workspaceSlot.findMany({
    where: { memoryId: { not: null } },
    include: { memory: { select: { id: true, content: true, category: true } } },
  });

  const matchingSlot = slots.find((s) =>
    (s.conceptLabel && contentMatchesKeywords(s.conceptLabel, keywords)) ||
    (s.memory && contentMatchesKeywords(s.memory.content, keywords))
  );

  if (!matchingSlot || !matchingSlot.memoryId) {
    throw new Error(`No workspace slot matches concept "${concept}"`);
  }

  const suppressedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  await prisma.workspaceSlot.update({
    where: { id: matchingSlot.id },
    data: {
      memoryId: null,
      conceptLabel: null,
      loading: 0,
      pinned: false,
      sourceSignal: "activity",
    },
  });

  await prisma.memory.update({
    where: { id: matchingSlot.memoryId },
    data: { tier: "background", suppressedUntil },
  });

  return { evictedSlot: matchingSlot.position, suppressedUntil: suppressedUntil.toISOString() };
}

export async function release(concept: string): Promise<{ slotPosition: number }> {
  const keywords = extractKeywords(concept);

  const slots = await prisma.workspaceSlot.findMany({
    where: { memoryId: { not: null }, pinned: true },
    include: { memory: { select: { id: true, content: true, category: true } } },
  });

  const matchingSlot = slots.find((s) =>
    (s.conceptLabel && contentMatchesKeywords(s.conceptLabel, keywords)) ||
    (s.memory && contentMatchesKeywords(s.memory.content, keywords))
  );

  if (!matchingSlot) {
    throw new Error(`No pinned workspace slot matches concept "${concept}"`);
  }

  await prisma.workspaceSlot.update({
    where: { id: matchingSlot.id },
    data: { pinned: false, activatedAt: new Date() },
  });

  return { slotPosition: matchingSlot.position };
}

// ─── Signal Logging ──────────────────────────────────────────────────────────

export async function logSignal(input: ActivitySignalInput): Promise<string> {
  const record = await prisma.activitySignal.create({
    data: {
      type: input.type,
      keywords: JSON.stringify(input.keywords),
      categories: JSON.stringify(input.categories),
      sourceType: input.sourceType,
    },
  });
  return record.id;
}

// ─── Batch Scoring ───────────────────────────────────────────────────────────

export async function scoreBatch(): Promise<{ loaded: number; evicted: number }> {
  const config = DEFAULT_JLENS_CONFIG;

  // 1. Consume unprocessed signals
  const signals = await prisma.activitySignal.findMany({
    where: { processed: false },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  if (signals.length === 0) return { loaded: 0, evicted: 0 };

  // Aggregate keywords and categories from signals
  const allKeywords: string[] = [];
  const allCategories: string[] = [];
  for (const sig of signals) {
    try { allKeywords.push(...JSON.parse(sig.keywords)); } catch { /* skip */ }
    try { allCategories.push(...JSON.parse(sig.categories)); } catch { /* skip */ }
  }
  const uniqueKeywords = [...new Set(allKeywords)];
  const categorySet = new Set(allCategories);

  // 2. Decay existing slots
  const { evicted: decayEvicted } = await decayAllSlots();

  // 3. Score background memories
  const now = new Date();
  const backgroundMemories = await prisma.memory.findMany({
    where: {
      status: "active",
      tier: "background",
      sensitive: false,
      OR: [
        { suppressedUntil: null },
        { suppressedUntil: { lt: now } },
      ],
    },
    select: {
      id: true,
      content: true,
      category: true,
      confidence: true,
      referenceCount: true,
      lastReferencedAt: true,
    },
  });

  const w = config.weights;
  const scored = backgroundMemories.map((mem) => {
    const memKeywords = extractKeywords(mem.content);
    const overlap = uniqueKeywords.filter((kw) => memKeywords.includes(kw)).length;
    const keywordScore = uniqueKeywords.length > 0 ? overlap / uniqueKeywords.length : 0;

    const catMatch = categorySet.has(mem.category) ? 1 : 0;

    const daysSinceRef = (now.getTime() - mem.lastReferencedAt.getTime()) / (1000 * 60 * 60 * 24);
    const recency = Math.exp(-0.099 * daysSinceRef); // 7-day half-life for recency

    const score =
      w.keywordOverlap * keywordScore +
      w.categoryMatch * catMatch +
      w.recencyBoost * recency;

    return { memoryId: mem.id, content: mem.content, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // 4. Compare top candidates against weakest workspace slots
  const slots = await prisma.workspaceSlot.findMany({
    orderBy: { loading: "asc" },
  });

  let loaded = 0;
  for (const candidate of scored.slice(0, 5)) {
    if (candidate.score < 0.1) break;

    const emptySlot = slots.find((s) => s.memoryId === null);
    const weakestSlot = slots.find((s) => !s.pinned && s.memoryId !== null && s.loading < candidate.score);
    const targetSlot = emptySlot ?? weakestSlot;

    if (!targetSlot) break;

    // Evict if occupied
    if (targetSlot.memoryId) {
      await prisma.memory.update({
        where: { id: targetSlot.memoryId },
        data: { tier: "background" },
      });
    }

    const label = candidate.content.slice(0, 60);
    await prisma.workspaceSlot.update({
      where: { id: targetSlot.id },
      data: {
        memoryId: candidate.memoryId,
        conceptLabel: label,
        loading: Math.min(1.0, candidate.score + 0.5),
        sourceSignal: "sync",
        activatedAt: now,
        loadedAt: now,
      },
    });

    await prisma.memory.update({
      where: { id: candidate.memoryId },
      data: { tier: "workspace" },
    });

    // Remove from available slots
    const idx = slots.indexOf(targetSlot);
    if (idx >= 0) slots.splice(idx, 1);

    loaded++;
  }

  // 5. Mark signals as processed
  await prisma.activitySignal.updateMany({
    where: { id: { in: signals.map((s) => s.id) } },
    data: { processed: true },
  });

  return { loaded, evicted: decayEvicted };
}

// ─── Cold Start ──────────────────────────────────────────────────────────────

export async function coldStart(): Promise<number> {
  const topMemories = await prisma.memory.findMany({
    where: { status: "active", sensitive: false },
    orderBy: [{ confidence: "desc" }, { lastReferencedAt: "desc" }],
    take: 20,
    select: { id: true, content: true, category: true, confidence: true },
  });

  const emptySlots = await prisma.workspaceSlot.findMany({
    where: { memoryId: null },
    orderBy: { position: "asc" },
  });

  let loaded = 0;
  for (let i = 0; i < Math.min(topMemories.length, emptySlots.length); i++) {
    const mem = topMemories[i];
    const slot = emptySlots[i];
    const label = mem.content.slice(0, 60);

    await prisma.workspaceSlot.update({
      where: { id: slot.id },
      data: {
        memoryId: mem.id,
        conceptLabel: label,
        loading: 0.5 + mem.confidence * 0.5,
        sourceSignal: "sync",
        activatedAt: new Date(),
        loadedAt: new Date(),
      },
    });

    await prisma.memory.update({
      where: { id: mem.id },
      data: { tier: "workspace" },
    });

    loaded++;
  }

  return loaded;
}

// ─── Workspace Response ──────────────────────────────────────────────────────

export async function getWorkspaceResponse(): Promise<WorkspaceResponse> {
  const slots = await prisma.workspaceSlot.findMany({
    include: { memory: { select: { id: true, content: true, category: true } } },
    orderBy: { position: "asc" },
  });

  const occupiedSlots = slots
    .filter((s) => s.memoryId !== null && s.memory)
    .map((s) => ({
      position: s.position,
      memoryId: s.memoryId,
      conceptLabel: s.conceptLabel,
      loading: s.loading,
      pinned: s.pinned,
      sourceSignal: s.sourceSignal as "activity" | "explicit" | "query" | "sync",
      activatedAt: s.activatedAt.toISOString(),
      memories: s.memory ? [s.memory.content] : [],
    }));

  return {
    slots: occupiedSlots,
    capacity: { used: occupiedSlots.length, total: 20 },
    lastUpdated: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/services/j-lens.test.ts`
Expected: All tests pass

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 6: Commit**

```bash
git add src/services/j-lens.ts __tests__/services/j-lens.test.ts
git commit -m "feat(j-space): add J-Lens service — decay, scoring, directed modulation"
```

---

### Task 4: MCP Server — Workspace-first tools replacing category tools

**Files:**
- Modify: `src/mcp/cortex-server.ts`
- Modify: `__tests__/mcp/cortex-server.test.ts`

**Interfaces:**
- Consumes: `getWorkspaceResponse()`, `reinforceSlots()`, `holdInMind()`, `suppress()`, `release()`, `logSignal()`, `decayAllSlots()` from Task 3
- Produces: MCP tools `cortex_get_workspace` (replaces old workspace + category tools), `cortex_search_background`, `cortex_hold_in_mind`, `cortex_suppress`, `cortex_release`, `cortex_log_signal`

- [ ] **Step 1: Write failing test for new MCP tools**

Add to `__tests__/mcp/cortex-server.test.ts` (or create if needed). This test validates the new tool registrations exist. The exact test structure depends on the existing test file — add a new `describe` block:

```typescript
// At the top, add mock for j-lens
vi.mock("@/services/j-lens", () => ({
  getWorkspaceResponse: vi.fn().mockResolvedValue({
    slots: [],
    capacity: { used: 0, total: 20 },
    lastUpdated: new Date().toISOString(),
  }),
  reinforceSlots: vi.fn().mockResolvedValue(0),
  holdInMind: vi.fn().mockResolvedValue({ slotPosition: 0, conceptLabel: "test" }),
  suppress: vi.fn().mockResolvedValue({ evictedSlot: 0, suppressedUntil: new Date().toISOString() }),
  release: vi.fn().mockResolvedValue({ slotPosition: 0 }),
  logSignal: vi.fn().mockResolvedValue("sig-1"),
  decayAllSlots: vi.fn().mockResolvedValue({ decayed: 0, evicted: 0 }),
}));
```

The test should verify:
- `cortex_get_workspace` tool exists and returns workspace response format
- `cortex_search_background` tool exists and searches background memories
- `cortex_hold_in_mind` tool exists and calls `holdInMind()`
- `cortex_suppress` tool exists and calls `suppress()`
- `cortex_release` tool exists and calls `release()`
- `cortex_log_signal` tool exists and calls `logSignal()`

- [ ] **Step 2: Replace MCP server tool registrations**

In `src/mcp/cortex-server.ts`, replace the category tool loop and update the workspace tools:

1. Remove the `for (const config of CATEGORY_MEMORY_TOOL_LIST)` loop that registers per-category tools
2. Replace the existing `cortex_get_workspace` tool with one that calls `getWorkspaceResponse()` from j-lens (with `decayAllSlots()` first)
3. Add `cortex_search_background` tool — keyword search on `tier: "background"` memories
4. Replace `cortex_steer_workspace` with `cortex_hold_in_mind`, `cortex_suppress`, `cortex_release` tools
5. Replace `cortex_log_context` and `cortex_save_conversation` with `cortex_log_signal` (keep save_conversation but add signal logging inside it)
6. Keep `cortex_get_memories`, `cortex_get_context`, `cortex_search_memories`, `cortex_get_relevant_memories`, `cortex_answer_personal_question`, `cortex_get_memory_map` as they are — they still serve a purpose for deep queries

Add imports at the top of `cortex-server.ts`:
```typescript
import {
  getWorkspaceResponse,
  reinforceSlots,
  holdInMind,
  suppress,
  release,
  logSignal,
  decayAllSlots,
} from "@/services/j-lens";
```

New tool registrations to add:

```typescript
  // ─── J-Space Workspace Tools ───────────────────────────────────────────────

  server.tool(
    "cortex_get_workspace",
    "Get the user's active workspace — a capacity-constrained set of concepts they're currently thinking about. Call this at the start of every conversation for context. Returns workspace slots with loading scores, concept labels, and associated memories.",
    {},
    async () => {
      await decayAllSlots();
      const workspace = await getWorkspaceResponse();
      const lines: string[] = [
        `Workspace: ${workspace.capacity.used}/${workspace.capacity.total} slots occupied`,
        "",
      ];
      for (const slot of workspace.slots) {
        const pin = slot.pinned ? " [pinned]" : "";
        const loading = `${Math.round(slot.loading * 100)}%`;
        lines.push(`Slot ${slot.position}: ${slot.conceptLabel ?? "unnamed"} (${loading}${pin})`);
        for (const mem of slot.memories) {
          lines.push(`  - ${mem}`);
        }
      }
      if (workspace.slots.length === 0) {
        lines.push("Workspace is empty. The user may not have synced any sources yet.");
      }
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  server.tool(
    "cortex_search_background",
    "Search the user's background memories — facts not currently in the active workspace. Use this when you need context beyond what the workspace provides.",
    {
      query: z.string().describe("Search query to match against background memory content"),
    },
    async ({ query }) => {
      const memories = await prisma.memory.findMany({
        where: { status: "active", tier: "background", content: { contains: query } },
        select: { content: true, category: true, confidence: true },
        take: 20,
      });
      if (memories.length === 0) {
        return { content: [{ type: "text" as const, text: `No background memories match "${query}".` }] };
      }
      const lines = memories.map(
        (m) => `- [${m.category}] ${m.content} (confidence: ${Math.round(m.confidence * 100)}%)`
      );
      return {
        content: [{ type: "text" as const, text: `Background memories matching "${query}":\n\n${lines.join("\n")}` }],
      };
    }
  );

  server.tool(
    "cortex_hold_in_mind",
    "Pin a concept to the workspace — it stays loaded at full strength until released. Use when the user says to remember, focus on, or keep something in mind.",
    {
      concept: z.string().describe("The concept to hold in mind, e.g. 'Ian meeting prep'"),
    },
    async ({ concept }) => {
      try {
        const result = await holdInMind(concept);
        return {
          content: [{ type: "text" as const, text: `Pinned "${result.conceptLabel}" to workspace slot ${result.slotPosition}. It will stay loaded until released.` }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Could not hold in mind: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cortex_suppress",
    "Suppress a concept — evict it from the workspace and block re-loading for a duration. Use when the user wants to stop thinking about something.",
    {
      concept: z.string().describe("The concept to suppress"),
      duration_hours: z.number().optional().describe("Hours to suppress. Default 24."),
    },
    async ({ concept, duration_hours }) => {
      try {
        const result = await suppress(concept, duration_hours ?? 24);
        return {
          content: [{ type: "text" as const, text: `Suppressed slot ${result.evictedSlot}. Blocked until ${result.suppressedUntil}.` }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Could not suppress: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cortex_release",
    "Release a pinned concept — unpin it so it resumes natural decay. Use when the user is done focusing on something.",
    {
      concept: z.string().describe("The concept to release"),
    },
    async ({ concept }) => {
      try {
        const result = await release(concept);
        return {
          content: [{ type: "text" as const, text: `Released slot ${result.slotPosition}. It will now decay naturally.` }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: `Could not release: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cortex_log_signal",
    "Log an activity signal — tells Cortex what the user is working on so the workspace can adapt. Call this when the conversation touches on a specific topic.",
    {
      keywords: z.array(z.string()).describe("Keywords describing the current activity"),
      categories: z.array(z.string()).optional().describe("Memory categories being touched"),
      source: z.string().optional().describe("Which AI tool is logging this signal"),
    },
    async ({ keywords, categories, source }) => {
      await logSignal({
        type: "mcp_query",
        keywords,
        categories: categories ?? [],
        sourceType: source,
      });
      const boosted = await reinforceSlots(keywords);
      return {
        content: [{ type: "text" as const, text: `Signal logged. ${boosted} workspace slot(s) reinforced.` }],
      };
    }
  );
```

- [ ] **Step 3: Remove the per-category tool loop**

Delete the `for (const config of CATEGORY_MEMORY_TOOL_LIST)` block and the `cortex_steer_workspace` tool registration. Keep the import of `CATEGORY_MEMORY_TOOL_LIST` if it's used elsewhere (e.g., in `cortex_get_memory_map`).

- [ ] **Step 4: Run MCP tests**

Run: `npx vitest run __tests__/mcp/cortex-server.test.ts`
Expected: Tests pass (some existing tests may need updating for removed tools)

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: No regressions in other test files

- [ ] **Step 6: Commit**

```bash
git add src/mcp/cortex-server.ts __tests__/mcp/cortex-server.test.ts
git commit -m "feat(j-space): workspace-first MCP tools — hold/suppress/release/signal"
```

---

### Task 5: Pipeline Integration — J-Lens batch run after commit

**Files:**
- Modify: `src/pipeline/run.ts`
- Test: `__tests__/pipeline/run-jlens.test.ts`

**Interfaces:**
- Consumes: `scoreBatch()`, `logSignal()` from Task 3
- Produces: Updated `runPipeline()` that logs activity signals and triggers J-Lens batch after commit

- [ ] **Step 1: Write failing test for pipeline J-Lens integration**

Create `__tests__/pipeline/run-jlens.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/services/j-lens", () => ({
  logSignal: vi.fn().mockResolvedValue("sig-1"),
  scoreBatch: vi.fn().mockResolvedValue({ loaded: 2, evicted: 1 }),
}));

import { logSignal, scoreBatch } from "@/services/j-lens";

const mockedLogSignal = logSignal as unknown as ReturnType<typeof vi.fn>;
const mockedScoreBatch = scoreBatch as unknown as ReturnType<typeof vi.fn>;

describe("Pipeline J-Lens integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logSignal serializes keywords and categories correctly", async () => {
    await logSignal({
      type: "conversation_sync",
      keywords: ["webarena", "cold-start"],
      categories: ["projects", "research"],
      sourceType: "claude_code",
    });

    expect(mockedLogSignal).toHaveBeenCalledWith({
      type: "conversation_sync",
      keywords: ["webarena", "cold-start"],
      categories: ["projects", "research"],
      sourceType: "claude_code",
    });
  });

  it("scoreBatch returns load/evict counts", async () => {
    const result = await scoreBatch();
    expect(result.loaded).toBe(2);
    expect(result.evicted).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (mocked)**

Run: `npx vitest run __tests__/pipeline/run-jlens.test.ts`
Expected: PASS

- [ ] **Step 3: Add J-Lens batch call to pipeline run.ts**

In `src/pipeline/run.ts`, add import at top:

```typescript
import { logSignal, scoreBatch } from "@/services/j-lens";
```

After the `notifyMemoryChange` call (around line 206-209), add:

```typescript
    // ── J-Lens: log activity signal and run batch scoring ─────────────────
    try {
      const extractedCategories = [...new Set(allMemories.map((m) => m.category))];
      const extractedKeywords = allMemories
        .flatMap((m) => m.content.toLowerCase().split(/\s+/).filter((w) => w.length >= 4))
        .slice(0, 20);

      await logSignal({
        type: "conversation_sync",
        keywords: [...new Set(extractedKeywords)],
        categories: extractedCategories,
        sourceType: input.sourceType,
      });

      await scoreBatch();
    } catch (jlensError) {
      // J-Lens failure is non-fatal — workspace stays stale, memories are safe
      console.warn("J-Lens batch failed (non-fatal):", jlensError);
    }
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All pass — J-Lens calls are isolated in try/catch

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/run.ts __tests__/pipeline/run-jlens.test.ts
git commit -m "feat(j-space): trigger J-Lens batch scoring after pipeline commit"
```

---

### Task 6: Workspace API Route — HTTP endpoint for the UI

**Files:**
- Modify: `src/app/api/workspace/route.ts`
- Test: `__tests__/app/api/workspace/route.test.ts`

**Interfaces:**
- Consumes: `getWorkspaceResponse()`, `holdInMind()`, `suppress()`, `release()`, `decayAllSlots()`, `seedWorkspaceSlots()` from Tasks 1, 3
- Produces: `GET /api/workspace` (returns workspace state), `POST /api/workspace` (modulation actions: hold, suppress, release, seed)

- [ ] **Step 1: Read the existing workspace route**

Read `src/app/api/workspace/route.ts` to understand the current implementation.

- [ ] **Step 2: Write failing test for new workspace API**

Create `__tests__/app/api/workspace/route.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/services/j-lens", () => ({
  getWorkspaceResponse: vi.fn().mockResolvedValue({
    slots: [
      {
        position: 0,
        memoryId: "mem-1",
        conceptLabel: "test concept",
        loading: 0.9,
        pinned: false,
        sourceSignal: "activity",
        activatedAt: "2026-07-12T10:00:00Z",
        memories: ["test memory"],
      },
    ],
    capacity: { used: 1, total: 20 },
    lastUpdated: "2026-07-12T14:00:00Z",
  }),
  holdInMind: vi.fn().mockResolvedValue({ slotPosition: 0, conceptLabel: "test" }),
  suppress: vi.fn().mockResolvedValue({ evictedSlot: 0, suppressedUntil: "2026-07-13T10:00:00Z" }),
  release: vi.fn().mockResolvedValue({ slotPosition: 0 }),
  decayAllSlots: vi.fn().mockResolvedValue({ decayed: 0, evicted: 0 }),
}));

vi.mock("@/lib/seed-workspace", () => ({
  seedWorkspaceSlots: vi.fn().mockResolvedValue(20),
}));

import { GET, POST } from "@/app/api/workspace/route";
import { getWorkspaceResponse, holdInMind, suppress, release } from "@/services/j-lens";

describe("GET /api/workspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns workspace state", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.slots).toHaveLength(1);
    expect(data.capacity.used).toBe(1);
    expect(data.capacity.total).toBe(20);
  });
});

describe("POST /api/workspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("handles hold action", async () => {
    const request = new Request("http://localhost/api/workspace", {
      method: "POST",
      body: JSON.stringify({ action: "hold", concept: "test concept" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    const data = await response.json();
    expect(data.slotPosition).toBe(0);
    expect(holdInMind).toHaveBeenCalledWith("test concept");
  });

  it("handles suppress action", async () => {
    const request = new Request("http://localhost/api/workspace", {
      method: "POST",
      body: JSON.stringify({ action: "suppress", concept: "guitar", durationHours: 48 }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(suppress).toHaveBeenCalledWith("guitar", 48);
  });

  it("handles release action", async () => {
    const request = new Request("http://localhost/api/workspace", {
      method: "POST",
      body: JSON.stringify({ action: "release", concept: "Ian meeting" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(release).toHaveBeenCalledWith("Ian meeting");
  });
});
```

- [ ] **Step 3: Implement the workspace API route**

Replace `src/app/api/workspace/route.ts`:

```typescript
import { NextResponse } from "next/server";
import {
  getWorkspaceResponse,
  holdInMind,
  suppress,
  release,
  decayAllSlots,
} from "@/services/j-lens";
import { seedWorkspaceSlots } from "@/lib/seed-workspace";

export async function GET() {
  try {
    await decayAllSlots();
    const workspace = await getWorkspaceResponse();
    return NextResponse.json(workspace);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get workspace" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, concept, durationHours } = body;

    switch (action) {
      case "hold": {
        const result = await holdInMind(concept);
        return NextResponse.json(result);
      }
      case "suppress": {
        const result = await suppress(concept, durationHours ?? 24);
        return NextResponse.json(result);
      }
      case "release": {
        const result = await release(concept);
        return NextResponse.json(result);
      }
      case "seed": {
        const created = await seedWorkspaceSlots();
        return NextResponse.json({ seeded: created });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workspace action failed" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/app/api/workspace/route.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/app/api/workspace/route.ts __tests__/app/api/workspace/route.test.ts
git commit -m "feat(j-space): workspace API route — GET state, POST hold/suppress/release"
```

---

### Task 7: Workspace Dashboard UI — Slot Ring + Decay Timeline

**Files:**
- Modify: `src/components/workspace-ring.tsx` (exists, needs rewrite)
- Create: `src/components/decay-timeline.tsx`
- Create: `src/components/workspace-slot-card.tsx`
- Modify: `src/app/dashboard/page.tsx`
- Create: `src/hooks/use-workspace.ts`

**Interfaces:**
- Consumes: `GET /api/workspace`, `POST /api/workspace` from Task 6
- Produces: React components for the workspace dashboard

- [ ] **Step 1: Create the workspace data hook**

Create `src/hooks/use-workspace.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import type { WorkspaceResponse } from "@/contracts/workspace";

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace");
      if (!res.ok) throw new Error(`Failed to fetch workspace: ${res.status}`);
      const data = await res.json();
      setWorkspace(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const holdInMind = async (concept: string) => {
    const res = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hold", concept }),
    });
    if (!res.ok) throw new Error("Failed to hold in mind");
    await fetchWorkspace();
  };

  const suppressConcept = async (concept: string, durationHours?: number) => {
    const res = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suppress", concept, durationHours }),
    });
    if (!res.ok) throw new Error("Failed to suppress");
    await fetchWorkspace();
  };

  const releaseConcept = async (concept: string) => {
    const res = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", concept }),
    });
    if (!res.ok) throw new Error("Failed to release");
    await fetchWorkspace();
  };

  return {
    workspace,
    loading,
    error,
    refresh: fetchWorkspace,
    holdInMind,
    suppressConcept,
    releaseConcept,
  };
}
```

- [ ] **Step 2: Create workspace slot card component**

Create `src/components/workspace-slot-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { WorkspaceSlotResponse } from "@/contracts/workspace";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface WorkspaceSlotCardProps {
  slot: WorkspaceSlotResponse;
  onHold: () => void;
  onSuppress: () => void;
  onRelease: () => void;
}

export function WorkspaceSlotCard({ slot, onHold, onSuppress, onRelease }: WorkspaceSlotCardProps) {
  const [expanded, setExpanded] = useState(false);
  const loadingPercent = Math.round(slot.loading * 100);

  const activatedAt = new Date(slot.activatedAt);
  const minutesAgo = Math.round((Date.now() - activatedAt.getTime()) / 60000);
  const timeLabel = minutesAgo < 60
    ? `${minutesAgo}m ago`
    : minutesAgo < 1440
      ? `${Math.round(minutesAgo / 60)}h ago`
      : `${Math.round(minutesAgo / 1440)}d ago`;

  return (
    <div
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-all hover:shadow-md cursor-pointer"
      style={{ opacity: 0.4 + slot.loading * 0.6 }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-stone-800 truncate">
          {slot.conceptLabel ?? "Unnamed concept"}
        </span>
        <div className="flex items-center gap-2">
          {slot.pinned && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">pinned</span>
          )}
          <span className="text-xs text-stone-400">{timeLabel}</span>
        </div>
      </div>

      <Progress value={loadingPercent} className="h-1.5 mb-2" />

      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-400">{loadingPercent}% loaded</span>
        <span className="text-xs text-stone-400">slot {slot.position}</span>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-stone-100">
          <div className="space-y-1 mb-3">
            {slot.memories.map((mem, i) => (
              <p key={i} className="text-xs text-stone-600">{mem}</p>
            ))}
          </div>
          <div className="flex gap-2">
            {slot.pinned ? (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onRelease(); }}>
                Release
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onHold(); }}>
                Hold in mind
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSuppress(); }}>
              Suppress
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create decay timeline component**

Create `src/components/decay-timeline.tsx`:

```tsx
"use client";

import type { WorkspaceSlotResponse } from "@/contracts/workspace";

interface DecayTimelineProps {
  slots: WorkspaceSlotResponse[];
}

function estimateEvictionDays(loading: number, decayRate: number): number {
  // Time until loading drops below 0.15
  // loading * e^(-rate * t) = 0.15
  // t = -ln(0.15 / loading) / rate
  if (loading <= 0.15) return 0;
  const rate = decayRate || 0.0000688;
  const minutes = -Math.log(0.15 / loading) / rate;
  return minutes / (60 * 24);
}

export function DecayTimeline({ slots }: DecayTimelineProps) {
  const unpinnedSlots = slots
    .filter((s) => !s.pinned)
    .map((s) => ({
      ...s,
      evictionDays: estimateEvictionDays(s.loading, 0.0000688),
    }))
    .sort((a, b) => a.evictionDays - b.evictionDays);

  if (unpinnedSlots.length === 0) return null;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-stone-600 mb-3">Projected Evictions</h3>
      <div className="space-y-2">
        {unpinnedSlots.slice(0, 5).map((slot) => {
          const days = slot.evictionDays;
          const label = days < 1
            ? `${Math.round(days * 24)}h`
            : `${Math.round(days)}d`;

          return (
            <div key={slot.position} className="flex items-center justify-between">
              <span className="text-xs text-stone-600 truncate max-w-[200px]">
                {slot.conceptLabel ?? "Unnamed"}
              </span>
              <span className="text-xs text-stone-400">
                evicts in ~{label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite workspace-ring.tsx**

Replace `src/components/workspace-ring.tsx` with a ring visualization:

```tsx
"use client";

import type { WorkspaceSlotResponse } from "@/contracts/workspace";

interface WorkspaceRingProps {
  slots: WorkspaceSlotResponse[];
  capacity: number;
  onSlotClick?: (slot: WorkspaceSlotResponse) => void;
}

export function WorkspaceRing({ slots, capacity, onSlotClick }: WorkspaceRingProps) {
  const totalSlots = capacity;
  const radius = 140;
  const centerX = 180;
  const centerY = 180;

  // Build a map of position -> slot
  const slotMap = new Map(slots.map((s) => [s.position, s]));

  const allPositions = Array.from({ length: totalSlots }, (_, i) => i);

  return (
    <div className="flex items-center justify-center">
      <svg width={360} height={360} viewBox="0 0 360 360">
        {/* Ring background */}
        <circle
          cx={centerX}
          cy={centerY}
          r={radius}
          fill="none"
          stroke="#e7e5e4"
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Slot nodes */}
        {allPositions.map((pos) => {
          const angle = (pos / totalSlots) * 2 * Math.PI - Math.PI / 2;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          const slot = slotMap.get(pos);

          if (!slot) {
            // Empty slot
            return (
              <circle
                key={pos}
                cx={x}
                cy={y}
                r={6}
                fill="none"
                stroke="#d6d3d1"
                strokeWidth={1}
              />
            );
          }

          const nodeRadius = 8 + slot.loading * 12;
          const opacity = 0.4 + slot.loading * 0.6;

          return (
            <g
              key={pos}
              onClick={() => onSlotClick?.(slot)}
              className="cursor-pointer"
            >
              <circle
                cx={x}
                cy={y}
                r={nodeRadius}
                fill={slot.pinned ? "#f59e0b" : "#84cc16"}
                opacity={opacity}
                stroke={slot.pinned ? "#d97706" : "#65a30d"}
                strokeWidth={1.5}
              />
              {slot.pinned && (
                <text
                  x={x}
                  y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={8}
                  fill="#fff"
                >
                  P
                </text>
              )}
            </g>
          );
        })}

        {/* Center text */}
        <text
          x={centerX}
          y={centerY - 8}
          textAnchor="middle"
          className="fill-stone-700 text-2xl font-semibold"
          fontSize={28}
        >
          {slots.length}
        </text>
        <text
          x={centerX}
          y={centerY + 14}
          textAnchor="middle"
          className="fill-stone-400 text-xs"
          fontSize={12}
        >
          / {capacity} slots
        </text>
      </svg>
    </div>
  );
}
```

- [ ] **Step 5: Update dashboard page to use workspace components**

Modify `src/app/dashboard/page.tsx` — add workspace section. Read the current file first, then add workspace components to the top of the page content:

```tsx
// Add imports
import { useWorkspace } from "@/hooks/use-workspace";
import { WorkspaceRing } from "@/components/workspace-ring";
import { WorkspaceSlotCard } from "@/components/workspace-slot-card";
import { DecayTimeline } from "@/components/decay-timeline";
```

Add workspace section to the dashboard layout (above existing content):

```tsx
const { workspace, loading: wsLoading, holdInMind, suppressConcept, releaseConcept } = useWorkspace();

// In the JSX:
{workspace && (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1">
        <WorkspaceRing
          slots={workspace.slots}
          capacity={workspace.capacity.total}
        />
      </div>
      <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {workspace.slots.map((slot) => (
          <WorkspaceSlotCard
            key={slot.position}
            slot={slot}
            onHold={() => holdInMind(slot.conceptLabel ?? "")}
            onSuppress={() => suppressConcept(slot.conceptLabel ?? "")}
            onRelease={() => releaseConcept(slot.conceptLabel ?? "")}
          />
        ))}
      </div>
    </div>
    <DecayTimeline slots={workspace.slots} />
  </div>
)}
```

- [ ] **Step 6: Verify UI renders**

Run: `npm run dev`
Navigate to `http://localhost:3000/dashboard`
Expected: Workspace ring visible, slot cards rendered (may be empty if no workspace data yet)

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-workspace.ts src/components/workspace-ring.tsx src/components/workspace-slot-card.tsx src/components/decay-timeline.tsx src/app/dashboard/page.tsx
git commit -m "feat(j-space): workspace dashboard UI — slot ring, decay timeline, modulation controls"
```

---

### Task 8: Exporter Update — Workspace-first propagation

**Files:**
- Modify: `src/services/propagate.ts`
- Modify: `src/exporters/claude.ts`
- Test: `__tests__/services/propagate.test.ts` (update existing)

**Interfaces:**
- Consumes: `getWorkspaceResponse()` from Task 3
- Produces: Updated `propagateToAllPlatforms()` that exports workspace slots instead of full memory library

- [ ] **Step 1: Write failing test for workspace-based propagation**

Add to `__tests__/services/propagate.test.ts`:

```typescript
// Add j-lens mock at top
vi.mock("@/services/j-lens", () => ({
  getWorkspaceResponse: vi.fn().mockResolvedValue({
    slots: [
      {
        position: 0,
        memoryId: "mem-1",
        conceptLabel: "test concept",
        loading: 0.9,
        pinned: false,
        sourceSignal: "activity",
        activatedAt: "2026-07-12T10:00:00Z",
        memories: ["Test memory content"],
      },
    ],
    capacity: { used: 1, total: 20 },
    lastUpdated: "2026-07-12T14:00:00Z",
  }),
}));
```

Add a test case:

```typescript
it("exports workspace slots instead of full memory library", async () => {
  // ... setup mocks
  // Verify that the exported content includes workspace slot data
  // and not a full category-grouped memory dump
});
```

- [ ] **Step 2: Update propagate.ts to export workspace**

In `src/services/propagate.ts`, add import:

```typescript
import { getWorkspaceResponse } from "@/services/j-lens";
```

In `propagateToAllPlatforms()`, after fetching memories, also fetch workspace:

```typescript
  // Fetch workspace for workspace-first exports
  let workspaceMemories: typeof memories = [];
  try {
    const workspace = await getWorkspaceResponse();
    const workspaceMemoryContents = new Set(
      workspace.slots.flatMap((s) => s.memories)
    );
    workspaceMemories = memories.filter((m) => workspaceMemoryContents.has(m.content));
  } catch {
    // Fall back to full memory list if workspace unavailable
    workspaceMemories = memories;
  }
```

Then use `workspaceMemories` instead of `memories` when calling `writeClaudeExport`, `pushToPoke`, and `formatForChatGPT`.

- [ ] **Step 3: Update Claude exporter to use "Current Workspace" heading**

In `src/exporters/claude.ts`, update the section heading from categorized groups to a single "Current Workspace" section when workspace memories are provided.

- [ ] **Step 4: Run propagation tests**

Run: `npx vitest run __tests__/services/propagate.test.ts`
Expected: All pass

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 6: Commit**

```bash
git add src/services/propagate.ts src/exporters/claude.ts __tests__/services/propagate.test.ts
git commit -m "feat(j-space): workspace-first propagation — export active slots, not full library"
```

---

### Task 9: Scheduled Decay Tick + Cold Start initialization

**Files:**
- Create: `src/lib/workspace-tick.ts`
- Modify: `src/app/api/workspace/route.ts` (add tick endpoint)
- Test: `__tests__/lib/workspace-tick.test.ts`

**Interfaces:**
- Consumes: `decayAllSlots()`, `scoreBatch()`, `coldStart()`, `seedWorkspaceSlots()` from Tasks 1, 3
- Produces: `runWorkspaceTick()` — callable via cron or manual trigger, `initializeWorkspace()` — first-run setup

- [ ] **Step 1: Write failing test**

Create `__tests__/lib/workspace-tick.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceSlot: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/seed-workspace", () => ({
  seedWorkspaceSlots: vi.fn().mockResolvedValue(20),
}));

vi.mock("@/services/j-lens", () => ({
  decayAllSlots: vi.fn().mockResolvedValue({ decayed: 3, evicted: 1 }),
  scoreBatch: vi.fn().mockResolvedValue({ loaded: 2, evicted: 0 }),
  coldStart: vi.fn().mockResolvedValue(15),
}));

import { runWorkspaceTick, initializeWorkspace } from "@/lib/workspace-tick";
import { prisma } from "@/lib/db";
import { seedWorkspaceSlots } from "@/lib/seed-workspace";
import { decayAllSlots, scoreBatch, coldStart } from "@/services/j-lens";

const mockedSlotCount = prisma.workspaceSlot.count as unknown as ReturnType<typeof vi.fn>;
const mockedSlotFindMany = prisma.workspaceSlot.findMany as unknown as ReturnType<typeof vi.fn>;

describe("workspace-tick", () => {
  beforeEach(() => vi.clearAllMocks());

  it("runWorkspaceTick decays and scores", async () => {
    const result = await runWorkspaceTick();
    expect(decayAllSlots).toHaveBeenCalled();
    expect(scoreBatch).toHaveBeenCalled();
    expect(result.decayed).toBe(3);
    expect(result.evicted).toBe(1);
    expect(result.loaded).toBe(2);
  });

  it("initializeWorkspace seeds slots and runs cold start", async () => {
    mockedSlotCount.mockResolvedValue(0);
    mockedSlotFindMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ position: i, memoryId: null }))
    );

    const result = await initializeWorkspace();
    expect(seedWorkspaceSlots).toHaveBeenCalled();
    expect(coldStart).toHaveBeenCalled();
    expect(result.slotsSeeded).toBe(20);
    expect(result.memoriesLoaded).toBe(15);
  });

  it("initializeWorkspace skips cold start when slots are occupied", async () => {
    mockedSlotCount.mockResolvedValue(20);
    mockedSlotFindMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ position: i, memoryId: i < 10 ? `mem-${i}` : null }))
    );

    const result = await initializeWorkspace();
    expect(seedWorkspaceSlots).toHaveBeenCalled();
    expect(coldStart).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/workspace-tick.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement workspace-tick.ts**

Create `src/lib/workspace-tick.ts`:

```typescript
import { prisma } from "@/lib/db";
import { seedWorkspaceSlots } from "@/lib/seed-workspace";
import { decayAllSlots, scoreBatch, coldStart } from "@/services/j-lens";

export async function runWorkspaceTick(): Promise<{
  decayed: number;
  evicted: number;
  loaded: number;
}> {
  const decay = await decayAllSlots();
  const batch = await scoreBatch();
  return {
    decayed: decay.decayed,
    evicted: decay.evicted + batch.evicted,
    loaded: batch.loaded,
  };
}

export async function initializeWorkspace(): Promise<{
  slotsSeeded: number;
  memoriesLoaded: number;
}> {
  const slotsSeeded = await seedWorkspaceSlots();

  // Check if any slots are already occupied
  const occupiedSlots = await prisma.workspaceSlot.findMany({
    where: { memoryId: { not: null } },
  });

  let memoriesLoaded = 0;
  if (occupiedSlots.length === 0) {
    memoriesLoaded = await coldStart();
  }

  return { slotsSeeded, memoriesLoaded };
}
```

- [ ] **Step 4: Add tick and init endpoints to workspace route**

In `src/app/api/workspace/route.ts`, add to the POST switch:

```typescript
      case "tick": {
        const { runWorkspaceTick } = await import("@/lib/workspace-tick");
        const result = await runWorkspaceTick();
        return NextResponse.json(result);
      }
      case "init": {
        const { initializeWorkspace } = await import("@/lib/workspace-tick");
        const result = await initializeWorkspace();
        return NextResponse.json(result);
      }
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run __tests__/lib/workspace-tick.test.ts`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/workspace-tick.ts src/app/api/workspace/route.ts __tests__/lib/workspace-tick.test.ts
git commit -m "feat(j-space): workspace tick (decay + batch) and cold start initialization"
```

---

### Task 10: Integration Test — Full J-Space flow end-to-end

**Files:**
- Create: `__tests__/integration/j-space-flow.test.ts`

**Interfaces:**
- Consumes: All previous tasks
- Produces: Confidence that the full flow works: signal → J-Lens → workspace → MCP → modulation

- [ ] **Step 1: Write integration test**

Create `__tests__/integration/j-space-flow.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceSlot: {
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    memory: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    activitySignal: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { logSignal, reinforceSlots, holdInMind, suppress, release, getWorkspaceResponse } from "@/services/j-lens";
import { prisma } from "@/lib/db";

const mockSlotFindMany = prisma.workspaceSlot.findMany as unknown as ReturnType<typeof vi.fn>;
const mockSlotUpdate = prisma.workspaceSlot.update as unknown as ReturnType<typeof vi.fn>;
const mockMemoryFindMany = prisma.memory.findMany as unknown as ReturnType<typeof vi.fn>;
const mockMemoryUpdate = prisma.memory.update as unknown as ReturnType<typeof vi.fn>;
const mockSignalCreate = prisma.activitySignal.create as unknown as ReturnType<typeof vi.fn>;

describe("J-Space end-to-end flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlotUpdate.mockResolvedValue({});
    mockMemoryUpdate.mockResolvedValue({});
  });

  it("full workflow: signal → reinforce → hold → release → suppress", async () => {
    // 1. Log a signal
    mockSignalCreate.mockResolvedValue({ id: "sig-1" });
    const signalId = await logSignal({
      type: "mcp_query",
      keywords: ["webarena", "cold-start"],
      categories: ["projects"],
    });
    expect(signalId).toBe("sig-1");

    // 2. Reinforce matching slots
    mockSlotFindMany.mockResolvedValue([
      {
        id: "slot-0",
        position: 0,
        memoryId: "mem-1",
        conceptLabel: "cold-start research",
        loading: 0.6,
        pinned: false,
        sourceSignal: "activity",
        activatedAt: new Date(),
        memory: { id: "mem-1", content: "WebArena cold-start experiments", category: "projects" },
      },
    ]);
    const boosted = await reinforceSlots(["webarena"]);
    expect(boosted).toBe(1);

    // 3. Hold a concept in mind
    mockMemoryFindMany.mockResolvedValue([
      { id: "mem-5", content: "Ian meeting agenda items", category: "projects", confidence: 0.9 },
    ]);
    mockSlotFindMany.mockResolvedValue([
      { id: "slot-5", position: 5, memoryId: null, loading: 0 },
    ]);
    const held = await holdInMind("Ian meeting");
    expect(held.slotPosition).toBe(5);

    // 4. Release it
    mockSlotFindMany.mockResolvedValue([
      {
        id: "slot-5",
        position: 5,
        memoryId: "mem-5",
        conceptLabel: "Ian meeting",
        loading: 1.0,
        pinned: true,
        memory: { id: "mem-5", content: "Ian meeting agenda items", category: "projects" },
      },
    ]);
    const released = await release("Ian meeting");
    expect(released.slotPosition).toBe(5);

    // 5. Suppress it
    mockSlotFindMany.mockResolvedValue([
      {
        id: "slot-5",
        position: 5,
        memoryId: "mem-5",
        conceptLabel: "Ian meeting",
        loading: 0.8,
        pinned: false,
        memory: { id: "mem-5", content: "Ian meeting agenda items", category: "projects" },
      },
    ]);
    const suppressed = await suppress("Ian meeting", 48);
    expect(suppressed.evictedSlot).toBe(5);

    // 6. Get workspace response
    mockSlotFindMany.mockResolvedValue([
      {
        id: "slot-0",
        position: 0,
        memoryId: "mem-1",
        conceptLabel: "cold-start research",
        loading: 0.8,
        pinned: false,
        sourceSignal: "activity",
        activatedAt: new Date(),
        loadedAt: new Date(),
        memory: { id: "mem-1", content: "WebArena cold-start experiments", category: "projects" },
      },
    ]);
    const workspace = await getWorkspaceResponse();
    expect(workspace.slots).toHaveLength(1);
    expect(workspace.slots[0].conceptLabel).toBe("cold-start research");
    expect(workspace.capacity.used).toBe(1);
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `npx vitest run __tests__/integration/j-space-flow.test.ts`
Expected: All pass

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add __tests__/integration/j-space-flow.test.ts
git commit -m "test(j-space): end-to-end integration test for workspace flow"
```

---

## Post-Implementation Verification

After all tasks are complete:

1. Run `npx vitest run` — all tests pass
2. Run `npm run dev` — dashboard loads with workspace ring
3. Run `POST /api/workspace { action: "init" }` — seeds slots and cold starts
4. Verify MCP tools via `npm run mcp` — `cortex_get_workspace`, `cortex_hold_in_mind`, `cortex_suppress`, `cortex_release`, `cortex_log_signal` all respond
5. Trigger a pipeline sync — verify J-Lens batch runs after commit
6. Check that existing pipeline tests still pass
