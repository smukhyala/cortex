import { propagateToAllPlatforms } from "@/services/propagate";

interface NotifyMemoryChangeOptions {
  action: string;
  memoryId?: string | null;
  content?: string;
  category?: string;
  count?: number;
  skipDestinations?: string[];
}

function buildMessage(options: NotifyMemoryChangeOptions): string {
  if (options.action === "delete" || options.action === "archive" || options.action === "reject") {
    return `Please forget/remove this Cortex user memory if you have stored it, and do not use it in future answers: ${options.content ?? options.memoryId ?? "the rejected memory"}`;
  }

  if (options.count && options.count > 1) {
    return `Cortex updated ${options.count} user memories. Please refresh your Cortex context and use the latest profile automatically in future answers.`;
  }

  if (options.content) {
    return `Please remember this Cortex user memory and use it in future answers automatically, without requiring me to ask you to use Cortex or MCP: ${options.content}`;
  }

  return "Cortex memories changed. Please refresh your Cortex context and use the latest profile automatically in future answers.";
}

export async function notifyMemoryChange(options: NotifyMemoryChangeOptions) {
  return propagateToAllPlatforms({
    pokeMessage: buildMessage(options),
    pokeRunId: `cortex-memory-change-${options.action}-${options.memoryId ?? Date.now()}`,
    pokeMetadata: {
      type: "memory_update",
      action: options.action,
      memoryId: options.memoryId,
      memory: options.content,
      category: options.category,
      count: options.count,
    },
    skipDestinations: options.skipDestinations,
  });
}
