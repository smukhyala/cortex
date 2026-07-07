import { prisma } from "@/lib/db";
import type { ExtractedMemory, DeduplicationOutput } from "@/contracts/pipeline";

type MemoryWithOrigin = ExtractedMemory & {
  conversationExternalId?: string | null;
};

export interface CommitResult {
  memoriesCreated: number;
  reviewItemsCreated: number;
  conflictsCreated: number;
  autoApproved: number;
  autoSuperseded: number;
  referencesUpdated: number;
}

/**
 * Agent 4: Commit
 * Writes memories, conflicts, and review items to the database.
 *
 * Auto-resolve logic:
 * - refinement: auto-merge new detail into existing memory (no review needed)
 * - supersede: auto-replace existing memory with new content (no review needed)
 * - contradiction: requires manual review (genuine disagreement)
 * - duplicate: already dropped by dedup agent before reaching commit
 */
export async function commit(params: {
  sourceId: string;
  clean: ExtractedMemory[];
  conflicts: DeduplicationOutput["conflicts"];
  duplicateReferences?: DeduplicationOutput["duplicateReferences"];
  conversationMap: Map<string, string>; // externalId -> DB conversationId
  initialStatus?: "pending" | "active";
}): Promise<CommitResult> {
  let memoriesCreated = 0;
  let reviewItemsCreated = 0;
  let conflictsCreated = 0;
  let autoApproved = 0;
  let autoSuperseded = 0;
  let referencesUpdated = 0;
  const initialStatus = params.initialStatus ?? "pending";

  async function markReferenced(memoryId: string) {
    await prisma.memory.update({
      where: { id: memoryId },
      data: {
        referenceCount: { increment: 1 },
        lastReferencedAt: new Date(),
      },
    });
    referencesUpdated++;
  }

  for (const duplicate of params.duplicateReferences ?? []) {
    await markReferenced(duplicate.existingMemoryId);
    await prisma.activityLog.create({
      data: {
        action: "memory_reference_repeated",
        summary: "Existing memory was referenced again",
        details: JSON.stringify({
          existingMemoryId: duplicate.existingMemoryId,
          newContent: duplicate.newMemory.content,
          reasoning: duplicate.reasoning,
        }),
      },
    });
  }

  // 1. Create memories for clean (non-conflicting) extracted memories
  for (const mem of params.clean) {
    const origin = mem as MemoryWithOrigin;
    const conversationId = origin.conversationExternalId
      ? params.conversationMap.get(origin.conversationExternalId)
      : undefined;

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
        ...(conversationId ? { conversationId } : {}),
        status: initialStatus,
        ...(initialStatus === "active" ? { approvedAt: new Date() } : {}),
      },
    });
    memoriesCreated++;

    if (initialStatus === "pending") {
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
  }

  // 2. Handle conflicts
  for (const conflict of params.conflicts) {
    const origin = conflict.newMemory as MemoryWithOrigin;
    const conversationId = origin.conversationExternalId
      ? params.conversationMap.get(origin.conversationExternalId)
      : undefined;
    const canAutoResolve =
      !conflict.newMemory.sensitive && !conflict.newMemory.isCorrection;

    // ── Refinement: auto-merge new detail into existing memory ──────────
    if (conflict.type === "refinement" && canAutoResolve) {
      const merged = conflict.mergedContent || conflict.newMemory.content;
      const previousContent = conflict.existingContent;
      await prisma.memory.update({
        where: { id: conflict.existingMemoryId },
        data: {
          content: merged,
          referenceCount: { increment: 1 },
          lastReferencedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      autoApproved++;
      referencesUpdated++;

      // Log activity so the user can see what was auto-merged
      await prisma.activityLog.create({
        data: {
          action: "auto_merge_refinement",
          summary: `Auto-merged refinement into existing memory`,
          details: JSON.stringify({
            existingMemoryId: conflict.existingMemoryId,
            previousContent,
            mergedContent: merged,
            newContent: conflict.newMemory.content,
            reasoning: conflict.reasoning,
          }),
        },
      });
      continue;
    }

    // ── Supersede: auto-replace existing memory with new content ────────
    if (conflict.type === "supersede" && canAutoResolve) {
      const merged = conflict.mergedContent || conflict.newMemory.content;
      const previousContent = conflict.existingContent;
      await prisma.memory.update({
        where: { id: conflict.existingMemoryId },
        data: {
          content: merged,
          referenceCount: { increment: 1 },
          lastReferencedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      autoSuperseded++;
      referencesUpdated++;

      // Log activity so the user can see what was auto-replaced
      await prisma.activityLog.create({
        data: {
          action: "auto_supersede",
          summary: `Auto-replaced memory with newer information`,
          details: JSON.stringify({
            existingMemoryId: conflict.existingMemoryId,
            previousContent,
            newContent: merged,
            reasoning: conflict.reasoning,
          }),
        },
      });
      continue;
    }

    // ── Contradiction: requires manual review ──────────────────────────
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
        ...(conversationId ? { conversationId } : {}),
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

  return { memoriesCreated, reviewItemsCreated, conflictsCreated, autoApproved, autoSuperseded, referencesUpdated };
}
