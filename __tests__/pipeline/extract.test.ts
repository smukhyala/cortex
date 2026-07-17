import { describe, it, expect } from "vitest";
import { extractMemories } from "@/pipeline/extract";
import { ExtractedMemorySchema } from "@/contracts/pipeline";
import { MEMORY_CATEGORIES } from "@/contracts/memory";
import type { NormalizedConversation } from "@/contracts/conversation";

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

function makeConversation(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  title?: string
): NormalizedConversation {
  return {
    externalId: "test-conv-1",
    title: title ?? "Test conversation",
    messages: messages.map((m) => ({ ...m, timestamp: new Date() })),
    contentHash: "test-hash",
    sourceDate: new Date(),
  };
}

describe.skipIf(!hasApiKey)("extractMemories (integration)", () => {
  it("extracts atomic facts from a conversation with personal details", async () => {
    const conv = makeConversation([
      {
        role: "user",
        content:
          "I'm building a project called Cortex. It's a memory sync tool for AI assistants. I prefer TypeScript and Next.js for this kind of project. My name is Sanjay and I'm based in San Francisco.",
      },
      {
        role: "assistant",
        content: "That sounds great! TypeScript and Next.js are excellent choices.",
      },
      {
        role: "user",
        content:
          "I studied computer science at Stanford. Also, I recently moved here from New York.",
      },
      {
        role: "assistant",
        content: "Stanford has a great CS program!",
      },
    ]);

    const { memories, tokens } = await extractMemories(conv);

    // Should extract multiple atomic facts
    expect(memories.length).toBeGreaterThanOrEqual(3);
    expect(tokens.input).toBeGreaterThan(0);
    expect(tokens.output).toBeGreaterThan(0);

    // Each memory should be valid per the schema
    for (const mem of memories) {
      const result = ExtractedMemorySchema.safeParse(mem);
      expect(result.success).toBe(true);
    }

    // Check categories are valid
    for (const mem of memories) {
      expect(MEMORY_CATEGORIES).toContain(mem.category);
    }

    // Check that key facts are captured
    const contents = memories.map((m) => m.content.toLowerCase());
    const allContent = contents.join(" ");

    expect(allContent).toContain("sanjay");
    expect(allContent).toMatch(/cortex|memory sync/);
    expect(allContent).toMatch(/typescript/);

    // Check verbatim quotes exist
    for (const mem of memories) {
      expect(mem.verbatimQuote.length).toBeGreaterThan(0);
    }

    // The "moved from New York" fact should be marked as correction
    const moveMemory = memories.find(
      (m) => m.content.toLowerCase().includes("new york") || m.content.toLowerCase().includes("san francisco")
    );
    if (moveMemory) {
      // Either isCorrection or temporality=current is acceptable
      expect(
        moveMemory.isCorrection || moveMemory.temporality === "current"
      ).toBe(true);
    }
  }, 30000);

  it("does NOT extract facts stated by the assistant", async () => {
    const conv = makeConversation([
      { role: "user", content: "What's the best database for a local app?" },
      {
        role: "assistant",
        content:
          "I'd recommend SQLite. It's embedded, fast, and works great for local-first apps. You should use Prisma as your ORM.",
      },
      { role: "user", content: "OK, I'll try that." },
    ]);

    const { memories } = await extractMemories(conv);

    // Should NOT extract "User should use Prisma" or "SQLite is recommended"
    // These are AI suggestions, not user facts
    for (const mem of memories) {
      expect(mem.content.toLowerCase()).not.toContain("recommend");
      expect(mem.content.toLowerCase()).not.toMatch(/should use|i'd suggest/);
    }
  }, 30000);

  it("flags sensitive content", async () => {
    const conv = makeConversation([
      {
        role: "user",
        content:
          "My annual salary is $200k and I have a mortgage of $500k. Also I was diagnosed with ADHD last year.",
      },
      { role: "assistant", content: "Thanks for sharing that context." },
    ]);

    const { memories } = await extractMemories(conv);

    const sensitiveMemories = memories.filter((m) => m.sensitive);
    expect(sensitiveMemories.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("returns empty array for conversations with no memorable content", async () => {
    const conv = makeConversation([
      { role: "user", content: "What's 2 + 2?" },
      { role: "assistant", content: "4" },
      { role: "user", content: "Thanks!" },
    ]);

    const { memories } = await extractMemories(conv);
    expect(memories.length).toBe(0);
  }, 30000);

  it("detects correction patterns", async () => {
    const conv = makeConversation([
      {
        role: "user",
        content:
          "Actually, I used to prefer JavaScript but now I've switched to TypeScript for everything.",
      },
      { role: "assistant", content: "TypeScript is a great choice!" },
    ]);

    const { memories } = await extractMemories(conv);

    const correction = memories.find((m) => m.isCorrection);
    expect(correction).toBeDefined();
  }, 30000);

  it("does NOT extract technical implementation details", async () => {
    const conv = makeConversation([
      {
        role: "user",
        content: "I'm using Node.js v20.11 with the @anthropic-ai/sdk@0.30.1 package. I set up ESLint with flat config and configured Next.js App Router. My name is Alex and I'm 25 years old.",
      },
      {
        role: "assistant",
        content: "Great setup! Nice to meet you Alex.",
      },
    ]);

    const { memories } = await extractMemories(conv);

    // Should extract the name and age but not the technical details
    const contents = memories.map((m) => m.content.toLowerCase()).join(" ");
    expect(contents).toMatch(/alex/);
    expect(contents).not.toMatch(/node.*v?20/);
    expect(contents).not.toMatch(/0\.30/);
    expect(contents).not.toMatch(/flat config/i);
    expect(contents).not.toMatch(/app router/i);
  }, 30000);
});

// Unit tests that don't need the API
describe("ExtractedMemorySchema", () => {
  it("validates a well-formed extracted memory", () => {
    const valid = {
      content: "User prefers TypeScript",
      subject: "user",
      category: "preferences",
      confidence: 0.9,
      verbatimQuote: "I prefer TypeScript",
      temporality: "durable",
      sensitive: false,
      isCorrection: false,
    };
    expect(ExtractedMemorySchema.safeParse(valid).success).toBe(true);
  });

  it("falls back invalid category to first category via .catch()", () => {
    const invalid = {
      content: "Test",
      subject: "user",
      category: "invalid_category",
      confidence: 0.9,
      verbatimQuote: "test",
      temporality: "durable",
      sensitive: false,
      isCorrection: false,
    };
    const result = ExtractedMemorySchema.safeParse(invalid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("identity");
    }
  });

  it("rejects confidence out of range", () => {
    const invalid = {
      content: "Test",
      subject: "user",
      category: "identity",
      confidence: 1.5,
      verbatimQuote: "test",
      temporality: "durable",
      sensitive: false,
      isCorrection: false,
    };
    expect(ExtractedMemorySchema.safeParse(invalid).success).toBe(false);
  });
});
