import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseMarkdownSections,
  parseClaudeCodeMemory,
  writeClaudeCodeMemory,
} from "@/parsers/claude-code";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import path from "path";
import os from "os";

const FIXTURE = path.resolve(__dirname, "../../fixtures/claude-memory.md");

describe("parseMarkdownSections", () => {
  it("parses CLAUDE.md with ## headings into sections", async () => {
    const content = await readFile(FIXTURE, "utf-8");
    const sections = parseMarkdownSections(content);

    const headings = sections.map((s) => s.heading);
    expect(headings).toContain("Preferences");
    expect(headings).toContain("Facts");
    expect(headings).toContain("Synced Context");
    expect(headings).toContain("Custom Section");
  });

  it("extracts bullet points as individual memory items", async () => {
    const content = await readFile(FIXTURE, "utf-8");
    const sections = parseMarkdownSections(content);

    const prefs = sections.find((s) => s.heading === "Preferences")!;
    expect(prefs.items.length).toBe(3);
    expect(prefs.items[0].content).toBe("Prefers concise code with minimal comments");
    expect(prefs.items[0].format).toBe("bullet");
    expect(prefs.items[1].content).toBe("Uses Vitest for testing, not Jest");
    expect(prefs.items[2].content).toBe("Avoids emojis in code and documentation");
  });

  it("handles preamble content before first heading", async () => {
    const content = await readFile(FIXTURE, "utf-8");
    const sections = parseMarkdownSections(content);

    const preamble = sections.find((s) => s.heading === "Project Guidelines")!;
    expect(preamble).toBeDefined();
    expect(preamble.items.length).toBeGreaterThan(0);
  });

  it("handles files with no headings (everything under default)", () => {
    const content = "- Memory one\n- Memory two\n- Memory three";
    const sections = parseMarkdownSections(content);

    expect(sections.length).toBe(1);
    expect(sections[0].heading).toBe("default");
    expect(sections[0].items.length).toBe(3);
  });

  it("treats freeform paragraphs as paragraph items", async () => {
    const content = await readFile(FIXTURE, "utf-8");
    const sections = parseMarkdownSections(content);

    const custom = sections.find((s) => s.heading === "Custom Section")!;
    expect(custom).toBeDefined();
    const paragraphs = custom.items.filter((i) => i.format === "paragraph");
    expect(paragraphs.length).toBeGreaterThan(0);
  });

  it("handles empty files gracefully", () => {
    const sections = parseMarkdownSections("");
    expect(sections).toEqual([]);
  });

  it("handles files with only whitespace", () => {
    const sections = parseMarkdownSections("   \n\n   \n");
    expect(sections).toEqual([]);
  });
});

describe("parseClaudeCodeMemory", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `cortex-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("reads CLAUDE.md from directory root", async () => {
    const content = "## Facts\n\n- User is a developer\n- User likes TypeScript";
    await writeFile(path.join(tmpDir, "CLAUDE.md"), content);

    const conversations = await parseClaudeCodeMemory(tmpDir);
    expect(conversations.length).toBe(1);
    expect(conversations[0].messages.length).toBe(2);
    expect(conversations[0].messages[0].content).toContain("User is a developer");
  });

  it("reads from .claude/CLAUDE.md subdirectory", async () => {
    await mkdir(path.join(tmpDir, ".claude"), { recursive: true });
    const content = "## Preferences\n\n- Prefers dark mode";
    await writeFile(path.join(tmpDir, ".claude", "CLAUDE.md"), content);

    const conversations = await parseClaudeCodeMemory(tmpDir);
    expect(conversations.length).toBe(1);
    expect(conversations[0].messages[0].content).toContain("Prefers dark mode");
  });

  it("prefixes messages with section heading", async () => {
    const content = "## Preferences\n\n- Dark mode\n\n## Facts\n\n- Name is Sanjay";
    await writeFile(path.join(tmpDir, "CLAUDE.md"), content);

    const conversations = await parseClaudeCodeMemory(tmpDir);
    const msgs = conversations[0].messages;
    expect(msgs[0].content).toBe("[Preferences] Dark mode");
    expect(msgs[1].content).toBe("[Facts] Name is Sanjay");
  });

  it("returns empty array for directories with no memory files", async () => {
    const conversations = await parseClaudeCodeMemory(tmpDir);
    expect(conversations).toEqual([]);
  });
});

describe("writeClaudeCodeMemory", () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `cortex-write-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    tmpFile = path.join(tmpDir, "CLAUDE.md");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes memories to a new file", async () => {
    const memories = [
      { content: "User prefers TypeScript", category: "preferences" },
      { content: "User is named Sanjay", category: "identity" },
    ];

    await writeClaudeCodeMemory(tmpFile, memories);
    const result = await readFile(tmpFile, "utf-8");

    expect(result).toContain("<!-- cortex:begin -->");
    expect(result).toContain("<!-- cortex:end -->");
    expect(result).toContain("- User prefers TypeScript");
    expect(result).toContain("- User is named Sanjay");
    expect(result).toContain("## Preferences");
    expect(result).toContain("## Identity");
  });

  it("preserves content outside cortex:begin/end markers on write", async () => {
    // Write initial file with non-Cortex content
    const original = [
      "# Project Guidelines",
      "",
      "Use strict TypeScript.",
      "",
      "<!-- cortex:begin -->",
      "## Old Synced",
      "",
      "- Old memory that should be replaced",
      "<!-- cortex:end -->",
      "",
      "## Manual Notes",
      "",
      "- This should be preserved",
    ].join("\n");
    await writeFile(tmpFile, original);

    // Write new cortex memories
    await writeClaudeCodeMemory(tmpFile, [
      { content: "New memory", category: "preferences" },
    ]);

    const result = await readFile(tmpFile, "utf-8");

    // Should preserve non-cortex content
    expect(result).toContain("# Project Guidelines");
    expect(result).toContain("Use strict TypeScript.");
    expect(result).toContain("- This should be preserved");
    expect(result).toContain("## Manual Notes");

    // Should have new cortex content
    expect(result).toContain("- New memory");

    // Should NOT have old cortex content
    expect(result).not.toContain("Old memory that should be replaced");
    expect(result).not.toContain("## Old Synced");
  });

  it("round-trip: write memories → read back → same memories", async () => {
    const memories = [
      { content: "Prefers Next.js App Router", category: "preferences" },
      { content: "Uses Prisma with SQLite", category: "workflows" },
      { content: "Name is Sanjay", category: "identity" },
    ];

    await writeClaudeCodeMemory(tmpFile, memories);

    // Read back and parse
    const conversations = await parseClaudeCodeMemory(tmpDir);
    expect(conversations.length).toBe(1);

    const contents = conversations[0].messages.map((m) => {
      // Strip the [Section] prefix to get raw content
      return m.content.replace(/^\[.*?\]\s*/, "");
    });

    expect(contents).toContain("Prefers Next.js App Router");
    expect(contents).toContain("Uses Prisma with SQLite");
    expect(contents).toContain("Name is Sanjay");
  });

  it("appends cortex section when file has no markers", async () => {
    const original = "# My Notes\n\n- Something important\n";
    await writeFile(tmpFile, original);

    await writeClaudeCodeMemory(tmpFile, [
      { content: "User fact", category: "identity" },
    ]);

    const result = await readFile(tmpFile, "utf-8");
    expect(result).toContain("# My Notes");
    expect(result).toContain("- Something important");
    expect(result).toContain("<!-- cortex:begin -->");
    expect(result).toContain("- User fact");
  });
});
