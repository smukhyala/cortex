import { describe, it, expect } from "vitest";
import { formatForChatGPT } from "@/exporters/chatgpt";

const makeMemory = (content: string, category: string, sensitive = false) => ({
  content,
  category,
  sensitive,
});

describe("formatForChatGPT", () => {
  it("formats memories grouped by category", () => {
    const memories = [
      makeMemory("User's name is Sanjay", "identity"),
      makeMemory("User prefers TypeScript", "preferences"),
      makeMemory("User is building Cortex", "projects"),
    ];

    const result = formatForChatGPT(memories);

    expect(result).toContain("[Identity & Profile]");
    expect(result).toContain("User's name is Sanjay");
    expect(result).toContain("[Preferences & Style]");
    expect(result).toContain("User prefers TypeScript");
    expect(result).toContain("[Projects & Startups]");
    expect(result).toContain("User is building Cortex");
  });

  it("groups multiple memories under the same category", () => {
    const memories = [
      makeMemory("User prefers TypeScript", "preferences"),
      makeMemory("User prefers dark mode", "preferences"),
      makeMemory("User prefers Prisma", "preferences"),
    ];

    const result = formatForChatGPT(memories);

    // Should have one category header
    const headerCount = (result.match(/\[Preferences & Style\]/g) || []).length;
    expect(headerCount).toBe(1);

    // All memories should appear
    expect(result).toContain("User prefers TypeScript");
    expect(result).toContain("User prefers dark mode");
    expect(result).toContain("User prefers Prisma");
  });

  it("handles empty memories array", () => {
    const result = formatForChatGPT([]);
    expect(result).toBe("");
  });

  it("excludes sensitive memories by default", () => {
    const memories = [
      makeMemory("User's name is Sanjay", "identity", false),
      makeMemory("User earns $200k", "identity", true),
      makeMemory("User has been diagnosed with ADHD", "identity", true),
    ];

    const result = formatForChatGPT(memories);

    expect(result).toContain("Sanjay");
    expect(result).not.toContain("$200k");
    expect(result).not.toContain("ADHD");
  });

  it("includes sensitive memories when includeSensitive is true", () => {
    const memories = [
      makeMemory("User's name is Sanjay", "identity", false),
      makeMemory("User earns $200k", "identity", true),
    ];

    const result = formatForChatGPT(memories, { includeSensitive: true });

    expect(result).toContain("Sanjay");
    expect(result).toContain("$200k");
  });

  it("returns empty string when all memories are sensitive and includeSensitive is false", () => {
    const memories = [
      makeMemory("User earns $200k", "identity", true),
      makeMemory("User has ADHD", "identity", true),
    ];

    const result = formatForChatGPT(memories);
    expect(result).toBe("");
  });

  it("uses category label from CATEGORY_LABELS, not raw slug", () => {
    const memories = [
      makeMemory("User studies at Berkeley", "education_career"),
    ];

    const result = formatForChatGPT(memories);

    // Should use the human-readable label, not the raw slug
    expect(result).toContain("[Education & Career]");
    expect(result).not.toContain("[education_career]");
  });

  it("falls back to raw category name for unknown categories", () => {
    const memories = [
      makeMemory("Some unknown fact", "unknown_category"),
    ];

    const result = formatForChatGPT(memories);
    expect(result).toContain("[unknown_category]");
  });

  it("output format has category headers on separate lines from content", () => {
    const memories = [
      makeMemory("User prefers TypeScript", "preferences"),
    ];

    const result = formatForChatGPT(memories);
    const lines = result.split("\n");

    // First line should be the category header
    expect(lines[0]).toBe("[Preferences & Style]");
    // Second line should be the memory content
    expect(lines[1]).toBe("User prefers TypeScript");
  });

  it("preserves order within categories", () => {
    const memories = [
      makeMemory("First preference", "preferences"),
      makeMemory("Second preference", "preferences"),
      makeMemory("Third preference", "preferences"),
    ];

    const result = formatForChatGPT(memories);
    const firstIdx = result.indexOf("First preference");
    const secondIdx = result.indexOf("Second preference");
    const thirdIdx = result.indexOf("Third preference");

    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});
