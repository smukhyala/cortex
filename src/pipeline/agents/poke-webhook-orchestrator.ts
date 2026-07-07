import { structuredCall } from "@/lib/llm";
import { getCategories } from "@/lib/categories";
import { prisma } from "@/lib/db";
import {
  ExchangeFactSchema,
  PokeWebhookFactExtractionSchema,
  PokeWebhookPayloadSchema,
  type ExchangeFact,
  type PokeWebhookPayload,
} from "@/contracts/exchange";
import { ingestExchangeFacts, type ExchangeIngestResult } from "@/services/exchange-ingest";

interface PokeWebhookIngestResult {
  eventType: string | null;
  conversationId: string | null;
  textProcessed: string;
  factsExtracted: number;
  ingested: boolean;
  skippedReason?: string;
  ingest?: ExchangeIngestResult;
}

type PokeWebhookMessage = NonNullable<PokeWebhookPayload["messages"]>[number];

const ASSISTANT_MARKERS = new Set(["assistant", "ai", "bot", "poke"]);
const USER_MARKERS = new Set(["user", "human", "customer", "member"]);

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function messageText(message: PokeWebhookMessage): string | null {
  return nonEmpty(message.text) ?? nonEmpty(message.content) ?? nonEmpty(message.body);
}

function actorMarker(message: PokeWebhookMessage): string | null {
  const marker = message.role ?? message.sender ?? message.author;
  return marker ? marker.toLowerCase() : null;
}

function isUserAuthored(message: PokeWebhookMessage): boolean {
  const marker = actorMarker(message);
  if (!marker) return true;
  if (ASSISTANT_MARKERS.has(marker)) return false;
  if (USER_MARKERS.has(marker)) return true;
  return !marker.includes("assistant") && !marker.includes("bot") && !marker.includes("poke");
}

function extractUserText(payload: PokeWebhookPayload): string {
  const chunks: string[] = [];

  const rootText = nonEmpty(payload.text) ?? nonEmpty(payload.content) ?? nonEmpty(payload.body);
  if (rootText) chunks.push(`User: ${rootText}`);

  if (typeof payload.message === "string") {
    const text = nonEmpty(payload.message);
    if (text) chunks.push(`User: ${text}`);
  } else if (payload.message && isUserAuthored(payload.message)) {
    const text = messageText(payload.message);
    if (text) chunks.push(`User: ${text}`);
  }

  for (const message of payload.messages ?? []) {
    if (!isUserAuthored(message)) continue;
    const text = messageText(message);
    if (text) chunks.push(`User: ${text}`);
  }

  return Array.from(new Set(chunks)).join("\n\n");
}

function normalizeFacts(facts: ExchangeFact[], validCategorySlugs: Set<string>): ExchangeFact[] {
  return facts
    .map((fact) => ExchangeFactSchema.parse(fact))
    .map((fact) => ({
      content: fact.content.trim(),
      category: fact.category && validCategorySlugs.has(fact.category) ? fact.category : undefined,
      sensitive: fact.sensitive ?? false,
    }))
    .filter((fact) => fact.content.length > 0);
}

function cleanPreferenceValue(value: string): string {
  return value
    .replace(/^now\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
}

async function inferFavoriteColorFact(textProcessed: string): Promise<ExchangeFact[]> {
  const text = textProcessed.replace(/^User:\s*/gm, "").trim();
  const favoriteColorMatch = text.match(/(?:my\s+)?favou?rite\s+colou?r\s+is\s+(?:now\s+)?([^.\n!?]+)/i);
  if (favoriteColorMatch?.[1]) {
    const color = cleanPreferenceValue(favoriteColorMatch[1]);
    if (color) {
      return [{ content: `User's favorite color is ${color}.`, category: "preferences" }];
    }
  }

  const pronounUpdateMatch = text.match(/^(?:it'?s|it is)\s+([^.\n!?]+?)\s+now$/i);
  if (!pronounUpdateMatch?.[1]) return [];

  const existingFavoriteColor = await prisma.memory.findFirst({
    where: {
      status: "active",
      category: "preferences",
      content: { contains: "favorite color" },
    },
    select: { id: true },
  });
  if (!existingFavoriteColor) return [];

  const color = cleanPreferenceValue(pronounUpdateMatch[1]);
  return color ? [{ content: `User's favorite color is ${color}.`, category: "preferences" }] : [];
}

export class PokeWebhookOrchestrator {
  async run(rawPayload: unknown): Promise<PokeWebhookIngestResult> {
    const payload = PokeWebhookPayloadSchema.parse(rawPayload);
    const categories = await getCategories();
    const validCategorySlugs = new Set(categories.map((category) => category.slug));
    const categoryList = categories
      .map((category) => `- ${category.slug}: ${category.label}`)
      .join("\n");

    const directFacts = payload.facts?.length
      ? normalizeFacts(payload.facts, validCategorySlugs)
      : [];

    const textProcessed = extractUserText(payload);
    let facts = directFacts;
    let summary = payload.event ?? payload.type ?? "Poke webhook";

    if (facts.length === 0 && textProcessed.length > 0) {
      facts = normalizeFacts(await inferFavoriteColorFact(textProcessed), validCategorySlugs);
    }

    if (facts.length === 0 && textProcessed.length > 0) {
      const extraction = await structuredCall({
        system: `You extract durable user memories from Poke conversations for Cortex.

Only extract facts the user stated about themselves. Do not extract facts stated by Poke or another assistant.
Return atomic, durable facts that would help another AI assistant in a future conversation.
Return no facts for small talk, one-off task details, tool/debugging details, or information that is too ambiguous.

Available categories:
${categoryList}`,
        user: `Poke webhook event: ${payload.event ?? payload.type ?? "(unknown)"}
Conversation ID: ${payload.conversationId ?? payload.threadId ?? "(unknown)"}

<user_messages>
${textProcessed}
</user_messages>`,
        schema: PokeWebhookFactExtractionSchema,
        schemaName: "extract_poke_webhook_facts",
        schemaDescription: "Extract durable user facts from Poke webhook messages",
        maxTokens: 1024,
        temperature: 0,
      });
      facts = normalizeFacts(extraction.data.facts, validCategorySlugs);
      summary = extraction.data.summary ?? summary;
    }

    if (facts.length === 0) {
      return {
        eventType: payload.event ?? payload.type ?? null,
        conversationId: payload.conversationId ?? payload.threadId ?? null,
        textProcessed,
        factsExtracted: 0,
        ingested: false,
        skippedReason: textProcessed.length === 0 ? "no_user_text" : "no_durable_facts",
      };
    }

    const ingest = await ingestExchangeFacts({
      origin: "poke",
      facts,
      topic: "poke webhook",
      summary,
      propagate: true,
    });

    return {
      eventType: payload.event ?? payload.type ?? null,
      conversationId: payload.conversationId ?? payload.threadId ?? null,
      textProcessed,
      factsExtracted: facts.length,
      ingested: true,
      ingest,
    };
  }
}
