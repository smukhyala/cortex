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

  const duplicateCount = result.data.groups.reduce((sum, g) => sum + g.duplicateIds.length, 0);

  return {
    groups: result.data.groups,
    uniqueCount: result.data.uniqueIds.length,
    duplicateCount,
    tokensUsed: result.inputTokens + result.outputTokens,
  };
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
    if (group.duplicateIds.length === 0) continue;

    const keepId = group.duplicateIds[0];
    const archiveIds = group.duplicateIds.slice(1);

    // Verify the memory still exists and is active
    const keepMem = await prisma.memory.findFirst({
      where: { id: keepId, status: "active" },
    });
    if (!keepMem) continue;

    // Update the kept memory with canonical content
    await prisma.memory.update({
      where: { id: keepId },
      data: { content: group.canonical },
    });
    merged++;

    // Archive duplicates (skip if already archived)
    for (const id of archiveIds) {
      const exists = await prisma.memory.findFirst({
        where: { id, status: "active" },
      });
      if (!exists) continue;

      await prisma.memory.update({
        where: { id },
        data: {
          status: "archived",
          archivedAt: new Date(),
          archivedReason: `Deduplicated — merged into ${keepId}`,
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
