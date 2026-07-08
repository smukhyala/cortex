import { z } from "zod";
import { MEMORY_CATEGORIES, TemporalitySchema } from "./memory";
import { SourceTypeSchema, SyncTriggerSchema } from "./source";
import { NormalizedConversationSchema } from "./conversation";

// ─── Pipeline Input ─────────────────────────────────────────────────────────

export const PipelineInputSchema = z.object({
  sourceId: z.string(),
  sourceType: SourceTypeSchema,
  filePath: z.string(),
  trigger: SyncTriggerSchema,
});
export type PipelineInput = z.infer<typeof PipelineInputSchema>;

// ─── Agent 1: Ingest Output ─────────────────────────────────────────────────

export const IngestOutputSchema = z.object({
  conversations: z.array(NormalizedConversationSchema),
  skipped: z.number(),
});
export type IngestOutput = z.infer<typeof IngestOutputSchema>;

// ─── Agent 2: Extract + Classify Output ─────────────────────────────────────

export function createExtractedMemorySchema(
  categorySlugs: readonly string[] = MEMORY_CATEGORIES
) {
  const slugs = categorySlugs.length > 0 ? categorySlugs : MEMORY_CATEGORIES;
  const [first, ...rest] = slugs;

  return z.object({
    content: z.string(),
    subject: z.string().default("user"),
    category: z.enum([first, ...rest] as [string, ...string[]]),
    confidence: z.number().min(0).max(1),
    verbatimQuote: z.string(),
    temporality: TemporalitySchema,
    sensitive: z.boolean(),
    isCorrection: z.boolean(),
    sourceDate: z.coerce.date().nullable().optional(),
    project: z.string().optional(),
  });
}

export const ExtractedMemorySchema = createExtractedMemorySchema(MEMORY_CATEGORIES);
export type ExtractedMemory =
  Omit<z.infer<typeof ExtractedMemorySchema>, "category"> & { category: string };

export const ExtractionOutputSchema = z.object({
  memories: z.array(ExtractedMemorySchema),
  conversationId: z.string(),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

// ─── Agent 3: Deduplicate + Conflict Output ─────────────────────────────────

export const ConflictTypeSchema = z.enum([
  "contradiction",
  "duplicate",
  "refinement",
  "supersede",
]);

export const ConflictActionSchema = z.enum([
  "keep_new",
  "keep_existing",
  "merge",
  "keep_both",
]);

export const DetectedConflictSchema = z.object({
  newMemory: ExtractedMemorySchema,
  existingMemoryId: z.string(),
  existingContent: z.string(),
  type: ConflictTypeSchema,
  reasoning: z.string(),
  suggestedAction: ConflictActionSchema,
  mergedContent: z.string().optional(),
});
export type DetectedConflict = z.infer<typeof DetectedConflictSchema>;

export const DuplicateReferenceSchema = z.object({
  existingMemoryId: z.string(),
  newMemory: ExtractedMemorySchema,
  reasoning: z.string(),
});
export type DuplicateReference = z.infer<typeof DuplicateReferenceSchema>;

export const DeduplicationOutputSchema = z.object({
  clean: z.array(ExtractedMemorySchema),
  conflicts: z.array(DetectedConflictSchema),
  duplicatesDropped: z.number(),
  duplicateReferences: z.array(DuplicateReferenceSchema).default([]),
});
export type DeduplicationOutput = z.infer<typeof DeduplicationOutputSchema>;

// ─── Agent 4: Commit Output ─────────────────────────────────────────────────

export const CommitOutputSchema = z.object({
  memoriesCreated: z.number(),
  reviewItemsCreated: z.number(),
  conflictsCreated: z.number(),
  activityLogged: z.boolean(),
});
export type CommitOutput = z.infer<typeof CommitOutputSchema>;

// ─── Pipeline Result ────────────────────────────────────────────────────────

export const PipelineResultSchema = z.object({
  syncRunId: z.string(),
  conversationsParsed: z.number(),
  conversationsSkipped: z.number(),
  memoriesExtracted: z.number(),
  conflictsFound: z.number(),
  reviewItemsCreated: z.number(),
  duplicatesDropped: z.number(),
  newMemoriesAutoApproved: z.number(),
  newMemoriesQueuedForReview: z.number(),
  autoApproved: z.number(),
  autoSuperseded: z.number(),
  durationMs: z.number(),
  tokensUsed: z.number(),
});
export type PipelineResult = z.infer<typeof PipelineResultSchema>;
