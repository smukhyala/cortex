import { prisma } from "@/lib/db";
import {
  ExchangeOrchestratorInputSchema,
  ExchangeOrchestratorOutputSchema,
  type ExchangeOrchestratorInput,
  type ExchangeOrchestratorOutput,
  type ExchangeOrigin,
  type ExchangeFact,
  type ExchangeDestination,
} from "@/contracts/exchange";
import { MEMORY_CATEGORIES, type MemoryCategory } from "@/contracts/memory";
import type { ExtractedMemory } from "@/contracts/pipeline";
import { deduplicateMemories } from "@/pipeline/deduplicate";
import { commit } from "@/pipeline/commit";
import { propagateToAllPlatforms } from "@/services/propagate";
import { getExchangePolicy, filterMemoriesForDestination } from "@/services/exchange-policy";

const ORIGIN_SOURCE: Record<ExchangeOrigin, { type: string; name: string }> = {
  claude: { type: "claude_desktop", name: "Claude (Exchange)" },
  poke: { type: "poke", name: "Poke (Exchange)" },
  manual: { type: "manual", name: "Cortex Manual" },
};

const TOPIC_TO_CATEGORY: Record<string, MemoryCategory> = {
  identity: "identity", personal: "identity", profile: "identity", background: "identity",
  education: "education_career", school: "education_career", career: "education_career", work: "education_career",
  project: "projects", startup: "projects",
  research: "research", interest: "research",
  preference: "preferences", favorite: "preferences", style: "preferences",
  goal: "goals", plan: "goals",
  relationship: "relationships", people: "relationships",
  writing: "writing_voice", voice: "writing_voice",
  workflow: "workflows", tool: "workflows",
  temporary: "temporary", current: "temporary",
};

function inferCategory(text: string | undefined): MemoryCategory {
  const lower = (text || "").toLowerCase();
  for (const [keyword, category] of Object.entries(TOPIC_TO_CATEGORY)) {
    if (lower.includes(keyword)) return category;
  }
  return "identity";
}

function normalizeCategory(fact: ExchangeFact, topic?: string): string {
  if (fact.category && MEMORY_CATEGORIES.includes(fact.category as MemoryCategory)) {
    return fact.category;
  }
  const inferred = inferCategory(`${topic || ""} ${fact.content}`);
  return MEMORY_CATEGORIES.includes(inferred) ? inferred : "identity";
}

async function getOrCreateExchangeSource(origin: ExchangeOrigin): Promise<string> {
  const cfg = ORIGIN_SOURCE[origin];
  const existing = await prisma.source.findFirst({
    where: { type: cfg.type, name: cfg.name },
    select: { id: true },
  });
  if (existing) return existing.id;
  const source = await prisma.source.create({
    data: { type: cfg.type, name: cfg.name, status: "active", config: JSON.stringify({ exchangeOrigin: origin }) },
  });
  return source.id;
}

function buildPokeMessage(origin: ExchangeOrigin, facts: ExtractedMemory[]): string {
  const label = origin === "claude" ? "Claude" : origin === "poke" ? "Poke" : "Cortex";
  return [
    `Cortex exchange update from ${label}.`,
    "Please remember these user facts and use them in future answers automatically:",
    ...facts.map((f) => `- ${f.content}`),
  ].join("\n");
}

function favoriteStatementKey(content: string): string | null {
  const match = content.match(/^User's favorite ([^.!?]+?) is\s+.+[.!?]?$/i);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

async function applyDirectSupersedes(memories: ExtractedMemory[]): Promise<{
  remaining: ExtractedMemory[];
  referencesUpdated: number;
}> {
  const remaining: ExtractedMemory[] = [];
  let referencesUpdated = 0;

  for (const memory of memories) {
    const favoriteKey = favoriteStatementKey(memory.content);
    if (!favoriteKey) {
      remaining.push(memory);
      continue;
    }

    const candidates = await prisma.memory.findMany({
      where: {
        status: "active",
        category: memory.category,
      },
      select: { id: true, content: true },
    });
    const existing = candidates.find(
      (candidate) => favoriteStatementKey(candidate.content) === favoriteKey
    );
    if (!existing) {
      remaining.push(memory);
      continue;
    }

    await prisma.memory.update({
      where: { id: existing.id },
      data: {
        content: memory.content,
        referenceCount: { increment: 1 },
        lastReferencedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    referencesUpdated++;

    await prisma.activityLog.create({
      data: {
        action: "exchange_direct_supersede",
        summary: "Updated existing favorite preference from exchange",
        details: JSON.stringify({
          existingMemoryId: existing.id,
          previousContent: existing.content,
          newContent: memory.content,
          category: memory.category,
        }),
      },
    });
  }

  return { remaining, referencesUpdated };
}

async function computeSkippedCategories(
  facts: ExchangeFact[],
  skipOriginDestinations: string[],
  topic?: string
): Promise<string[]> {
  const inputCategories = Array.from(
    new Set(facts.map((f) => normalizeCategory(f, topic)))
  );
  let sources: { type: string; config: string | null }[] = [];
  try {
    sources = await prisma.source.findMany({ where: { status: "active" } });
  } catch {
    return [];
  }
  const skipped = new Set<string>();
  const DESTINATION_TYPES = new Set<ExchangeDestination>(["claude_code", "poke"]);

  for (const source of sources) {
    const destType = source.type as ExchangeDestination;
    if (!DESTINATION_TYPES.has(destType)) continue;
    if (skipOriginDestinations.includes(source.type)) continue;
    const policy = getExchangePolicy(source.config, destType);
    for (const cat of inputCategories) {
      if (filterMemoriesForDestination([{ category: cat, sensitive: false }], policy).length === 0) {
        skipped.add(cat);
      }
    }
  }

  return Array.from(skipped);
}

export class ExchangeOrchestrator {
  async run(rawInput: ExchangeOrchestratorInput): Promise<ExchangeOrchestratorOutput> {
    const input = ExchangeOrchestratorInputSchema.parse(rawInput);
    const sourceId = await getOrCreateExchangeSource(input.origin);

    const extractedMemories: ExtractedMemory[] = input.facts.map((fact) => ({
      content: fact.content,
      subject: "user",
      category: normalizeCategory(fact, input.topic),
      confidence: 0.9,
      verbatimQuote: fact.content,
      temporality: "durable",
      sensitive: fact.sensitive ?? false,
      isCorrection: false,
    }));

    const directSupersede = await applyDirectSupersedes(extractedMemories);

    let clean = directSupersede.remaining;
    let conflicts: Awaited<ReturnType<typeof deduplicateMemories>>["output"]["conflicts"] = [];
    let duplicateReferences: Awaited<ReturnType<typeof deduplicateMemories>>["output"]["duplicateReferences"] = [];
    let duplicatesDropped = 0;

    if (directSupersede.remaining.length > 0) {
      try {
        const dedupResult = await deduplicateMemories(directSupersede.remaining);
        clean = dedupResult.output.clean;
        conflicts = dedupResult.output.conflicts;
        duplicateReferences = dedupResult.output.duplicateReferences;
        duplicatesDropped = dedupResult.output.duplicatesDropped;
      } catch (error) {
        console.error("Exchange dedup failed, committing all facts as active:", error);
      }
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
        summary: `${input.origin} shared ${input.facts.length} fact(s) with Cortex`,
        details: JSON.stringify({
          origin: input.origin,
          topic: input.topic,
          summary: input.summary,
          factsReceived: input.facts.length,
          memoriesCreated: commitResult.memoriesCreated,
          duplicatesDropped,
          referencesUpdated: commitResult.referencesUpdated + directSupersede.referencesUpdated,
          conflictsCreated: commitResult.conflictsCreated,
        }),
      },
    });

    const skipDestinations = input.origin === "poke" ? ["poke"] : [];
    const skippedCategories = await computeSkippedCategories(input.facts, skipDestinations, input.topic);

    let propagatedDestinations: ExchangeOrchestratorOutput["propagatedDestinations"] = [];
    if (input.propagate) {
      const propagation = await propagateToAllPlatforms({
        pokeMessage: buildPokeMessage(input.origin, extractedMemories),
        pokeRunId: `cortex-exchange-${input.origin}-${Date.now()}`,
        pokeMetadata: {
          type: "exchange_ingest",
          origin: input.origin,
          categories: Array.from(new Set(extractedMemories.map((m) => m.category))),
        },
        skipDestinations,
      });
      propagatedDestinations = propagation.destinations;
    }

    const output: ExchangeOrchestratorOutput = {
      sourceId,
      memoriesCreated: commitResult.memoriesCreated,
      referencesUpdated: commitResult.referencesUpdated + directSupersede.referencesUpdated,
      conflictsCreated: commitResult.conflictsCreated,
      reviewItemsCreated: commitResult.reviewItemsCreated,
      propagatedDestinations,
      skippedCategories,
    };

    return ExchangeOrchestratorOutputSchema.parse(output);
  }
}
