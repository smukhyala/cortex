import { prisma } from "@/lib/db";
import type { PipelineResult } from "@/contracts/pipeline";
import { ingest } from "./ingest";
import { batchExtractMemories } from "./extract";
import { deduplicateMemories } from "./deduplicate";
import { commit } from "./commit";
import type { SourceType, SyncTrigger } from "@/contracts/source";
import { getCategories } from "@/lib/categories";
import { notifyMemoryChange } from "@/services/memory-change";
import { isLikelyTechnicalMemory } from "@/lib/memory-quality";

const AUTO_APPROVE_NEW_MEMORY_SOURCES = new Set<SourceType>([
  "claude_code",
  "claude_desktop",
  "claude_export",
  "poke",
]);
const REVIEW_CONFLICT_TYPES_FOR_AUTO_SOURCES = ["supersede", "contradiction"] as const;

/**
 * Run the full 4-agent pipeline synchronously.
 *
 * 1. Ingest: Parse source file → normalized conversations
 * 2. Extract: LLM → atomic memories with categories
 * 3. Deduplicate: Category-match + LLM comparison for conflicts
 * 4. Commit: Write to DB, queue reviews, log activity
 */
export async function runPipeline(input: {
  sourceId: string;
  sourceType: SourceType;
  filePath: string;
  trigger: SyncTrigger;
}): Promise<PipelineResult> {
  const startTime = Date.now();

  // Create sync run record
  const syncRun = await prisma.syncRun.create({
    data: {
      sourceId: input.sourceId,
      trigger: input.trigger,
      status: "running",
    },
  });

  try {
    // ── Agent 1: Ingest ──────────────────────────────────────────────────
    const { conversations, skipped } = await ingest({
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      filePath: input.filePath,
    });

    if (conversations.length === 0) {
      // Nothing new to process
      const durationMs = Date.now() - startTime;
      await prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: "completed",
          conversationsParsed: 0,
          completedAt: new Date(),
          durationMs,
        },
      });

      await prisma.activityLog.create({
        data: {
          action: "sync_completed",
          summary: `Sync completed — no new conversations (${skipped} already processed)`,
          details: JSON.stringify({ syncRunId: syncRun.id, skipped }),
        },
      });

      return {
        syncRunId: syncRun.id,
        conversationsParsed: 0,
        conversationsSkipped: skipped,
        memoriesExtracted: 0,
        conflictsFound: 0,
        reviewItemsCreated: 0,
        duplicatesDropped: 0,
        newMemoriesAutoApproved: 0,
        newMemoriesQueuedForReview: 0,
        autoApproved: 0,
        autoSuperseded: 0,
        durationMs,
        tokensUsed: 0,
      };
    }

    // Persist conversations to DB (upsert to handle re-syncs of growing session files)
    const conversationMap = new Map<string, string>();
    for (const conv of conversations) {
      const dbConv = await prisma.conversation.upsert({
        where: {
          sourceId_externalId: {
            sourceId: input.sourceId,
            externalId: conv.externalId,
          },
        },
        create: {
          externalId: conv.externalId,
          sourceId: input.sourceId,
          title: conv.title,
          messageCount: conv.messages.length,
          contentHash: conv.contentHash,
          sourceDate: conv.sourceDate,
        },
        update: {
          title: conv.title,
          messageCount: conv.messages.length,
          contentHash: conv.contentHash,
          sourceDate: conv.sourceDate,
        },
      });
      conversationMap.set(conv.externalId, dbConv.id);
    }

    // ── Agent 2: Extract + Classify ──────────────────────────────────────
    const categories = await getCategories();
    const extraction = await batchExtractMemories(conversations, categories);

    // Flatten all extracted memories
    const extractedMemories = extraction.results.flatMap((r) => {
      const conv = conversations.find((c) => c.externalId === r.conversationId);
      return r.memories.map((mem) => ({
        ...mem,
        sourceDate: conv?.sourceDate ?? null,
        conversationExternalId: conv?.externalId,
      }));
    });
    const allMemories = extractedMemories.filter((memory) => !isLikelyTechnicalMemory(memory.content));
    const technicalMemoriesDropped = extractedMemories.length - allMemories.length;

    // ── Agent 3: Deduplicate + Conflict Detect ───────────────────────────
    const dedup = await deduplicateMemories(allMemories);

    // ── Agent 4: Commit ──────────────────────────────────────────────────
    const shouldAutoApproveNewMemories = AUTO_APPROVE_NEW_MEMORY_SOURCES.has(input.sourceType);
    const commitResult = await commit({
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      sourcePath: input.filePath,
      clean: dedup.output.clean,
      conflicts: dedup.output.conflicts,
      duplicateReferences: dedup.output.duplicateReferences,
      conversationMap,
      initialStatus: shouldAutoApproveNewMemories ? "active" : "pending",
      ...(shouldAutoApproveNewMemories
        ? { reviewConflictTypes: [...REVIEW_CONFLICT_TYPES_FOR_AUTO_SOURCES] }
        : {}),
    });

    const durationMs = Date.now() - startTime;
    const totalTokens =
      extraction.totalTokens.input +
      extraction.totalTokens.output +
      dedup.tokens.input +
      dedup.tokens.output;

    // Update sync run
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "completed",
        conversationsParsed: conversations.length,
        memoriesExtracted: allMemories.length,
        conflictsFound: commitResult.conflictsCreated,
        reviewItemsCreated: commitResult.reviewItemsCreated,
        tokensUsed: totalTokens,
        completedAt: new Date(),
        durationMs,
      },
    });

    // Update source last sync time
    await prisma.source.update({
      where: { id: input.sourceId },
      data: { lastSyncAt: new Date() },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        action: "sync_completed",
        summary: `Sync completed — ${allMemories.length} memories extracted from ${conversations.length} conversations`,
        details: JSON.stringify({
          syncRunId: syncRun.id,
          conversationsParsed: conversations.length,
          conversationsSkipped: skipped,
          memoriesExtracted: allMemories.length,
          technicalMemoriesDropped,
          conflictsFound: commitResult.conflictsCreated,
          reviewItemsCreated: commitResult.reviewItemsCreated,
          duplicatesDropped: dedup.output.duplicatesDropped,
          newMemoriesAutoApproved: commitResult.newMemoriesAutoApproved,
          newMemoriesQueuedForReview: commitResult.newMemoriesQueuedForReview,
          autoApproved: commitResult.autoApproved,
          autoSuperseded: commitResult.autoSuperseded,
          tokensUsed: totalTokens,
        }),
      },
    });

    if (commitResult.autoApproved > 0 || commitResult.autoSuperseded > 0 || commitResult.referencesUpdated > 0) {
      await notifyMemoryChange({
        action: "sync_auto_update",
        count: commitResult.autoApproved + commitResult.autoSuperseded + commitResult.referencesUpdated,
      });
    }

    return {
      syncRunId: syncRun.id,
      conversationsParsed: conversations.length,
      conversationsSkipped: skipped,
      memoriesExtracted: allMemories.length,
      conflictsFound: commitResult.conflictsCreated,
      reviewItemsCreated: commitResult.reviewItemsCreated,
      duplicatesDropped: dedup.output.duplicatesDropped,
      newMemoriesAutoApproved: commitResult.newMemoriesAutoApproved,
      newMemoriesQueuedForReview: commitResult.newMemoriesQueuedForReview,
      autoApproved: commitResult.autoApproved,
      autoSuperseded: commitResult.autoSuperseded,
      durationMs,
      tokensUsed: totalTokens,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "failed",
        errorMessage,
        completedAt: new Date(),
        durationMs,
      },
    });

    await prisma.activityLog.create({
      data: {
        action: "sync_completed",
        summary: `Sync failed: ${errorMessage}`,
        details: JSON.stringify({ syncRunId: syncRun.id, error: errorMessage }),
      },
    });

    throw error;
  }
}
