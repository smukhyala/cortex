import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/llm", () => ({
  structuredCall: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { structuredCall } from "@/lib/llm";
import { applyDedupResults, runDedupScan } from "@/pipeline/agents/dedup-scan";

const mockedPrisma = vi.mocked(prisma);
const mockedStructuredCall = vi.mocked(structuredCall);

function activeMemory(overrides: Partial<{
  id: string;
  content: string;
  category: string;
  confidence: number;
  referenceCount: number;
  lastReferencedAt: Date;
  updatedAt: Date;
  createdAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? "mem_1",
    content: overrides.content ?? "User prefers TypeScript.",
    category: overrides.category ?? "preferences",
    confidence: overrides.confidence ?? 0.9,
    referenceCount: overrides.referenceCount ?? 1,
    lastReferencedAt: overrides.lastReferencedAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
  };
}

describe("dedup scan/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports archiveable duplicate count and filters unusable scan groups", async () => {
    mockedPrisma.memory.findMany.mockResolvedValue([
      activeMemory({ id: "mem_1" }),
      activeMemory({ id: "mem_2", content: "User likes TypeScript." }),
      activeMemory({ id: "mem_3", content: "User prefers concise explanations." }),
    ] as any);
    mockedStructuredCall.mockResolvedValue({
      data: {
        groups: [
          {
            canonical: "User prefers TypeScript.",
            duplicateIds: ["mem_1", "mem_2", "missing"],
            reasoning: "Same preference.",
          },
          {
            canonical: "User prefers concise explanations.",
            duplicateIds: ["mem_3"],
            reasoning: "Singleton should not be applied.",
          },
        ],
        uniqueIds: [],
      },
      inputTokens: 5,
      outputTokens: 7,
    });

    const result = await runDedupScan();

    expect(result.groups).toEqual([
      {
        canonical: "User prefers TypeScript.",
        duplicateIds: ["mem_1", "mem_2"],
        reasoning: "Same preference.",
      },
    ]);
    expect(result.duplicateCount).toBe(1);
    expect(result.uniqueCount).toBe(1);
  });

  it("keeps the strongest active memory and preserves total reference evidence", async () => {
    const older = activeMemory({
      id: "older",
      referenceCount: 2,
      lastReferencedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const stronger = activeMemory({
      id: "stronger",
      referenceCount: 8,
      lastReferencedAt: new Date("2026-02-01T00:00:00Z"),
    });
    const freshest = activeMemory({
      id: "freshest",
      referenceCount: 1,
      lastReferencedAt: new Date("2026-03-01T00:00:00Z"),
    });
    mockedPrisma.memory.findMany.mockResolvedValue([older, stronger, freshest] as any);
    mockedPrisma.memory.update.mockResolvedValue({} as any);
    mockedPrisma.activityLog.create.mockResolvedValue({} as any);

    const result = await applyDedupResults([
      {
        canonical: "User prefers TypeScript.",
        duplicateIds: ["older", "stronger", "freshest"],
      },
    ]);

    expect(result).toEqual({ merged: 1, archived: 2 });
    expect(mockedPrisma.memory.update).toHaveBeenCalledWith({
      where: { id: "stronger" },
      data: {
        content: "User prefers TypeScript.",
        referenceCount: { increment: 3 },
        lastReferencedAt: new Date("2026-03-01T00:00:00Z"),
      },
    });
    expect(mockedPrisma.memory.update).toHaveBeenCalledWith({
      where: { id: "older" },
      data: expect.objectContaining({
        status: "archived",
        archivedReason: "Deduplicated - merged into stronger",
      }),
    });
    expect(mockedPrisma.memory.update).toHaveBeenCalledWith({
      where: { id: "freshest" },
      data: expect.objectContaining({
        status: "archived",
        archivedReason: "Deduplicated - merged into stronger",
      }),
    });
  });
});
