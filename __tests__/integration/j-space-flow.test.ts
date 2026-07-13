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
const mockSlotFindFirst = (prisma.workspaceSlot as unknown as { findFirst: ReturnType<typeof vi.fn> }).findFirst;
const mockMemoryFindMany = prisma.memory.findMany as unknown as ReturnType<typeof vi.fn>;
const mockMemoryUpdate = prisma.memory.update as unknown as ReturnType<typeof vi.fn>;
const mockSignalCreate = prisma.activitySignal.create as unknown as ReturnType<typeof vi.fn>;

describe("J-Space end-to-end flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlotUpdate.mockResolvedValue({});
    mockMemoryUpdate.mockResolvedValue({});
  });

  it("full workflow: signal -> reinforce -> hold -> release -> suppress -> workspace", async () => {
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
    mockSlotFindFirst.mockResolvedValue(
      { id: "slot-5", position: 5, memoryId: null, loading: 0, pinned: false, sourceSignal: "activity", activatedAt: new Date() },
    );
    const held = await holdInMind("Ian meeting");
    expect(held.slotPosition).toBe(5);
    expect(held.conceptLabel).toContain("ian");

    // 4. Release it
    mockSlotFindMany.mockResolvedValue([
      {
        id: "slot-5",
        position: 5,
        memoryId: "mem-5",
        conceptLabel: "Ian meeting",
        loading: 1.0,
        pinned: true,
        sourceSignal: "explicit",
        activatedAt: new Date(),
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
        sourceSignal: "activity",
        activatedAt: new Date(),
        memory: { id: "mem-5", content: "Ian meeting agenda items", category: "projects" },
      },
    ]);
    const suppressed = await suppress("Ian meeting", 48);
    expect(suppressed.evictedSlot).toBe(5);
    expect(suppressed.suppressedUntil).toBeDefined();

    // 6. Get final workspace state
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
    expect(workspace.capacity.total).toBe(20);
  });
});
