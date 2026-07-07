import { z } from "zod";
import { structuredCall } from "@/lib/llm";
import type { ExtractedMemory } from "@/contracts/pipeline";
import type {
  DeduplicationOutput,
} from "@/contracts/pipeline";
import { prisma } from "@/lib/db";

function formatDate(date: Date | null | undefined): string {
  if (!date) return "date unknown";
  return date.toISOString().split("T")[0];
}

const DEDUPE_STOPWORDS = new Set([
  "user",
  "users",
  "the",
  "and",
  "or",
  "for",
  "with",
  "from",
  "that",
  "this",
  "has",
  "have",
  "had",
  "was",
  "were",
  "are",
  "is",
  "been",
  "being",
  "would",
  "could",
  "should",
  "hypothetical",
]);

function memoryKeywords(content: string): Set<string> {
  const words = content.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(
    words.filter((word) => word.length > 2 && !DEDUPE_STOPWORDS.has(word))
  );
}

function shouldCompareCandidate(existingContent: string, newContent: string): boolean {
  if (normalizeForExactMatch(existingContent) === normalizeForExactMatch(newContent)) {
    return true;
  }

  const existingKeywords = memoryKeywords(existingContent);
  const newKeywords = memoryKeywords(newContent);
  for (const keyword of newKeywords) {
    if (existingKeywords.has(keyword)) return true;
  }

  return false;
}

function normalizeForExactMatch(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, " ");
}

// ─── LLM Comparison Schema ─────────────────────────────────────────────────

const ComparisonResultSchema = z.object({
  relationship: z.enum([
    "duplicate",
    "refinement",
    "contradiction",
    "supersede",
    "unrelated",
  ]),
  reasoning: z.string(),
  mergedContent: z.string().optional(),
});

const COMPARISON_SYSTEM_PROMPT = `You are a memory deduplication agent. Given two memories about the same topic, determine their relationship.

## Relationship Types

- "duplicate": They express the same fact, even if worded differently or at different levels of detail. A verbose version and a concise version of the same fact are duplicates.
- "refinement": The new memory adds genuinely NEW information to the existing one without contradicting it. Example: "User works at Acme" -> "User works at Acme as a senior engineer" is refinement (adds role). But "User prefers TypeScript" -> "User prefers TypeScript for its static typing" is NOT refinement — it's a duplicate with added rationale for the same preference.
- "contradiction": They make MUTUALLY EXCLUSIVE claims. Both cannot be true simultaneously. Example: "User prefers Python" vs "User prefers TypeScript" — a person can only have one primary preference. This should be rare.
- "supersede": The new memory replaces the old one because circumstances changed. Example: "User works at Company A" -> "User works at Company B". The old fact was true at one time but is no longer. When timestamps show the new memory is significantly more recent AND the facts conflict, default to "supersede" over "contradiction".
- "unrelated": They are about different topics despite being in the same category.

## Important Distinctions

- A concise statement vs a verbose version of THE SAME fact = "duplicate" (keep the more complete version as mergedContent)
- Adding supporting reasons or context to the same conclusion = "duplicate"
- Adding a genuinely new dimension (role, location, timeline) = "refinement"
- Facts that CANNOT both be true = "contradiction" (only if dates don't resolve it)
- Facts that CANNOT both be true AND the new one is more recent = "supersede"

## Timestamps

You may be given timestamps for both memories. If the new memory is more recent than the existing one and they conflict, prefer "supersede" over "contradiction". Life facts change over time — a job, city, or preference stated more recently reflects the current truth.

## Output

Provide a one-sentence reasoning explaining your choice.

If the relationship is "duplicate", "refinement", or "supersede", provide a mergedContent that captures the single best version of the fact. For "duplicate", pick the more complete wording. For "refinement", combine both. For "supersede", reflect the newer information.`;

// ─── Comparison Function ────────────────────────────────────────────────────

export async function compareMemories(
  existing: { id: string; content: string; createdAt: Date },
  newMemory: ExtractedMemory
): Promise<{
  relationship: "duplicate" | "refinement" | "contradiction" | "supersede" | "unrelated";
  reasoning: string;
  mergedContent?: string;
  tokens: { input: number; output: number };
}> {
  const result = await structuredCall({
    system: COMPARISON_SYSTEM_PROMPT,
    user: `EXISTING MEMORY (${formatDate(existing.createdAt)}): "${existing.content}"
NEW MEMORY (${formatDate(newMemory.sourceDate)}): "${newMemory.content}"

What is the relationship between these two memories?`,
    schema: ComparisonResultSchema,
    schemaName: "compare_memories",
    schemaDescription: "Determine the relationship between two memories",
    maxTokens: 512,
    temperature: 0,
  });

  // Recency guardrail: if LLM says contradiction but new memory is significantly newer, override to supersede
  if (
    result.data.relationship === "contradiction" &&
    newMemory.sourceDate &&
    existing.createdAt
  ) {
    const daysDiff = (new Date(newMemory.sourceDate).getTime() - new Date(existing.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysDiff > 30) {
      return {
        relationship: "supersede" as const,
        reasoning: `${result.data.reasoning} (Auto-upgraded from contradiction to supersede: new memory is ${Math.round(daysDiff)} days more recent)`,
        mergedContent: result.data.mergedContent ?? newMemory.content,
        tokens: { input: result.inputTokens, output: result.outputTokens },
      };
    }
  }

  return {
    relationship: result.data.relationship,
    reasoning: result.data.reasoning,
    mergedContent: result.data.mergedContent,
    tokens: { input: result.inputTokens, output: result.outputTokens },
  };
}

// ─── Deduplication Agent ────────────────────────────────────────────────────

export async function deduplicateMemories(
  newMemories: ExtractedMemory[]
): Promise<{
  output: DeduplicationOutput;
  tokens: { input: number; output: number };
}> {
  const clean: ExtractedMemory[] = [];
  const conflicts: DeduplicationOutput["conflicts"] = [];
  const duplicateReferences: NonNullable<DeduplicationOutput["duplicateReferences"]> = [];
  let duplicatesDropped = 0;
  let totalInput = 0;
  let totalOutput = 0;
  const seenBatchExactKeys = new Set<string>();

  for (const newMem of newMemories) {
    const batchExactKey = `${newMem.category}:${normalizeForExactMatch(newMem.content)}`;
    if (seenBatchExactKeys.has(batchExactKey)) {
      duplicatesDropped++;
      continue;
    }
    seenBatchExactKeys.add(batchExactKey);

    // Step 1: Find existing active memories in the same category
    const candidates = await prisma.memory.findMany({
      where: {
        category: newMem.category,
        status: "active",
      },
      select: {
        id: true,
        content: true,
        status: true,
        createdAt: true,
      },
    });

    const exactDuplicate = candidates.find(
      (candidate) => normalizeForExactMatch(candidate.content) === normalizeForExactMatch(newMem.content)
    );
    if (exactDuplicate) {
      duplicatesDropped++;
      duplicateReferences.push({
        existingMemoryId: exactDuplicate.id,
        newMemory: newMem,
        reasoning: "Exact duplicate memory content.",
      });
      continue;
    }

    const plausibleCandidates = candidates.filter((candidate) =>
      shouldCompareCandidate(candidate.content, newMem.content)
    );

    if (plausibleCandidates.length === 0) {
      // No existing memories in this category — no conflict possible
      clean.push(newMem);
      continue;
    }

    // Step 2: Compare against each candidate via LLM
    let conflictFound = false;

    for (const candidate of plausibleCandidates) {
      try {
        const comparison = await compareMemories(candidate, newMem);
        totalInput += comparison.tokens.input;
        totalOutput += comparison.tokens.output;

        switch (comparison.relationship) {
          case "duplicate":
            // Silently drop — the fact already exists
            duplicatesDropped++;
            duplicateReferences.push({
              existingMemoryId: candidate.id,
              newMemory: newMem,
              reasoning: comparison.reasoning,
            });
            conflictFound = true;
            break;

          case "refinement":
            // Auto-merge: add detail to the existing memory
            // This goes through as a conflict with suggested action "merge"
            // so the commit agent can handle it
            conflicts.push({
              newMemory: newMem,
              existingMemoryId: candidate.id,
              existingContent: candidate.content,
              type: "refinement",
              reasoning: comparison.reasoning,
              suggestedAction: "merge",
              mergedContent: comparison.mergedContent,
            });
            conflictFound = true;
            break;

          case "contradiction":
            conflicts.push({
              newMemory: newMem,
              existingMemoryId: candidate.id,
              existingContent: candidate.content,
              type: "contradiction",
              reasoning: comparison.reasoning,
              suggestedAction: "keep_new",
            });
            conflictFound = true;
            break;

          case "supersede":
            conflicts.push({
              newMemory: newMem,
              existingMemoryId: candidate.id,
              existingContent: candidate.content,
              type: "supersede",
              reasoning: comparison.reasoning,
              suggestedAction: "keep_new",
              mergedContent: comparison.mergedContent,
            });
            conflictFound = true;
            break;

          case "unrelated":
            // Different topic, continue checking other candidates
            continue;
        }

        // If we found a non-unrelated match, stop checking this memory
        if (conflictFound) break;
      } catch (error) {
        console.error(
          `Failed to compare memories: existing=${candidate.id}, new="${newMem.content.slice(0, 50)}..."`,
          error
        );
        // On comparison failure, treat as clean (let it through)
        continue;
      }
    }

    if (!conflictFound) {
      clean.push(newMem);
    }
  }

  return {
    output: { clean, conflicts, duplicatesDropped, duplicateReferences },
    tokens: { input: totalInput, output: totalOutput },
  };
}
