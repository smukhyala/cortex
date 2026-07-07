import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CORTEX_BOOTSTRAP_BEGIN,
  CORTEX_BOOTSTRAP_END,
  formatBootstrapInstructions,
  getClaudeBootstrapPaths,
  stripBootstrapBlocks,
  writeAllClaudeBootstraps,
  writeClaudeBootstrap,
} from "@/exporters/bootstrap";
import { parseMarkdownSections } from "@/parsers/claude-code";

describe("bootstrap exporter/parser ignore markers", () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "cortex-bootstrap-"));
    tmpFile = path.join(tmpDir, "CLAUDE.md");
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("wraps generated bootstrap instructions in managed markers", () => {
    const output = formatBootstrapInstructions();

    expect(output).toContain(CORTEX_BOOTSTRAP_BEGIN);
    expect(output).toContain(CORTEX_BOOTSTRAP_END);
    expect(output).toContain("call `cortex_get_context`");
    expect(output).toContain("call `cortex_search_memories`");
    expect(output).toContain("call `cortex_log_context` or `cortex_save_conversation`");
  });

  it("strips marked bootstrap regions while preserving surrounding content", () => {
    const stripped = stripBootstrapBlocks([
      "# Project Notes",
      "",
      "- Keep this manual note",
      CORTEX_BOOTSTRAP_BEGIN,
      "## Cortex Default Context",
      "- Generated operational setup",
      CORTEX_BOOTSTRAP_END,
      "",
      "## Manual Memories",
      "- Keep this memory too",
    ].join("\n"));

    expect(stripped).toContain("# Project Notes");
    expect(stripped).toContain("- Keep this manual note");
    expect(stripped).toContain("## Manual Memories");
    expect(stripped).toContain("- Keep this memory too");
    expect(stripped).not.toContain("Generated operational setup");
    expect(stripped).not.toContain(CORTEX_BOOTSTRAP_BEGIN);
    expect(stripped).not.toContain(CORTEX_BOOTSTRAP_END);
  });

  it("does not parse bootstrap instructions as user context", () => {
    const sections = parseMarkdownSections([
      CORTEX_BOOTSTRAP_BEGIN,
      "## Cortex Default Context",
      "- At the start of a new conversation, call `cortex_get_context`.",
      CORTEX_BOOTSTRAP_END,
      "",
      "## Projects & Startups",
      "- User is building Cortex",
    ].join("\n"));

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      heading: "Projects & Startups",
      items: [{ content: "User is building Cortex", format: "bullet" }],
    });
  });

  it("writes bootstrap instructions idempotently without deleting manual content", async () => {
    await writeFile(
      tmpFile,
      [
        "# Project Notes",
        "",
        "- Keep this manual note",
        "",
        CORTEX_BOOTSTRAP_BEGIN,
        "old generated instructions",
        CORTEX_BOOTSTRAP_END,
      ].join("\n")
    );

    await writeClaudeBootstrap(tmpFile);
    await writeClaudeBootstrap(tmpFile);
    const written = await readFile(tmpFile, "utf-8");

    expect(written).toContain("# Project Notes");
    expect(written).toContain("- Keep this manual note");
    expect(written).not.toContain("old generated instructions");
    expect((written.match(new RegExp(CORTEX_BOOTSTRAP_BEGIN, "g")) || []).length).toBe(1);
    expect((written.match(new RegExp(CORTEX_BOOTSTRAP_END, "g")) || []).length).toBe(1);
  });

  it("discovers and writes Claude Desktop user-files bootstrap path", async () => {
    const desktopConfigDir = path.join(tmpDir, "Library", "Application Support", "Claude");
    const desktopUserFiles = path.join(tmpDir, "Claude");
    await mkdir(desktopConfigDir, { recursive: true });
    await writeFile(
      path.join(desktopConfigDir, "claude_desktop_config.json"),
      JSON.stringify({ coworkUserFilesPath: desktopUserFiles })
    );

    const paths = await getClaudeBootstrapPaths(tmpDir);
    const results = await writeAllClaudeBootstraps(tmpDir);

    expect(paths).toContain(path.join(tmpDir, ".claude", "CLAUDE.md"));
    expect(paths).toContain(path.join(desktopUserFiles, "CLAUDE.md"));
    expect(results.every((result) => result.installed)).toBe(true);
    expect(await readFile(path.join(desktopUserFiles, "CLAUDE.md"), "utf-8")).toContain(CORTEX_BOOTSTRAP_BEGIN);
  });
});
