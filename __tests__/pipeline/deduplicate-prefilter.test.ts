import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/llm", () => ({
  structuredCall: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { structuredCall } from "@/lib/llm";
import { deduplicateMemories } from "@/pipeline/deduplicate";
import type { ExtractedMemory } from "@/contracts/pipeline";

const mockedPrisma = vi.mocked(prisma);
const mockedStructuredCall = vi.mocked(structuredCall);

function makeMemory(content: string): ExtractedMemory {
  return {
    content,
    subject: "user",
    category: "preferences",
    confidence: 0.9,
    verbatimQuote: content,
    temporality: "durable",
    sensitive: false,
    isCorrection: false,
  };
}

describe("deduplicateMemories prefilter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call the LLM for unrelated memories in the same category", async () => {
    mockedPrisma.memory.findMany.mockResolvedValue([
      {
        id: "existing-color",
        content: "User's favorite color is cactus green.",
        status: "active",
        createdAt: new Date(),
      },
      {
        id: "existing-learning",
        content: "User prefers concise explanations.",
        status: "active",
        createdAt: new Date(),
      },
    ] as any);

    const result = await deduplicateMemories([
      makeMemory("User would name a hypothetical cat Boris."),
    ]);

    expect(mockedStructuredCall).not.toHaveBeenCalled();
    expect(result.output.clean).toHaveLength(1);
    expect(result.output.clean[0]?.content).toBe("User would name a hypothetical cat Boris.");
  });

  it("still calls the LLM when a plausible candidate shares meaningful terms", async () => {
    mockedPrisma.memory.findMany.mockResolvedValue([
      {
        id: "existing-color",
        content: "User's favorite color is navy.",
        status: "active",
        createdAt: new Date(),
      },
    ] as any);
    mockedStructuredCall.mockResolvedValue({
      data: {
        relationship: "supersede",
        reasoning: "The newer memory changes the favorite color.",
        mergedContent: "User's favorite color is cactus green.",
      },
      inputTokens: 1,
      outputTokens: 1,
    });

    const result = await deduplicateMemories([
      makeMemory("User's favorite color is cactus green."),
    ]);

    expect(mockedStructuredCall).toHaveBeenCalledTimes(1);
    expect(result.output.conflicts).toHaveLength(1);
  });

  it("drops exact duplicates without calling the LLM", async () => {
    mockedPrisma.memory.findMany.mockResolvedValue([
      {
        id: "existing-boris",
        content: "User would name a hypothetical cat Boris.",
        status: "active",
        createdAt: new Date(),
      },
    ] as any);

    const result = await deduplicateMemories([
      makeMemory("User would name a hypothetical cat Boris."),
    ]);

    expect(mockedStructuredCall).not.toHaveBeenCalled();
    expect(result.output.clean).toHaveLength(0);
    expect(result.output.duplicatesDropped).toBe(1);
    expect(result.output.duplicateReferences).toEqual([
      expect.objectContaining({
        existingMemoryId: "existing-boris",
        reasoning: "Exact duplicate memory content.",
      }),
    ]);
  });

  it("drops exact duplicates within the same extracted batch before hitting storage", async () => {
    mockedPrisma.memory.findMany.mockResolvedValue([]);

    const result = await deduplicateMemories([
      makeMemory("User prefers TypeScript."),
      makeMemory("  user prefers typescript.  "),
    ]);

    expect(mockedPrisma.memory.findMany).toHaveBeenCalledTimes(1);
    expect(mockedStructuredCall).not.toHaveBeenCalled();
    expect(result.output.clean).toHaveLength(1);
    expect(result.output.clean[0]?.content).toBe("User prefers TypeScript.");
    expect(result.output.duplicatesDropped).toBe(1);
  });
});
