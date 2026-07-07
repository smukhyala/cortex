import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm", () => ({
  structuredCall: vi.fn(),
}));

vi.mock("@/lib/categories", () => ({
  getCategories: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/services/exchange-ingest", () => ({
  ingestExchangeFacts: vi.fn(),
}));

import { structuredCall } from "@/lib/llm";
import { getCategories } from "@/lib/categories";
import { prisma } from "@/lib/db";
import { ingestExchangeFacts } from "@/services/exchange-ingest";
import { PokeWebhookOrchestrator } from "@/pipeline/agents/poke-webhook-orchestrator";

const mockedStructuredCall = vi.mocked(structuredCall);
const mockedGetCategories = vi.mocked(getCategories);
const mockedPrisma = vi.mocked(prisma);
const mockedIngestExchangeFacts = vi.mocked(ingestExchangeFacts);

describe("PokeWebhookOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCategories.mockResolvedValue([
      { slug: "identity", label: "Identity", color: "#fff", sortOrder: 0 },
      { slug: "preferences", label: "Preferences", color: "#fff", sortOrder: 1 },
      { slug: "relationships", label: "Relationships", color: "#fff", sortOrder: 2 },
    ]);
    mockedStructuredCall.mockResolvedValue({
      data: {
        facts: [{ content: "User's favorite color is green", category: "preferences" }],
        summary: "Favorite color",
      },
      inputTokens: 10,
      outputTokens: 5,
    });
    mockedIngestExchangeFacts.mockResolvedValue({
      sourceId: "poke-source",
      memoriesCreated: 1,
      referencesUpdated: 0,
      conflictsCreated: 0,
      reviewItemsCreated: 0,
      propagatedDestinations: [{ type: "claude_code", name: "Claude", success: true }],
    });
    mockedPrisma.memory.findFirst.mockResolvedValue({ id: "favorite-color" } as any);
  });

  it("ingests structured facts directly without an LLM extraction pass", async () => {
    const result = await new PokeWebhookOrchestrator().run({
      event: "memory.created",
      conversationId: "thread-1",
      facts: [{ content: "User's dog is named Brian", category: "relationships" }],
    });

    expect(mockedStructuredCall).not.toHaveBeenCalled();
    expect(mockedIngestExchangeFacts).toHaveBeenCalledWith({
      origin: "poke",
      facts: [
        {
          content: "User's dog is named Brian",
          category: "relationships",
          sensitive: false,
        },
      ],
      topic: "poke webhook",
      summary: "memory.created",
      propagate: true,
    });
    expect(result.ingested).toBe(true);
    expect(result.factsExtracted).toBe(1);
  });

  it("extracts user-authored durable facts from raw Poke messages", async () => {
    await new PokeWebhookOrchestrator().run({
      event: "message.created",
      threadId: "thread-2",
      messages: [
        { role: "assistant", text: "What is your favorite color?" },
        { role: "user", text: "It's green" },
      ],
    });

    expect(mockedStructuredCall).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.stringContaining("User: It's green"),
      })
    );
    expect(mockedStructuredCall).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.not.stringContaining("What is your favorite color?"),
      })
    );
    expect(mockedIngestExchangeFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "poke",
        facts: [
          {
            content: "User's favorite color is green",
            category: "preferences",
            sensitive: false,
          },
        ],
        propagate: true,
      })
    );
  });

  it("infers pronoun color updates from an existing favorite color memory without an LLM pass", async () => {
    await new PokeWebhookOrchestrator().run({
      event: "message.created",
      threadId: "thread-3",
      message: { role: "user", text: "Its cactus green now" },
    });

    expect(mockedStructuredCall).not.toHaveBeenCalled();
    expect(mockedIngestExchangeFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "poke",
        facts: [
          {
            content: "User's favorite color is cactus green.",
            category: "preferences",
            sensitive: false,
          },
        ],
      })
    );
  });

  it("creates hypothetical naming preferences as new memories without an LLM pass", async () => {
    await new PokeWebhookOrchestrator().run({
      event: "message.created",
      threadId: "thread-4",
      message: { role: "user", text: "If I had a cat it would be called boris" },
    });

    expect(mockedStructuredCall).not.toHaveBeenCalled();
    expect(mockedIngestExchangeFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "poke",
        facts: [
          {
            content: "User would name a hypothetical cat Boris.",
            category: "preferences",
            sensitive: false,
          },
        ],
      })
    );
  });

  it("does not ingest when the webhook contains no user text", async () => {
    const result = await new PokeWebhookOrchestrator().run({
      event: "message.created",
      message: { role: "assistant", text: "I can help with that." },
    });

    expect(mockedStructuredCall).not.toHaveBeenCalled();
    expect(mockedIngestExchangeFacts).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ingested: false,
      factsExtracted: 0,
      skippedReason: "no_user_text",
    });
  });

  it("does not ingest when extraction finds no durable facts", async () => {
    mockedStructuredCall.mockResolvedValueOnce({
      data: { facts: [], summary: "Small talk" },
      inputTokens: 8,
      outputTokens: 2,
    });

    const result = await new PokeWebhookOrchestrator().run({
      event: "message.created",
      message: { role: "user", text: "thanks!" },
    });

    expect(mockedIngestExchangeFacts).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ingested: false,
      factsExtracted: 0,
      skippedReason: "no_durable_facts",
    });
  });
});
