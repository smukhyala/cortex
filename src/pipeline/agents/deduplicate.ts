import { z } from "zod";
import { structuredCall } from "@/lib/llm";
import type { ExtractedMemory } from "@/contracts/pipeline";
import type {
  DeduplicationOutput,
} from "@/contracts/pipeline";
import { prisma } from "@/lib/db";

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

Respond with exactly one relationship type:
- "duplicate": They express the same fact (even if worded differently)
- "refinement": The new memory adds detail to the existing one without contradicting it
- "contradiction": They directly disagree (e.g., "prefers Python" vs "prefers TypeScript")
- "supersede": The new memory is an explicit update/correction of the old one
- "unrelated": They are about different topics despite being in the same category

Provide a one-sentence reasoning.

If the relationship is "refinement" or "supersede", provide a mergedContent that combines both into a single accurate memory. For "supersede", the merged content should reflect the newer information.`;

// ─── Comparison Function ────────────────────────────────────────────────────

export async function compareMemories(
  existing: { id: string; content: string },
  newMemory: ExtractedMemory
): Promise<{
  relationship: "duplicate" | "refinement" | "contradiction" | "supersede" | "unrelated";
  reasoning: string;
  mergedContent?: string;
  tokens: { input: number; output: number };
}> {
  const result = await structuredCall({
    system: COMPARISON_SYSTEM_PROMPT,
    user: `EXISTING MEMORY: "${existing.content}"
NEW MEMORY: "${newMemory.content}"

What is the relationship between these two memories?`,
    schema: ComparisonResultSchema,
    schemaName: "compare_memories",
    schemaDescription: "Determine the relationship between two memories",
    maxTokens: 512,
    temperature: 0,
  });

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
  let duplicatesDropped = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const newMem of newMemories) {
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
      },
    });

    if (candidates.length === 0) {
      // No existing memories in this category — no conflict possible
      clean.push(newMem);
      continue;
    }

    // Step 2: Compare against each candidate via LLM
    let conflictFound = false;

    for (const candidate of candidates) {
      try {
        const comparison = await compareMemories(candidate, newMem);
        totalInput += comparison.tokens.input;
        totalOutput += comparison.tokens.output;

        switch (comparison.relationship) {
          case "duplicate":
            // Silently drop — the fact already exists
            duplicatesDropped++;
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
    output: { clean, conflicts, duplicatesDropped },
    tokens: { input: totalInput, output: totalOutput },
  };
}
