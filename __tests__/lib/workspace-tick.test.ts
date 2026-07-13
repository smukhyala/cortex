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

  it("initializeWorkspace seeds slots and runs cold start when empty", async () => {
    mockedSlotFindMany.mockResolvedValue([]);

    const result = await initializeWorkspace();
    expect(seedWorkspaceSlots).toHaveBeenCalled();
    expect(coldStart).toHaveBeenCalled();
    expect(result.slotsSeeded).toBe(20);
    expect(result.memoriesLoaded).toBe(15);
  });

  it("initializeWorkspace skips cold start when slots are occupied", async () => {
    mockedSlotFindMany.mockResolvedValue([
      { position: 0, memoryId: "mem-1" },
    ]);

    const result = await initializeWorkspace();
    expect(seedWorkspaceSlots).toHaveBeenCalled();
    expect(coldStart).not.toHaveBeenCalled();
    expect(result.memoriesLoaded).toBe(0);
  });
});
