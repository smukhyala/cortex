import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { formatForClaude } from "@/exporters/claude";
import { writeClaudeCodeMemory } from "@/parsers/claude-code";
import { formatForChatGPT } from "@/exporters/chatgpt";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import path from "path";
import os from "os";

describe("formatForClaude", () => {
  it("formats memories as CLAUDE.md with category headings", () => {
    const memories = [
      { content: "User prefers TypeScript", category: "preferences", sensitive: false },
      { content: "User is named Sanjay", category: "identity", sensitive: false },
      { content: "User is building Cortex", category: "projects", sensitive: false },
    ];

    const result = formatForClaude(memories);

    expect(result).toContain("<!-- cortex:begin -->");
    expect(result).toContain("<!-- cortex:end -->");
    expect(result).toContain("## Preferences");
    expect(result).toContain("- User prefers TypeScript");
    expect(result).toContain("## Identity");
    expect(result).toContain("- User is named Sanjay");
    expect(result).toContain("## Projects");
    expect(result).toContain("- User is building Cortex");
  });

  it("strips sensitive memories from export by default", () => {
    const memories = [
      { content: "User prefers TypeScript", category: "preferences", sensitive: false },
      { content: "User earns $200k", category: "identity", sensitive: true },
    ];

    const result = formatForClaude(memories);
    expect(result).toContain("User prefers TypeScript");
    expect(result).not.toContain("$200k");
  });

  it("includes sensitive memories when flag is set", () => {
    const memories = [
      { content: "User earns $200k", category: "identity", sensitive: true },
    ];

    const result = formatForClaude(memories, { includeSensitive: true });
    expect(result).toContain("$200k");
  });
});

describe("formatForChatGPT", () => {
  it("formats memories as grouped factual statements", () => {
    const memories = [
      { content: "User prefers TypeScript", category: "preferences", sensitive: false },
      { content: "User is named Sanjay", category: "identity", sensitive: false },
    ];

    const result = formatForChatGPT(memories);
    expect(result).toContain("User prefers TypeScript");
    expect(result).toContain("User is named Sanjay");
    expect(result).toContain("[Preferences");
    expect(result).toContain("[Identity");
  });

  it("strips sensitive memories", () => {
    const memories = [
      { content: "User prefers TypeScript", category: "preferences", sensitive: false },
      { content: "User has ADHD", category: "identity", sensitive: true },
    ];

    const result = formatForChatGPT(memories);
    expect(result).not.toContain("ADHD");
  });
});

describe("Claude write-back round-trip", () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `cortex-export-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    tmpFile = path.join(tmpDir, "CLAUDE.md");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes to existing file without destroying non-Cortex content", async () => {
    const original = [
      "# My Project",
      "",
      "This is my project documentation.",
      "",
      "## Build Commands",
      "",
      "- npm run dev",
      "- npm run build",
    ].join("\n");
    await writeFile(tmpFile, original);

    const memories = [
      { content: "User prefers TypeScript", category: "preferences" },
      { content: "User is named Sanjay", category: "identity" },
    ];

    await writeClaudeCodeMemory(tmpFile, memories);
    const result = await readFile(tmpFile, "utf-8");

    // Original content preserved
    expect(result).toContain("# My Project");
    expect(result).toContain("This is my project documentation.");
    expect(result).toContain("- npm run dev");

    // Cortex content added
    expect(result).toContain("<!-- cortex:begin -->");
    expect(result).toContain("<!-- cortex:end -->");
    expect(result).toContain("- User prefers TypeScript");
    expect(result).toContain("- User is named Sanjay");
  });

  it("replaces cortex section on second write", async () => {
    const memories1 = [
      { content: "Old memory", category: "preferences" },
    ];
    await writeClaudeCodeMemory(tmpFile, memories1);

    const memories2 = [
      { content: "New memory", category: "preferences" },
      { content: "Another new memory", category: "identity" },
    ];
    await writeClaudeCodeMemory(tmpFile, memories2);

    const result = await readFile(tmpFile, "utf-8");
    expect(result).toContain("- New memory");
    expect(result).toContain("- Another new memory");
    expect(result).not.toContain("- Old memory");

    // Only one pair of markers
    const beginCount = (result.match(/<!-- cortex:begin -->/g) || []).length;
    const endCount = (result.match(/<!-- cortex:end -->/g) || []).length;
    expect(beginCount).toBe(1);
    expect(endCount).toBe(1);
  });
});
