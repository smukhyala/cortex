import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  const mockPrisma = {
    source: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

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
import { ingestExchangeFacts } from "@/services/exchange-ingest";

const mockedPrisma = vi.mocked(prisma);
const mockedDeduplicate = vi.mocked(deduplicateMemories);
const mockedCommit = vi.mocked(commit);
const mockedPropagate = vi.mocked(propagateToAllPlatforms);

describe("ingestExchangeFacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.source.findFirst.mockResolvedValue({ id: "exchange-source" } as any);
    mockedPrisma.source.create.mockResolvedValue({ id: "created-source" } as any);
    mockedPrisma.activityLog.create.mockResolvedValue({} as any);
    mockedDeduplicate.mockResolvedValue({
      output: {
        clean: [
          {
            content: "User's dog is named Brian",
            subject: "user",
            category: "relationships",
            confidence: 0.9,
            verbatimQuote: "User's dog is named Brian",
            temporality: "durable",
            sensitive: false,
            isCorrection: false,
          },
        ],
        conflicts: [],
        duplicatesDropped: 0,
        duplicateReferences: [],
      },
      tokens: { input: 0, output: 0 },
    });
    mockedCommit.mockResolvedValue({
      memoriesCreated: 1,
      reviewItemsCreated: 0,
      conflictsCreated: 0,
      autoApproved: 0,
      autoSuperseded: 0,
      referencesUpdated: 0,
    });
    mockedPropagate.mockResolvedValue({
      destinations: [{ type: "claude_code", name: "Claude", success: true }],
    });
  });

  it("stores Poke-learned facts as active exchange memories and propagates to peers", async () => {
    const result = await ingestExchangeFacts({
      origin: "poke",
      topic: "relationships",
      facts: [{ content: "User's dog is named Brian" }],
    });

    expect(mockedCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: "exchange-source",
        initialStatus: "active",
      })
    );
    expect(mockedPropagate).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDestinations: ["poke"],
        pokeMetadata: expect.objectContaining({ origin: "poke" }),
      })
    );
    expect(result.memoriesCreated).toBe(1);
  });

  it("sends Claude-learned facts to Poke through propagation", async () => {
    await ingestExchangeFacts({
      origin: "claude",
      topic: "preferences",
      facts: [{ content: "User prefers concise answers", category: "preferences" }],
    });

    expect(mockedPropagate).toHaveBeenCalledWith(
      expect.objectContaining({
        pokeMessage: expect.stringContaining("Cortex exchange update from Claude"),
        pokeMetadata: expect.objectContaining({ origin: "claude" }),
        skipDestinations: [],
      })
    );
  });

  it("creates an exchange source when one does not exist", async () => {
    mockedPrisma.source.findFirst.mockResolvedValue(null);

    await ingestExchangeFacts({
      origin: "poke",
      facts: [{ content: "User likes navy" }],
    });

    expect(mockedPrisma.source.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "poke",
          name: "Poke (Exchange)",
        }),
      })
    );
  });
});
