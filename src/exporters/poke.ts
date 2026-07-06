import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";

interface MemoryForExport {
  content: string;
  category: string;
  sensitive: boolean;
}

const POKE_API_ENDPOINT = "https://poke.com/api/v1/inbound/api-message";
const POKE_LEGACY_WEBHOOK_ENDPOINT = "https://poke.com/api/v1/inbound-sms/webhook";

interface PokePayload {
  message: string;
  source: "cortex";
  run_id: string;
  user_approved_external_action: false;
  metadata: Record<string, unknown> & {
    type: string;
    timestamp: string;
  };
}

export interface PokePushResult {
  success: boolean;
  message?: string;
  error?: string;
  payload?: PokePayload;
  endpoint?: string;
  httpStatus?: number;
  responseSnippet?: string;
}

/**
 * Format memories as a context message for the Poke inbound API.
 */
export function formatPokeContext(memories: MemoryForExport[]): string {
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

interface PushToPokeOptions {
  dryRun?: boolean;
  fetchFn?: typeof fetch;
  message?: string;
  metadata?: Record<string, unknown>;
  runId?: string;
}

function buildPokePayload(
  memories: MemoryForExport[],
  options: Pick<PushToPokeOptions, "message" | "metadata" | "runId"> = {}
): PokePayload {
  const includedMemoryCount = memories.filter((m) => !m.sensitive).length;
  const timestamp = new Date().toISOString();

  return {
    message: options.message ?? formatPokeContext(memories),
    source: "cortex",
    run_id: options.runId ?? `cortex-memory-sync-${timestamp}`,
    user_approved_external_action: false,
    metadata: {
      type: "memory_sync",
      memoryCount: memories.length,
      includedMemoryCount,
      omittedSensitiveCount: memories.length - includedMemoryCount,
      timestamp,
      ...options.metadata,
    },
  };
}

async function readResponseSnippet(response: Response): Promise<string> {
  const text = await response.text();
  return text.slice(0, 500);
}

/**
 * Push memories to Poke via the inbound API.
 * POST https://poke.com/api/v1/inbound/api-message
 */
export async function pushToPoke(
  memories: MemoryForExport[],
  apiKey: string,
  options: PushToPokeOptions = {}
): Promise<PokePushResult> {
  const { dryRun = false, fetchFn = fetch } = options;
  const endpoint = getPokeEndpoint(apiKey);
  const payload = buildPokePayload(memories, options);

  if (dryRun) {
    return {
      success: true,
      message: "Dry run - payload generated but not sent",
      payload,
      endpoint,
    };
  }

  try {
    const response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const responseSnippet = await readResponseSnippet(response);

    if (!response.ok) {
      return {
        success: false,
        error: `Poke API error (${response.status}): ${responseSnippet}`,
        endpoint,
        httpStatus: response.status,
        responseSnippet,
      };
    }

    let message = "Context accepted by Poke API";
    try {
      const data = responseSnippet ? JSON.parse(responseSnippet) : {};
      if (typeof data.message === "string") message = data.message;
    } catch {
      // Some Poke responses are plain text or empty; HTTP 2xx still means accepted.
    }

    return {
      success: true,
      message,
      endpoint,
      httpStatus: response.status,
      responseSnippet,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to reach Poke API: ${message}`,
      endpoint,
    };
  }
}
