import { describe, expect, it, vi, beforeEach } from "vitest";

// ─── Prisma mocks ──────────────────────────────────────────────────────────

const workspaceSlotFindMany = vi.hoisted(() => vi.fn());
const workspaceSlotUpdate = vi.hoisted(() => vi.fn());
const workspaceSlotFindFirst = vi.hoisted(() => vi.fn());
const workspaceSlotCreate = vi.hoisted(() => vi.fn());
const memoryFindMany = vi.hoisted(() => vi.fn());
const memoryUpdate = vi.hoisted(() => vi.fn());
const activitySignalFindMany = vi.hoisted(() => vi.fn());
const activitySignalCreate = vi.hoisted(() => vi.fn());
const activitySignalUpdateMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    workspaceSlot: {
      findMany: workspaceSlotFindMany,
      update: workspaceSlotUpdate,
      findFirst: workspaceSlotFindFirst,
      create: workspaceSlotCreate,
    },
    memory: {
      findMany: memoryFindMany,
      update: memoryUpdate,
    },
    activitySignal: {
      findMany: activitySignalFindMany,
      create: activitySignalCreate,
      updateMany: activitySignalUpdateMany,
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

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeSlot(overrides: Record<string, unknown> = {}) {
  const memoryId = "memoryId" in overrides ? overrides.memoryId : "mem-1";
  const hasMemory = memoryId !== null;
  return {
    id: overrides.id ?? "slot-1",
    position: overrides.position ?? 0,
    memoryId,
    conceptLabel: "conceptLabel" in overrides ? overrides.conceptLabel : "test concept",
    loading: overrides.loading ?? 0.8,
    decayRate: overrides.decayRate ?? 0.05,
    pinned: overrides.pinned ?? false,
    sourceSignal: overrides.sourceSignal ?? "automatic",
    activatedAt: overrides.activatedAt ?? new Date("2026-07-12T00:00:00Z"),
    loadedAt: overrides.loadedAt ?? new Date("2026-07-12T00:00:00Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
    memory: "memory" in overrides
      ? overrides.memory
      : hasMemory
        ? {
            id: memoryId as string,
            content: (overrides.memoryContent as string) ?? "User builds Cortex project",
            category: (overrides.memoryCategory as string) ?? "projects",
          }
        : null,
  };
}

function makeMemory(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "mem-1",
    content: overrides.content ?? "User builds Cortex project",
    category: overrides.category ?? "projects",
    confidence: overrides.confidence ?? 0.9,
    referenceCount: overrides.referenceCount ?? 3,
    lastReferencedAt: overrides.lastReferencedAt ?? new Date("2026-07-12T00:00:00Z"),
    tier: overrides.tier ?? "background",
    suppressedUntil: overrides.suppressedUntil ?? null,
    status: overrides.status ?? "active",
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("decayAllSlots", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies exponential decay to occupied non-pinned slots", async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const slot = makeSlot({
      loading: 0.8,
      decayRate: 0.05,
      activatedAt: tenMinutesAgo,
      pinned: false,
    });
    workspaceSlotFindMany.mockResolvedValue([slot]);
    workspaceSlotUpdate.mockResolvedValue({});

    const result = await decayAllSlots();

    expect(workspaceSlotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          memoryId: { not: null },
          pinned: false,
        },
      })
    );
    expect(workspaceSlotUpdate).toHaveBeenCalled();
    expect(result.decayed).toBe(1);
    expect(result.evicted).toBe(0);
  });

  it("evicts slots that decay below threshold", async () => {
    // Very old activation: 2 hours ago with high decay rate
    const longAgo = new Date(Date.now() - 120 * 60 * 1000);
    const slot = makeSlot({
      loading: 0.2,
      decayRate: 0.1,
      activatedAt: longAgo,
      pinned: false,
      memoryId: "mem-evict",
    });
    workspaceSlotFindMany.mockResolvedValue([slot]);
    workspaceSlotUpdate.mockResolvedValue({});
    memoryUpdate.mockResolvedValue({});

    const result = await decayAllSlots();

    expect(result.evicted).toBe(1);
    // Should clear the slot
    expect(workspaceSlotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: slot.id },
        data: expect.objectContaining({
          memoryId: null,
          loading: 0,
          conceptLabel: null,
        }),
      })
    );
    // Should reset memory tier
    expect(memoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem-evict" },
        data: { tier: "background" },
      })
    );
  });

  it("skips pinned slots", async () => {
    // pinned: false filter is in the query, so findMany won't return pinned slots
    workspaceSlotFindMany.mockResolvedValue([]);

    const result = await decayAllSlots();

    expect(result.decayed).toBe(0);
    expect(result.evicted).toBe(0);
  });
});

describe("reinforceSlots", () => {
  beforeEach(() => vi.clearAllMocks());

  it("boosts matching slots by 0.2", async () => {
    const slot = makeSlot({
      loading: 0.5,
      memoryContent: "User builds Cortex project with Next.js",
      conceptLabel: "cortex",
    });
    workspaceSlotFindMany.mockResolvedValue([slot]);
    workspaceSlotUpdate.mockResolvedValue({});

    const boosted = await reinforceSlots(["cortex"]);

    expect(boosted).toBe(1);
    expect(workspaceSlotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: slot.id },
        data: expect.objectContaining({
          loading: 0.7,
        }),
      })
    );
  });

  it("caps loading at 1.0", async () => {
    const slot = makeSlot({
      loading: 0.9,
      memoryContent: "User builds Cortex",
      conceptLabel: "cortex",
    });
    workspaceSlotFindMany.mockResolvedValue([slot]);
    workspaceSlotUpdate.mockResolvedValue({});

    const boosted = await reinforceSlots(["cortex"]);

    expect(boosted).toBe(1);
    expect(workspaceSlotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loading: 1.0,
        }),
      })
    );
  });

  it("does not boost non-matching slots", async () => {
    const slot = makeSlot({
      memoryContent: "User likes turtles",
      conceptLabel: "animals",
    });
    workspaceSlotFindMany.mockResolvedValue([slot]);

    const boosted = await reinforceSlots(["cortex"]);

    expect(boosted).toBe(0);
    expect(workspaceSlotUpdate).not.toHaveBeenCalled();
  });
});

describe("holdInMind", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads matching memory into an empty slot and pins it", async () => {
    const memory = makeMemory({
      id: "mem-match",
      content: "User is building Cortex memory app",
    });
    memoryFindMany.mockResolvedValue([memory]);
    // Empty slot available
    workspaceSlotFindFirst.mockResolvedValue(
      makeSlot({ id: "slot-empty", position: 3, memoryId: null, loading: 0, memory: null })
    );
    workspaceSlotUpdate.mockResolvedValue({});
    memoryUpdate.mockResolvedValue({});

    const result = await holdInMind("cortex memory");

    expect(result.slotPosition).toBe(3);
    expect(result.conceptLabel).toBeDefined();
    expect(workspaceSlotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          memoryId: "mem-match",
          loading: 1.0,
          pinned: true,
          sourceSignal: "explicit",
        }),
      })
    );
    expect(memoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem-match" },
        data: { tier: "workspace" },
      })
    );
  });

  it("throws when no memories match", async () => {
    memoryFindMany.mockResolvedValue([]);

    await expect(holdInMind("nonexistent concept")).rejects.toThrow();
  });
});

describe("suppress", () => {
  beforeEach(() => vi.clearAllMocks());

  it("evicts matching slot and sets suppressedUntil", async () => {
    const slot = makeSlot({
      id: "slot-sup",
      position: 2,
      memoryId: "mem-sup",
      conceptLabel: "cortex project",
      memoryContent: "User builds Cortex",
    });
    workspaceSlotFindMany.mockResolvedValue([slot]);
    workspaceSlotUpdate.mockResolvedValue({});
    memoryUpdate.mockResolvedValue({});

    const result = await suppress("cortex");

    expect(result.evictedSlot).toBe(2);
    expect(result.suppressedUntil).toBeDefined();
    expect(workspaceSlotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "slot-sup" },
        data: expect.objectContaining({
          memoryId: null,
          loading: 0,
          conceptLabel: null,
        }),
      })
    );
    expect(memoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem-sup" },
        data: expect.objectContaining({
          tier: "background",
          suppressedUntil: expect.any(Date),
        }),
      })
    );
  });

  it("throws when no slot matches the concept", async () => {
    workspaceSlotFindMany.mockResolvedValue([]);

    await expect(suppress("nonexistent")).rejects.toThrow();
  });
});

describe("release", () => {
  beforeEach(() => vi.clearAllMocks());

  it("unpins a held slot", async () => {
    const slot = makeSlot({
      id: "slot-pinned",
      position: 5,
      pinned: true,
      conceptLabel: "important thing",
      memoryContent: "Important memory content",
    });
    workspaceSlotFindMany.mockResolvedValue([slot]);
    workspaceSlotUpdate.mockResolvedValue({});

    const result = await release("important");

    expect(result.slotPosition).toBe(5);
    expect(workspaceSlotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "slot-pinned" },
        data: expect.objectContaining({
          pinned: false,
        }),
      })
    );
  });

  it("throws when no pinned slot matches", async () => {
    workspaceSlotFindMany.mockResolvedValue([]);

    await expect(release("nothing")).rejects.toThrow();
  });
});

describe("logSignal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates activity signal with serialized JSON", async () => {
    activitySignalCreate.mockResolvedValue({ id: "sig-1" });

    const result = await logSignal({
      type: "query",
      keywords: ["cortex", "memory"],
      categories: ["projects"],
      sourceType: "mcp",
    });

    expect(result).toBe("sig-1");
    expect(activitySignalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "query",
          keywords: JSON.stringify(["cortex", "memory"]),
          categories: JSON.stringify(["projects"]),
          sourceType: "mcp",
          processed: false,
        }),
      })
    );
  });
});

describe("getWorkspaceResponse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns formatted response with occupied slots only", async () => {
    const occupiedSlot = makeSlot({
      position: 0,
      memoryId: "mem-1",
      loading: 0.7,
      conceptLabel: "cortex",
      pinned: false,
      sourceSignal: "automatic",
    });
    const emptySlot = makeSlot({
      id: "slot-empty",
      position: 1,
      memoryId: null,
      loading: 0,
      memory: null,
    });
    workspaceSlotFindMany.mockResolvedValue([occupiedSlot, emptySlot]);

    const response = await getWorkspaceResponse();

    expect(response.slots).toHaveLength(1);
    expect(response.slots[0].position).toBe(0);
    expect(response.slots[0].memoryId).toBe("mem-1");
    expect(response.slots[0].content).toBe("User builds Cortex project");
    expect(response.capacity).toBe(20);
    expect(response.occupied).toBe(1);
    expect(response.lastUpdated).toBeDefined();
  });

  it("returns empty slots array when no slots are occupied", async () => {
    workspaceSlotFindMany.mockResolvedValue([]);

    const response = await getWorkspaceResponse();

    expect(response.slots).toHaveLength(0);
    expect(response.occupied).toBe(0);
    expect(response.capacity).toBe(20);
  });
});
