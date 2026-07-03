import { z } from "zod";
import { structuredCall, type LLMResult } from "@/lib/llm";
import {
  ExtractedMemorySchema,
  type ExtractedMemory,
} from "@/contracts/pipeline";
import { MEMORY_CATEGORIES } from "@/contracts/memory";
import type { NormalizedConversation } from "@/contracts/conversation";

// ─── Extraction Schema ──────────────────────────────────────────────────────

const ExtractionResponseSchema = z.object({
  memories: z.array(ExtractedMemorySchema),
});

// ─── System Prompt ──────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction agent for Cortex, a personal context synchronization tool.

Your job is to extract **atomic, durable facts** from conversations that would be useful for an AI assistant to know about the user in future conversations.

## What to extract

Extract facts that are:
- **Atomic**: One fact per memory. "User is named Sanjay and lives in SF" should be TWO memories.
- **Durable**: Facts that will remain true for weeks/months/years. Not ephemeral debugging context.
- **Factual**: Concrete facts, preferences, or goals — not opinions the AI expressed.
- **User-stated**: Only extract facts the USER said about themselves. Never infer or assume.

## What NOT to extract

- Small talk, greetings, pleasantries
- Ephemeral debugging context ("I'm getting this error...")
- Facts stated by the AI assistant (only extract what the USER said)
- Vague or uncertain statements ("I might want to..." is too weak)
- Implementation details of code being discussed (unless it reveals a preference or project fact)
- Anything the user said about a one-time task with no lasting relevance

## Categories

Classify each memory into exactly one of these categories:
${MEMORY_CATEGORIES.map((c) => `- \`${c}\``).join("\n")}

## Temporality

- \`durable\`: True for months/years (name, preferences, career facts)
- \`current\`: True now but will change (current project focus, current city if they said "recently moved")
- \`expired\`: Already past (mentioned a past deadline)

## Corrections

If the user says something like "Actually, I moved from New York to San Francisco" or "I used to prefer JavaScript but now I use TypeScript", set \`isCorrection: true\`. This signals that a previous memory may need updating.

## Sensitivity

Set \`sensitive: true\` for:
- Health or medical information
- Financial details (income, debt, accounts)
- PII about third parties (other people's full names, contact info)
- Legal matters

## Verbatim quotes

For each extracted memory, include the EXACT text from the conversation that supports it. This must be a direct quote, not a paraphrase.

## Output

If the conversation contains no extractable memories (pure small talk, or just a technical Q&A with no personal facts), return an empty memories array.

## Examples

Good extractions:
- Content: "User's name is Sanjay" | Category: identity | Confidence: 0.95
- Content: "User prefers TypeScript over JavaScript" | Category: preferences | Confidence: 0.9
- Content: "User is building a project called Cortex for AI memory synchronization" | Category: projects | Confidence: 0.95
- Content: "User studied computer science at Stanford" | Category: education_career | Confidence: 0.9
- Content: "User recently moved from New York to San Francisco" | Category: identity | isCorrection: true | Temporality: current

Bad extractions (do NOT produce these):
- "User asked about TypeScript interfaces" (this is a question, not a fact about the user)
- "User is debugging a React component" (ephemeral task context)
- "AI suggested using Prisma" (fact about the AI, not the user)
- "User and AI discussed database design" (summary of conversation, not a fact)`;

// ─── Extract Memories from a Single Conversation ────────────────────────────

export async function extractMemories(
  conversation: NormalizedConversation
): Promise<{ memories: ExtractedMemory[]; tokens: { input: number; output: number } }> {
  // Build the conversation text — only include meaningful messages
  const conversationText = conversation.messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => {
      const role = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System";
      return `${role}: ${m.content}`;
    })
    .join("\n\n");

  // Skip very short conversations (likely no useful context)
  if (conversationText.length < 50) {
    return { memories: [], tokens: { input: 0, output: 0 } };
  }

  const userPrompt = `Extract all durable personal facts from this conversation.

Title: ${conversation.title || "(untitled)"}

<conversation>
${conversationText}
</conversation>

Extract atomic memories. If there are no extractable facts about the user, return an empty memories array.`;

  const result = await structuredCall({
    system: EXTRACTION_SYSTEM_PROMPT,
    user: userPrompt,
    schema: ExtractionResponseSchema,
    schemaName: "extract_memories",
    schemaDescription: "Extract atomic personal facts from a conversation",
    maxTokens: 4096,
    temperature: 0,
  });

  return {
    memories: result.data.memories,
    tokens: { input: result.inputTokens, output: result.outputTokens },
  };
}

// ─── Batch Extract from Multiple Conversations ─────────────────────────────

export interface BatchExtractionResult {
  results: Array<{
    conversationId: string;
    memories: ExtractedMemory[];
  }>;
  totalTokens: { input: number; output: number };
  conversationsWithNoMemories: number;
}

export async function batchExtractMemories(
  conversations: NormalizedConversation[]
): Promise<BatchExtractionResult> {
  const results: BatchExtractionResult["results"] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let noMemories = 0;

  for (const conv of conversations) {
    try {
      const { memories, tokens } = await extractMemories(conv);
      totalInput += tokens.input;
      totalOutput += tokens.output;

      if (memories.length === 0) {
        noMemories++;
      }

      results.push({
        conversationId: conv.externalId,
        memories,
      });
    } catch (error) {
      console.error(
        `Failed to extract memories from conversation ${conv.externalId}:`,
        error
      );
      // Continue with other conversations rather than failing the whole batch
      results.push({
        conversationId: conv.externalId,
        memories: [],
      });
    }
  }

  return {
    results,
    totalTokens: { input: totalInput, output: totalOutput },
    conversationsWithNoMemories: noMemories,
  };
}
