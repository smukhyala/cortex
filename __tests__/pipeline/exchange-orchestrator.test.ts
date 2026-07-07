import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    source: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    memory: {
      findMany: vi.fn(),
      update: vi.fn(),
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
  mockedPrisma.memory.findMany.mockResolvedValue([]);
  mockedPrisma.memory.update.mockResolvedValue({} as any);
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

  it("directly supersedes an existing favorite preference from exchange facts", async () => {
    mockedPrisma.memory.findMany.mockResolvedValue([
      {
        id: "mem-color",
        content: "User's favorite color is navy.",
      },
    ] as any);

    const orchestrator = new ExchangeOrchestrator();
    const result = await orchestrator.run({
      origin: "poke",
      facts: [{ content: "User's favorite color is cactus green.", category: "preferences" }],
    });

    expect(mockedPrisma.memory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem-color" },
        data: expect.objectContaining({
          content: "User's favorite color is cactus green.",
          referenceCount: { increment: 1 },
        }),
      })
    );
    expect(mockedDeduplicate).not.toHaveBeenCalled();
    expect(mockedCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        clean: [],
        conflicts: [],
      })
    );
    expect(result.referencesUpdated).toBe(1);
  });
});
