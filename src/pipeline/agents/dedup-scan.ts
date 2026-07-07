import { z } from "zod";
import { structuredCall } from "@/lib/llm";
import { prisma } from "@/lib/db";

/**
 * Post-hoc deduplication agent.
 * Scans ALL active memories, groups by category, finds semantic duplicates
 * via LLM comparison, and returns merge/archive recommendations.
 */

const DedupGroupSchema = z.object({
  canonical: z.string().describe("The single best version of this fact — clear, complete, and atomic"),
  duplicateIds: z.array(z.string()).describe("IDs of memories that are duplicates or near-duplicates of the canonical fact"),
  reasoning: z.string().describe("Why these are duplicates and what the canonical version captures"),
});

const DedupResultSchema = z.object({
  groups: z.array(DedupGroupSchema),
  uniqueIds: z.array(z.string()).describe("IDs of memories that have no duplicates"),
});

export interface DedupScanResult {
  groups: Array<{
    canonical: string;
    duplicateIds: string[];
    reasoning: string;
  }>;
  uniqueCount: number;
  duplicateCount: number;
  tokensUsed: number;
}

interface ActiveMemoryForDedupApply {
  id: string;
  referenceCount: number;
  lastReferencedAt: Date;
  confidence: number;
  updatedAt: Date;
  createdAt: Date;
}

const DEDUP_SYSTEM_PROMPT = `You are a deduplication agent for a personal memory system. You will be given a list of memories (facts about a person) and must identify groups of duplicates or near-duplicates.

Rules:
- Two memories are duplicates if they express the SAME underlying fact, even if worded differently
- "User's name is Sanjay" and "The user is named Sanjay" are duplicates
- "User prefers TypeScript" and "User likes TypeScript over JavaScript" are near-duplicates — merge into the more specific one
- "User is researching X with Y" and "User collaborates with Y on X research" are near-duplicates
- Facts that share a subject but add DIFFERENT information are NOT duplicates
- For each group, pick the BEST single version (most specific, most complete, most clearly stated)
- A memory with no duplicates should go in the uniqueIds array

Output ALL memory IDs — every ID must appear exactly once, either in a duplicate group or in uniqueIds.`;

export async function runDedupScan(): Promise<DedupScanResult> {
  const memories = await prisma.memory.findMany({
    where: { status: "active" },
    select: { id: true, content: true, category: true, confidence: true },
    orderBy: { category: "asc" },
  });

  if (memories.length === 0) {
    return { groups: [], uniqueCount: 0, duplicateCount: 0, tokensUsed: 0 };
  }

  // Build memory list for the LLM
  const memoryList = memories
    .map((m) => `[${m.id}] (${m.category}) ${m.content}`)
    .join("\n");

  const result = await structuredCall({
    system: DEDUP_SYSTEM_PROMPT,
    user: `Find all duplicate and near-duplicate groups in these ${memories.length} memories:\n\n${memoryList}`,
    schema: DedupResultSchema,
    schemaName: "find_duplicates",
    schemaDescription: "Identify groups of duplicate memories and the best canonical version for each",
    maxTokens: 4096,
    temperature: 0,
  });

  const knownIds = new Set(memories.map((memory) => memory.id));
  const usedIds = new Set<string>();
  const groups = result.data.groups
    .map((group) => {
      const duplicateIds = group.duplicateIds.filter((id) => {
        if (!knownIds.has(id) || usedIds.has(id)) return false;
        usedIds.add(id);
        return true;
      });
      return { ...group, duplicateIds };
    })
    .filter((group) => group.duplicateIds.length > 1);

  const duplicateCount = groups.reduce((sum, group) => sum + group.duplicateIds.length - 1, 0);
  const uniqueCount = memories.length - groups.reduce((sum, group) => sum + group.duplicateIds.length, 0);

  return {
    groups,
    uniqueCount,
    duplicateCount,
    tokensUsed: result.inputTokens + result.outputTokens,
  };
}

function chooseKeeper(memories: ActiveMemoryForDedupApply[]): ActiveMemoryForDedupApply {
  return [...memories].sort((a, b) =>
    b.referenceCount - a.referenceCount ||
    b.lastReferencedAt.getTime() - a.lastReferencedAt.getTime() ||
    b.confidence - a.confidence ||
    b.updatedAt.getTime() - a.updatedAt.getTime() ||
    b.createdAt.getTime() - a.createdAt.getTime()
  )[0];
}

/**
 * Apply dedup results: for each group, update the canonical memory content
 * and archive the duplicates.
 */
export async function applyDedupResults(
  groups: Array<{ canonical: string; duplicateIds: string[] }>
): Promise<{ merged: number; archived: number }> {
  let merged = 0;
  let archived = 0;

  for (const group of groups) {
    const uniqueIds = Array.from(new Set(group.duplicateIds));
    if (uniqueIds.length < 2) continue;

    const activeMemories = await prisma.memory.findMany({
      where: { id: { in: uniqueIds }, status: "active" },
      select: {
        id: true,
        referenceCount: true,
        lastReferencedAt: true,
        confidence: true,
        updatedAt: true,
        createdAt: true,
      },
    });
    if (activeMemories.length < 2) continue;

    const keepMem = chooseKeeper(activeMemories);
    const keepId = keepMem.id;
    const archiveIds = activeMemories
      .map((memory) => memory.id)
      .filter((id) => id !== keepId);
    const archivedReferenceCount = activeMemories
      .filter((memory) => memory.id !== keepId)
      .reduce((sum, memory) => sum + memory.referenceCount, 0);
    const lastReferencedAt = activeMemories.reduce(
      (latest, memory) => memory.lastReferencedAt > latest ? memory.lastReferencedAt : latest,
      keepMem.lastReferencedAt
    );

    // Update the strongest retained memory with canonical content and carry forward evidence.
    await prisma.memory.update({
      where: { id: keepId },
      data: {
        content: group.canonical,
        referenceCount: { increment: archivedReferenceCount },
        lastReferencedAt,
      },
    });
    merged++;

    // Archive duplicates from the active set fetched above.
    for (const id of archiveIds) {
      await prisma.memory.update({
        where: { id },
        data: {
          status: "archived",
          archivedAt: new Date(),
          archivedReason: `Deduplicated - merged into ${keepId}`,
        },
      });
      archived++;
    }
  }

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: "dedup_completed",
      summary: `Deduplication: ${merged} groups merged, ${archived} duplicates archived`,
      details: JSON.stringify({ merged, archived }),
    },
  });

  return { merged, archived };
}
