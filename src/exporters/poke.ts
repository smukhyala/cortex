import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";

interface MemoryForExport {
  content: string;
  category: string;
  sensitive: boolean;
}

/**
 * Format memories as a context message for the Poke inbound API.
 */
function formatPokeContext(memories: MemoryForExport[]): string {
  const filtered = memories.filter((m) => !m.sensitive);

  const lines = ["Here is my current personal context:"];
  const grouped = new Map<string, string[]>();
  for (const mem of filtered) {
    const items = grouped.get(mem.category) || [];
    items.push(mem.content);
    grouped.set(mem.category, items);
  }

  for (const [category, items] of grouped) {
    const label = CATEGORY_LABELS[category as MemoryCategory] || category;
    lines.push(`\n${label}:`);
    for (const item of items) {
      lines.push(`- ${item}`);
    }
  }

  return lines.join("\n");
}

/**
 * Push memories to Poke via the inbound API.
 * POST https://poke.com/api/v1/inbound/api-message
 */
export async function pushToPoke(
  memories: MemoryForExport[],
  apiKey: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const context = formatPokeContext(memories);

  try {
    const response = await fetch("https://poke.com/api/v1/inbound/api-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        message: context,
        metadata: {
          source: "cortex",
          type: "context_sync",
          memoryCount: memories.length,
          timestamp: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `Poke API error (${response.status}): ${text}` };
    }

    const data = await response.json();
    return { success: true, message: data.message || "Context pushed to Poke" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to reach Poke API: ${message}` };
  }
}
