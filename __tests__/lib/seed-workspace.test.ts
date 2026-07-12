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
