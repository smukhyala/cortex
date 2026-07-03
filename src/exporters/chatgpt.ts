import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";

interface MemoryForExport {
  content: string;
  category: string;
  sensitive: boolean;
}

/**
 * Format memories as ChatGPT Custom Instructions text.
 * Short, third-person factual statements, one per line.
 */
export function formatForChatGPT(
  memories: MemoryForExport[],
  opts?: { includeSensitive?: boolean }
): string {
  const filtered = opts?.includeSensitive
    ? memories
    : memories.filter((m) => !m.sensitive);

  if (filtered.length === 0) return "";

  // Group by category for readability
  const grouped = new Map<string, string[]>();
  for (const mem of filtered) {
    const items = grouped.get(mem.category) || [];
    items.push(mem.content);
    grouped.set(mem.category, items);
  }

  const lines: string[] = [];
  for (const [category, items] of grouped) {
    const label = CATEGORY_LABELS[category as MemoryCategory] || category;
    lines.push(`[${label}]`);
    for (const item of items) {
      lines.push(item);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
