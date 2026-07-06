import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";

interface MemoryForExport {
  content: string;
  category: string;
  sensitive: boolean;
}

const POKE_API_ENDPOINT = "https://poke.com/api/v1/inbound/api-message";
const POKE_LEGACY_WEBHOOK_ENDPOINT = "https://poke.com/api/v1/inbound-sms/webhook";

/**
 * Format memories as a context message for the Poke inbound API.
 */
function formatPokeContext(memories: MemoryForExport[]): string {
  const filtered = memories.filter((m) => !m.sensitive);

  const lines = [
    "Cortex memory sync update.",
    "Please update your memory/context about me with the facts below. Treat this as the current authoritative profile and prefer it over older conflicting details. Do not take any external action; just absorb/update memory.",
  ];
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

function getPokeEndpoint(apiKey: string): string {
  return apiKey.startsWith("pk_") ? POKE_LEGACY_WEBHOOK_ENDPOINT : POKE_API_ENDPOINT;
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
  const endpoint = getPokeEndpoint(apiKey);
  const includedMemoryCount = memories.filter((m) => !m.sensitive).length;
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        message: context,
        source: "cortex",
        run_id: `cortex-memory-sync-${timestamp}`,
        user_approved_external_action: false,
        metadata: {
          type: "memory_sync",
          memoryCount: memories.length,
          includedMemoryCount,
          omittedSensitiveCount: memories.length - includedMemoryCount,
          timestamp,
        },
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      return { success: false, error: `Poke API error (${response.status}): ${text}` };
    }

    try {
      const data = text ? JSON.parse(text) : {};
      return { success: true, message: data.message || "Context accepted by Poke API" };
    } catch {
      return { success: true, message: "Context accepted by Poke API" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to reach Poke API: ${message}` };
  }
}
