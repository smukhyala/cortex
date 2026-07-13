interface MemoryForExport {
  content: string;
  category: string;
  sensitive: boolean;
}

const CORTEX_BEGIN = "<!-- cortex:begin -->";
const CORTEX_END = "<!-- cortex:end -->";

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

export function formatCortexSection(
  memories: Array<{ content: string; category: string }>,
  opts?: { workspaceMode?: boolean }
): string {
  const lines: string[] = [];
  lines.push(CORTEX_BEGIN);
  lines.push(`<!-- Synced by Cortex | ${new Date().toISOString()} -->`);

  if (opts?.workspaceMode) {
    // Workspace-first: flat list under a single "Current Workspace" heading
    lines.push("");
    lines.push("## Current Workspace");
    lines.push("");
    for (const mem of memories) {
      lines.push(`- ${mem.content}`);
    }
  } else {
    // Legacy: group by category
    const grouped = new Map<string, string[]>();
    for (const mem of memories) {
      const existing = grouped.get(mem.category) || [];
      existing.push(mem.content);
      grouped.set(mem.category, existing);
    }

    for (const [category, items] of grouped) {
      const heading = CATEGORY_HEADINGS[category] || category;
      lines.push("");
      lines.push(`## ${heading}`);
      lines.push("");
      for (const item of items) {
        lines.push(`- ${item}`);
      }
    }
  }

  lines.push(CORTEX_END);
  return lines.join("\n");
}

/**
 * Format memories as a CLAUDE.md string with cortex markers.
 */
export function formatForClaude(
  memories: MemoryForExport[],
  opts?: { includeSensitive?: boolean; workspaceMode?: boolean }
): string {
  const filtered = opts?.includeSensitive
    ? memories
    : memories.filter((m) => !m.sensitive);

  return formatCortexSection(filtered, { workspaceMode: opts?.workspaceMode });
}

/**
 * Write memories to a CLAUDE.md file, preserving non-Cortex content.
 */
export async function writeClaudeExport(
  filePath: string,
  memories: MemoryForExport[],
  opts?: { includeSensitive?: boolean }
): Promise<void> {
  const filtered = opts?.includeSensitive
    ? memories
    : memories.filter((m) => !m.sensitive);

  const { writeClaudeCodeMemory } = await import("@/parsers/claude-code");
  await writeClaudeCodeMemory(filePath, filtered);
}
