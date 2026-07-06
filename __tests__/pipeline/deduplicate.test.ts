import { describe, it, expect } from "vitest";
import { compareMemories } from "@/pipeline/deduplicate";
import type { ExtractedMemory } from "@/contracts/pipeline";

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

function makeMemory(
  content: string,
  category: string = "preferences",
  sourceDate: Date | null = null
): ExtractedMemory {
  return {
    content,
    subject: "user",
    category: category as ExtractedMemory["category"],
    confidence: 0.9,
    verbatimQuote: content,
    temporality: "durable",
    sensitive: false,
    isCorrection: false,
    sourceDate,
  };
}

describe.skipIf(!hasApiKey)("compareMemories (integration)", () => {
  it('identifies exact duplicates as "duplicate"', async () => {
    const result = await compareMemories(
      { id: "existing-1", content: "User prefers TypeScript over JavaScript", createdAt: new Date("2024-01-01") },
      makeMemory("User prefers TypeScript over JavaScript")
    );
    expect(result.relationship).toBe("duplicate");
  }, 30000);

  it('identifies rephrased duplicates as "duplicate"', async () => {
    const result = await compareMemories(
      { id: "existing-1", content: "User prefers TypeScript over JavaScript", createdAt: new Date("2024-01-01") },
      makeMemory("User likes TypeScript more than JavaScript")
    );
    expect(result.relationship).toBe("duplicate");
  }, 30000);

  it('identifies contradictions as "contradiction"', async () => {
    const result = await compareMemories(
      { id: "existing-1", content: "User prefers TypeScript", createdAt: new Date("2024-01-01") },
      makeMemory("User prefers Python for all projects")
    );
    expect(result.relationship).toBe("contradiction");
    expect(result.reasoning.length).toBeGreaterThan(0);
  }, 30000);

  it('identifies refinements as "refinement"', async () => {
    const result = await compareMemories(
      { id: "existing-1", content: "User works at Acme", createdAt: new Date("2024-01-01") },
      makeMemory("User works at Acme Corp as a senior engineer", "education_career")
    );
    expect(result.relationship).toBe("refinement");
    expect(result.mergedContent).toBeDefined();
    expect(result.mergedContent!.toLowerCase()).toContain("senior engineer");
  }, 30000);

  it('identifies unrelated memories in same category as "unrelated"', async () => {
    const result = await compareMemories(
      { id: "existing-1", content: "User prefers dark mode in all applications", createdAt: new Date("2024-01-01") },
      makeMemory("User prefers TypeScript over JavaScript")
    );
    expect(result.relationship).toBe("unrelated");
  }, 30000);

  it('identifies corrections as "supersede"', async () => {
    const result = await compareMemories(
      { id: "existing-1", content: "User lives in New York", createdAt: new Date("2024-01-01") },
      makeMemory("User recently moved from New York to San Francisco", "identity")
    );
    expect(["supersede", "contradiction"]).toContain(result.relationship);
  }, 30000);

  it('verbose vs concise version of the same fact should NOT be contradiction', async () => {
    const result = await compareMemories(
      { id: "existing-1", content: "User prefers TypeScript", createdAt: new Date("2024-01-01") },
      makeMemory("User prefers TypeScript because of its static typing, better IDE support, and type safety for large codebases")
    );
    expect(result.relationship).not.toBe("contradiction");
    expect(["duplicate", "refinement"]).toContain(result.relationship);
  }, 30000);

  it('temporal life changes with recent dates should be "supersede"', async () => {
    const result = await compareMemories(
      { id: "existing-1", content: "User works at Company A", createdAt: new Date("2024-01-01") },
      makeMemory("User works at Company B", "education_career", new Date("2025-06-01"))
    );
    expect(result.relationship).toBe("supersede");
  }, 30000);
});
