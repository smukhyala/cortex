import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";
import { ContextBundleSchema, type ContextBundle, type ContextDestination } from "@/contracts/context";
import { filterMemoriesForDestination, getExchangePolicy } from "@/services/exchange-policy";
import type { ExchangeDestination } from "@/contracts/exchange";
import { computeWorkspace } from "@/services/workspace";

interface ContextOptions {
  destination?: ContextDestination;
  sourceId?: string;
  includeSensitive?: boolean;
  maxItems?: number;
  /** When provided, uses workspace engine to select memories based on query relevance + coherence */
  workspaceQuery?: string;
  /** Focus mode for workspace steering */
  workspaceFocusMode?: string;
}

interface RawMemory {
  id: string;
  content: string;
  category: string;
  subject: string;
  confidence: number;
  temporality: string;
  sensitive: boolean;
  referenceCount: number;
  updatedAt: Date;
  lastReferencedAt: Date;
}

const POLICY_DESTINATIONS = new Set<string>([
  "claude_code",
  "claude_desktop",
  "claude_export",
  "poke",
]);

function labelForCategory(category: string): string {
  return CATEGORY_LABELS[category as MemoryCategory] || category;
}

function sortMemories(a: RawMemory, b: RawMemory): number {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  if (a.referenceCount !== b.referenceCount) return b.referenceCount - a.referenceCount;
  return b.lastReferencedAt.getTime() - a.lastReferencedAt.getTime();
}

async function policyConfigFor(destination?: ContextDestination, sourceId?: string): Promise<string | null> {
  if (!destination || destination === "chatgpt" || !POLICY_DESTINATIONS.has(destination)) {
    return null;
  }

  if (sourceId) {
    const source = await prisma.source.findUnique({
      where: { id: sourceId },
      select: { config: true },
    });
    return source?.config ?? null;
  }

  const source = await prisma.source.findFirst({
    where: { type: destination, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { config: true },
  });
  return source?.config ?? null;
}

function buildVersion(memories: RawMemory[], generatedAt: string): string {
  const hash = createHash("sha256");
  hash.update(generatedAt);
  for (const memory of memories) {
    hash.update(memory.id);
    hash.update(memory.updatedAt.toISOString());
    hash.update(String(memory.referenceCount));
  }
  return hash.digest("hex").slice(0, 16);
}

function formatMarkdown(groups: ContextBundle["groups"], memoryCount: number): string {
  if (memoryCount === 0) {
    return "No Cortex memories are available yet.";
  }

  const lines = [`Found ${memoryCount} Cortex memories:`, ""];
  for (const group of groups) {
    lines.push(`## ${group.label}`);
    for (const memory of group.memories) {
      lines.push(`- ${memory.content}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function formatPrompt(groups: ContextBundle["groups"], memoryCount: number): string {
  if (memoryCount === 0) {
    return "No Cortex context is available yet. If you learn durable facts about the user, save them to Cortex.";
  }

  return [
    "Use this Cortex context as the user's current authoritative profile.",
    "Prefer these facts over stale remembered details. If the user provides durable updates, log them back to Cortex.",
    "",
    formatMarkdown(groups, memoryCount),
  ].join("\n");
}

export async function getContextBundle(options: ContextOptions = {}): Promise<ContextBundle> {
  const allMemories = await prisma.memory.findMany({
    where: { status: "active" },
    orderBy: [{ category: "asc" }, { lastReferencedAt: "desc" }],
    select: {
      id: true,
      content: true,
      category: true,
      subject: true,
      confidence: true,
      temporality: true,
      sensitive: true,
      referenceCount: true,
      updatedAt: true,
      lastReferencedAt: true,
    },
  });

  const config = await policyConfigFor(options.destination, options.sourceId);
  const exchangeDestination = options.destination && options.destination !== "chatgpt"
    ? options.destination as ExchangeDestination
    : null;
  const policy = exchangeDestination
    ? getExchangePolicy(config, exchangeDestination)
    : null;

  let selected: RawMemory[];

  if (options.workspaceQuery) {
    // Workspace path: coherence-aware, capacity-limited selection
    const workspaceState = await computeWorkspace({
      question: options.workspaceQuery,
      focusModeId: options.workspaceFocusMode,
    });
    const workspaceIds = new Set(workspaceState.active.map((c) => c.memoryId));
    selected = allMemories
      .filter((m) => workspaceIds.has(m.id))
      .filter((m) => options.includeSensitive || !m.sensitive);
  } else {
    // Original flat path
    const policyFiltered = policy
      ? filterMemoriesForDestination(allMemories, policy)
      : allMemories.filter((memory) => options.includeSensitive || !memory.sensitive);
    const sensitiveFiltered = options.includeSensitive
      ? policyFiltered
      : policyFiltered.filter((memory) => !memory.sensitive);
    const sorted = sensitiveFiltered.sort(sortMemories);
    selected = typeof options.maxItems === "number" && options.maxItems > 0
      ? sorted.slice(0, options.maxItems)
      : sorted;
  }
  const omittedSensitiveCount = allMemories.filter((memory) => memory.sensitive).length;

  const grouped = new Map<string, RawMemory[]>();
  for (const memory of selected) {
    const items = grouped.get(memory.category) || [];
    items.push(memory);
    grouped.set(memory.category, items);
  }

  const groups = Array.from(grouped.entries()).map(([category, memories]) => ({
    category,
    label: labelForCategory(category),
    memories: memories.map((memory) => ({
      ...memory,
      updatedAt: memory.updatedAt.toISOString(),
      lastReferencedAt: memory.lastReferencedAt.toISOString(),
    })),
  }));

  const generatedAt = new Date().toISOString();
  const memoryCount = selected.length;
  const markdown = formatMarkdown(groups, memoryCount);
  const prompt = formatPrompt(groups, memoryCount);

  return ContextBundleSchema.parse({
    version: buildVersion(selected, generatedAt),
    generatedAt,
    destination: options.destination,
    memoryCount,
    omittedSensitiveCount,
    groups,
    markdown,
    prompt,
  });
}
