import { prisma } from "@/lib/db";
import type { ExchangeFact, ExchangeOrigin } from "@/contracts/exchange";
import type { ExtractedMemory } from "@/contracts/pipeline";
import { MEMORY_CATEGORIES, type MemoryCategory } from "@/contracts/memory";
import { deduplicateMemories } from "@/pipeline/deduplicate";
import { commit } from "@/pipeline/commit";
import { propagateToAllPlatforms } from "@/services/propagate";

interface ExchangeIngestParams {
  origin: ExchangeOrigin;
  facts: ExchangeFact[];
  topic?: string;
  summary?: string;
  propagate?: boolean;
}

export interface ExchangeIngestResult {
  sourceId: string;
  memoriesCreated: number;
  referencesUpdated: number;
  conflictsCreated: number;
  reviewItemsCreated: number;
  propagatedDestinations: Array<{ type: string; name: string; success: boolean; error?: string }>;
}

const ORIGIN_SOURCE: Record<ExchangeOrigin, { type: string; name: string }> = {
  claude: { type: "claude_desktop", name: "Claude (Exchange)" },
  poke: { type: "poke", name: "Poke (Exchange)" },
  manual: { type: "manual", name: "Cortex Manual" },
};

const TOPIC_TO_CATEGORY: Record<string, MemoryCategory> = {
  identity: "identity",
  personal: "identity",
  profile: "identity",
  background: "identity",
  education: "education_career",
  school: "education_career",
  career: "education_career",
  work: "education_career",
  project: "projects",
  startup: "projects",
  research: "research",
  interest: "research",
  preference: "preferences",
  favorite: "preferences",
  style: "preferences",
  goal: "goals",
  plan: "goals",
  relationship: "relationships",
  people: "relationships",
  writing: "writing_voice",
  voice: "writing_voice",
  workflow: "workflows",
  tool: "workflows",
  temporary: "temporary",
  current: "temporary",
};

function inferCategory(topicOrContent: string | undefined): MemoryCategory {
  const lower = (topicOrContent || "").toLowerCase();
  for (const [keyword, category] of Object.entries(TOPIC_TO_CATEGORY)) {
    if (lower.includes(keyword)) return category;
  }
  return "identity";
}

function normalizeCategory(fact: ExchangeFact, topic?: string): string {
  if (fact.category && fact.category.length > 0) return fact.category;
  const inferred = inferCategory(`${topic || ""} ${fact.content}`);
  return MEMORY_CATEGORIES.includes(inferred) ? inferred : "identity";
}

async function getOrCreateExchangeSource(origin: ExchangeOrigin): Promise<string> {
  const sourceConfig = ORIGIN_SOURCE[origin];
  const existing = await prisma.source.findFirst({
    where: { type: sourceConfig.type, name: sourceConfig.name },
    select: { id: true },
  });
  if (existing) return existing.id;

  const source = await prisma.source.create({
    data: {
      type: sourceConfig.type,
      name: sourceConfig.name,
      status: "active",
      config: JSON.stringify({ exchangeOrigin: origin }),
    },
  });
  return source.id;
}

function skipDestinationsForOrigin(origin: ExchangeOrigin): string[] {
  if (origin === "poke") return ["poke"];
  return [];
}

function buildPokeMessage(origin: ExchangeOrigin, facts: ExtractedMemory[]): string {
  const originLabel = origin === "claude" ? "Claude" : origin === "poke" ? "Poke" : "Cortex";
  return [
    `Cortex exchange update from ${originLabel}.`,
    "Please remember these user facts and use them in future answers automatically:",
    ...facts.map((fact) => `- ${fact.content}`),
  ].join("\n");
}

export async function ingestExchangeFacts(params: ExchangeIngestParams): Promise<ExchangeIngestResult> {
  const sourceId = await getOrCreateExchangeSource(params.origin);
  const extractedMemories: ExtractedMemory[] = params.facts.map((fact) => ({
    content: fact.content,
    subject: "user",
    category: normalizeCategory(fact, params.topic),
    confidence: 0.9,
    verbatimQuote: fact.content,
    temporality: "durable",
    sensitive: fact.sensitive ?? false,
    isCorrection: false,
  }));

  let clean = extractedMemories;
  let conflicts: Awaited<ReturnType<typeof deduplicateMemories>>["output"]["conflicts"] = [];
  let duplicateReferences: Awaited<ReturnType<typeof deduplicateMemories>>["output"]["duplicateReferences"] = [];
  let duplicatesDropped = 0;

  try {
    const dedupResult = await deduplicateMemories(extractedMemories);
    clean = dedupResult.output.clean;
    conflicts = dedupResult.output.conflicts;
    duplicateReferences = dedupResult.output.duplicateReferences;
    duplicatesDropped = dedupResult.output.duplicatesDropped;
  } catch (error) {
    console.error("Exchange dedup failed, committing all facts as active:", error);
  }

  const commitResult = await commit({
    sourceId,
    clean,
    conflicts,
    duplicateReferences,
    initialStatus: "active",
    conversationMap: new Map(),
  });

  await prisma.activityLog.create({
    data: {
      action: "exchange_ingest",
      summary: `${params.origin} shared ${params.facts.length} fact(s) with Cortex`,
      details: JSON.stringify({
        origin: params.origin,
        topic: params.topic,
        summary: params.summary,
        factsReceived: params.facts.length,
        memoriesCreated: commitResult.memoriesCreated,
        duplicatesDropped,
        referencesUpdated: commitResult.referencesUpdated,
        conflictsCreated: commitResult.conflictsCreated,
      }),
    },
  });

  let propagatedDestinations: ExchangeIngestResult["propagatedDestinations"] = [];
  if (params.propagate !== false) {
    const propagation = await propagateToAllPlatforms({
      pokeMessage: buildPokeMessage(params.origin, extractedMemories),
      pokeRunId: `cortex-exchange-${params.origin}-${Date.now()}`,
      pokeMetadata: {
        type: "exchange_ingest",
        origin: params.origin,
        categories: Array.from(new Set(extractedMemories.map((memory) => memory.category))),
      },
      skipDestinations: skipDestinationsForOrigin(params.origin),
    });
    propagatedDestinations = propagation.destinations;
  }

  return {
    sourceId,
    memoriesCreated: commitResult.memoriesCreated,
    referencesUpdated: commitResult.referencesUpdated,
    conflictsCreated: commitResult.conflictsCreated,
    reviewItemsCreated: commitResult.reviewItemsCreated,
    propagatedDestinations,
  };
}
