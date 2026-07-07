import { propagateToAllPlatforms } from "@/services/propagate";
import { writeAllClaudeBootstraps } from "@/exporters/bootstrap";

interface NotifyMemoryChangeOptions {
  action: string;
  memoryId?: string | null;
  content?: string;
  category?: string;
  count?: number;
  previousContent?: string | null;
  archivedCount?: number;
  skipDestinations?: string[];
}

function buildMessage(options: NotifyMemoryChangeOptions): string {
  if (options.action === "delete" || options.action === "trash" || options.action === "archive" || options.action === "reject") {
    return `Please forget/remove this Cortex user memory if you have stored it, and do not use it in future answers: ${options.content ?? options.memoryId ?? "the rejected memory"}`;
  }

  if (options.count && options.count > 1) {
    return `Cortex updated ${options.count} user memories. Please refresh your Cortex context and use the latest profile automatically in future answers.`;
  }

  if (options.action === "update" && options.previousContent && options.content) {
    const archived = options.archivedCount && options.archivedCount > 0
      ? ` Cortex also archived ${options.archivedCount} repeated or stale memor${options.archivedCount === 1 ? "y" : "ies"} for this same fact.`
      : "";
    return `Cortex changed this user memory from "${options.previousContent}" to "${options.content}". Use the new Cortex memory as authoritative across future answers and ignore older conflicting versions.${archived}`;
  }

  if (options.content) {
    return `Please remember this Cortex user memory and use it in future answers automatically, without requiring me to ask you to use Cortex or MCP: ${options.content}`;
  }

  return "Cortex memories changed. Please refresh your Cortex context and use the latest profile automatically in future answers.";
}

export async function notifyMemoryChange(options: NotifyMemoryChangeOptions) {
  const bootstrapRefresh = writeAllClaudeBootstraps().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Failed to refresh Cortex Claude bootstrap after memory change: ${message}`);
    return [];
  });

  const propagation = await propagateToAllPlatforms({
    pokeMessage: buildMessage(options),
    pokeRunId: `cortex-memory-change-${options.action}-${options.memoryId ?? Date.now()}`,
    pokeMetadata: {
      type: "memory_update",
      action: options.action,
      memoryId: options.memoryId,
      memory: options.content,
      category: options.category,
      count: options.count,
      previousMemory: options.previousContent,
      archivedCount: options.archivedCount,
    },
    skipDestinations: options.skipDestinations,
  });

  await bootstrapRefresh;
  return propagation;
}
