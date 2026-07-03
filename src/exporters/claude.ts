import { formatCortexSection, writeClaudeCodeMemory } from "@/parsers/claude-code";
import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";

interface MemoryForExport {
  content: string;
  category: string;
  sensitive: boolean;
}

/**
 * Format memories as a CLAUDE.md string with cortex markers.
 */
export function formatForClaude(
  memories: MemoryForExport[],
  opts?: { includeSensitive?: boolean }
): string {
  const filtered = opts?.includeSensitive
    ? memories
    : memories.filter((m) => !m.sensitive);

  return formatCortexSection(filtered);
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

  await writeClaudeCodeMemory(filePath, filtered);
}
