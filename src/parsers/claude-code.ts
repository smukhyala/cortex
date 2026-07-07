import { createHash } from "crypto";
import { readFile, writeFile, stat, readdir } from "fs/promises";
import { join } from "path";
import type { NormalizedConversation, NormalizedMessage } from "@/contracts/conversation";
import { stripBootstrapBlocks } from "@/exporters/bootstrap";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedSection {
  heading: string;
  level: number; // 0 = no heading (preamble), 1-6 = heading level
  items: ParsedItem[];
}

export interface ParsedItem {
  content: string;
  lineNumber: number;
  format: "bullet" | "paragraph";
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CORTEX_BEGIN = "<!-- cortex:begin -->";
const CORTEX_END = "<!-- cortex:end -->";

// ─── Markdown Parser ────────────────────────────────────────────────────────

export function parseMarkdownSections(content: string): ParsedSection[] {
  const lines = stripBootstrapBlocks(content).split("\n");
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection = { heading: "default", level: 0, items: [] };
  let paragraphLines: string[] = [];
  let paragraphStartLine = 0;
  let inCodeBlock = false;

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      currentSection.items.push({
        content: paragraphLines.join("\n").trim(),
        lineNumber: paragraphStartLine,
        format: "paragraph",
      });
      paragraphLines = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track code blocks
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip HTML comments (cortex markers, etc.)
    if (line.trim().startsWith("<!--") && line.trim().endsWith("-->")) continue;

    // Detect headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      if (currentSection.items.length > 0 || currentSection.heading !== "default") {
        sections.push(currentSection);
      }
      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        items: [],
      };
      continue;
    }

    // Detect bullet points
    const bulletMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      currentSection.items.push({
        content: bulletMatch[1].trim(),
        lineNumber: lineNum,
        format: "bullet",
      });
      continue;
    }

    // Blank line → flush paragraph
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }

    // Accumulate paragraph text
    if (paragraphLines.length === 0) {
      paragraphStartLine = lineNum;
    }
    paragraphLines.push(line);
  }

  // Flush final paragraph and section
  flushParagraph();
  if (currentSection.items.length > 0 || currentSection.heading !== "default") {
    sections.push(currentSection);
  }

  return sections;
}

// ─── Read CLAUDE.md → Normalized Conversations ──────────────────────────────

/**
 * Parse CLAUDE.md files from a directory. Looks for:
 * - CLAUDE.md in the directory root
 * - .claude/CLAUDE.md
 * Both are treated as "conversations" for the pipeline.
 */
export async function parseClaudeCodeMemory(
  directoryPath: string
): Promise<NormalizedConversation[]> {
  // Direct file candidates in the directory
  const candidates = [
    join(/* turbopackIgnore: true */ directoryPath, "CLAUDE.md"),
    join(/* turbopackIgnore: true */ directoryPath, ".claude", "CLAUDE.md"),
    join(/* turbopackIgnore: true */ directoryPath, "MEMORY.md"),
    join(/* turbopackIgnore: true */ directoryPath, ".claude", "MEMORY.md"),
  ];

  // Also scan projects/*/memory/ for all .md files
  const projectsDir = join(/* turbopackIgnore: true */ directoryPath, "projects");
  try {
    const projectDirs = await readdir(projectsDir);
    for (const projDir of projectDirs) {
      const memoryDir = join(/* turbopackIgnore: true */ projectsDir, projDir, "memory");
      try {
        const memFiles = await readdir(memoryDir);
        for (const file of memFiles) {
          if (file.endsWith(".md")) {
            candidates.push(join(/* turbopackIgnore: true */ memoryDir, file));
          }
        }
      } catch {
        // No memory dir for this project
      }
    }
  } catch {
    // No projects directory
  }

  const results: NormalizedConversation[] = [];

  for (const filePath of candidates) {
    try {
      await stat(/* turbopackIgnore: true */ filePath);
    } catch {
      continue;
    }

    const content = await readFile(/* turbopackIgnore: true */ filePath, "utf-8");
    if (!content.trim()) continue;

    const sections = parseMarkdownSections(content);
    const messages: NormalizedMessage[] = [];

    // Convert each section item into a "user" message for the extraction pipeline
    for (const section of sections) {
      for (const item of section.items) {
        const prefix = section.heading !== "default" ? `[${section.heading}] ` : "";
        messages.push({
          role: "user",
          content: `${prefix}${item.content}`,
          timestamp: null,
        });
      }
    }

    if (messages.length === 0) continue;

    const contentHash = createHash("sha256").update(content).digest("hex");

    results.push({
      externalId: `claude-code:${createHash("sha256").update(filePath).digest("hex").slice(0, 12)}`,
      title: `Claude Code Memory (${filePath.split("/").slice(-2).join("/")})`,
      messages,
      contentHash,
      sourceDate: null,
    });
  }

  return results;
}

// ─── Write CLAUDE.md with cortex markers ────────────────────────────────────

interface MemoryForExport {
  content: string;
  category: string;
}

const CATEGORY_HEADINGS: Record<string, string> = {
  identity: "Identity",
  education_career: "Education & Career",
  projects: "Projects",
  research: "Research",
  preferences: "Preferences",
  goals: "Goals",
  relationships: "Relationships",
  writing_voice: "Writing Voice",
  workflows: "Workflows",
  temporary: "Current Context",
};

/**
 * Generate the cortex-managed section content.
 */
export function formatCortexSection(memories: MemoryForExport[]): string {
  // Group by category
  const grouped = new Map<string, string[]>();
  for (const mem of memories) {
    const existing = grouped.get(mem.category) || [];
    existing.push(mem.content);
    grouped.set(mem.category, existing);
  }

  const lines: string[] = [];
  lines.push(CORTEX_BEGIN);
  lines.push(`<!-- Synced by Cortex | ${new Date().toISOString()} -->`);

  for (const [category, items] of grouped) {
    const heading = CATEGORY_HEADINGS[category] || category;
    lines.push("");
    lines.push(`## ${heading}`);
    lines.push("");
    for (const item of items) {
      lines.push(`- ${item}`);
    }
  }

  lines.push(CORTEX_END);
  return lines.join("\n");
}

/**
 * Write memories to a CLAUDE.md file, preserving content outside cortex markers.
 */
export async function writeClaudeCodeMemory(
  filePath: string,
  memories: MemoryForExport[]
): Promise<void> {
  let existingContent = "";
  try {
    existingContent = await readFile(/* turbopackIgnore: true */ filePath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  const cortexSection = formatCortexSection(memories);

  if (!existingContent.trim()) {
    // No existing file — write cortex section only
    await writeFile(/* turbopackIgnore: true */ filePath, cortexSection + "\n", "utf-8");
    return;
  }

  // Replace existing cortex section, or append if none exists
  const beginIdx = existingContent.indexOf(CORTEX_BEGIN);
  const endIdx = existingContent.indexOf(CORTEX_END);

  if (beginIdx !== -1 && endIdx !== -1) {
    // Replace between markers (inclusive)
    const before = existingContent.slice(0, beginIdx).trimEnd();
    const after = existingContent.slice(endIdx + CORTEX_END.length).trimStart();
    const parts = [before, "", cortexSection];
    if (after) parts.push("", after);
    await writeFile(/* turbopackIgnore: true */ filePath, parts.join("\n") + "\n", "utf-8");
  } else {
    // No markers found — append cortex section at the end
    const combined = existingContent.trimEnd() + "\n\n" + cortexSection + "\n";
    await writeFile(/* turbopackIgnore: true */ filePath, combined, "utf-8");
  }
}
