import { prisma } from "@/lib/db";
import type { ExtractedMemory, DeduplicationOutput } from "@/contracts/pipeline";

export interface CommitResult {
  memoriesCreated: number;
  reviewItemsCreated: number;
  conflictsCreated: number;
  autoApproved: number;
}

/**
 * Agent 4: Commit
 * Writes memories, conflicts, and review items to the database.
 *
 * Auto-approve logic: A memory is auto-approved ONLY if it is a refinement
 * of an already-approved memory AND not sensitive AND not a correction.
 */
export async function commit(params: {
  sourceId: string;
  clean: ExtractedMemory[];
  conflicts: DeduplicationOutput["conflicts"];
  conversationMap: Map<string, string>; // externalId -> DB conversationId
}): Promise<CommitResult> {
  let memoriesCreated = 0;
  let reviewItemsCreated = 0;
  let conflictsCreated = 0;
  let autoApproved = 0;

  // 1. Create memories for clean (non-conflicting) extracted memories
  for (const mem of params.clean) {
    const memory = await prisma.memory.create({
      data: {
        content: mem.content,
        subject: mem.subject,
        category: mem.category,
        confidence: mem.confidence,
        verbatimQuote: mem.verbatimQuote,
        temporality: mem.temporality,
        sensitive: mem.sensitive,
        sourceId: params.sourceId,
        status: "pending",
      },
    });
    memoriesCreated++;

    // Create review item for each pending memory
    await prisma.reviewItem.create({
      data: {
        memoryId: memory.id,
        type: "new_memory",
        title: `New: ${mem.content.slice(0, 80)}${mem.content.length > 80 ? "..." : ""}`,
        status: "pending",
      },
    });
    reviewItemsCreated++;
  }

  // 2. Handle conflicts
  for (const conflict of params.conflicts) {
    if (conflict.type === "refinement" && !conflict.newMemory.sensitive && !conflict.newMemory.isCorrection) {
      // Auto-merge refinements: update existing memory content
      const merged = conflict.mergedContent || conflict.newMemory.content;
      await prisma.memory.update({
        where: { id: conflict.existingMemoryId },
        data: {
          content: merged,
          updatedAt: new Date(),
        },
      });
      autoApproved++;
      continue;
    }

    // Create the new memory as pending
    const newMemory = await prisma.memory.create({
      data: {
        content: conflict.newMemory.content,
        subject: conflict.newMemory.subject,
        category: conflict.newMemory.category,
        confidence: conflict.newMemory.confidence,
        verbatimQuote: conflict.newMemory.verbatimQuote,
        temporality: conflict.newMemory.temporality,
        sensitive: conflict.newMemory.sensitive,
        sourceId: params.sourceId,
        status: "pending",
      },
    });
    memoriesCreated++;

    // Create conflict record
    const conflictRecord = await prisma.conflict.create({
      data: {
        newMemoryId: newMemory.id,
        existingMemoryId: conflict.existingMemoryId,
        type: conflict.type,
        reasoning: conflict.reasoning,
        suggestedAction: conflict.suggestedAction,
        mergedContent: conflict.mergedContent,
        status: "pending",
      },
    });
    conflictsCreated++;

    // Create review item for the conflict
    await prisma.reviewItem.create({
      data: {
        memoryId: newMemory.id,
        conflictId: conflictRecord.id,
        type: "conflict",
        title: `Conflict (${conflict.type}): ${conflict.newMemory.content.slice(0, 60)}...`,
        status: "pending",
      },
    });
    reviewItemsCreated++;
  }

  return { memoriesCreated, reviewItemsCreated, conflictsCreated, autoApproved };
}
