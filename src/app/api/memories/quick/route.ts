import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { structuredCall } from "@/lib/llm";
import { notifyMemoryChange } from "@/services/memory-change";
import { getCategories } from "@/lib/categories";
import { memoryFactKeysMatch } from "@/lib/memory-facts";

const QuickStatementResultSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  content: z.string(),
  category: z.string(),
  matchingMemoryId: z.string().optional(),
  matchingMemoryIds: z.array(z.string()).default([]),
  reasoning: z.string(),
});
type QuickStatementResult = z.infer<typeof QuickStatementResultSchema>;

function cleanValue(value: string): string {
  return value.replace(/[.!?]+$/g, "").trim();
}

function capitalizeWords(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function cleanOrganizationValue(value: string): string {
  return cleanValue(value)
    .replace(/\s+\b(?:anymore|now|currently)\b$/i, "")
    .trim();
}

function inferQuickStatement(statement: string): QuickStatementResult | null {
  const text = statement.trim();

  const deleteMatch = text.match(/\b(?:forget|delete|remove)\s+(?:that\s+)?(?:my\s+)?(.+)/i);
  if (deleteMatch?.[1]) {
    const target = cleanValue(deleteMatch[1]);
    return {
      action: "delete",
      content: target,
      category: "identity",
      matchingMemoryIds: [],
      reasoning: "The user asked Cortex to remove a memory.",
    };
  }

  const graduationMatch = text.match(/\b(?:i(?:'m| am)?\s+)?(?:graduat(?:e|ing)|class of|graduation(?: year)?(?: is)?)\s+(?:in\s+)?(?:year\s+)?(\d{4})\b/i);
  if (graduationMatch?.[1]) {
    return {
      action: "update",
      content: `User is graduating in ${graduationMatch[1]}.`,
      category: "education_career",
      matchingMemoryIds: [],
      reasoning: "The user stated their graduation year.",
    };
  }

  const majorMatch = text.match(/\b(?:my\s+)?major\s+(?:is|=)\s+([^.!?]+)/i) ?? text.match(/\bi(?:'m| am)\s+majoring\s+in\s+([^.!?]+)/i);
  if (majorMatch?.[1]) {
    return {
      action: "update",
      content: `User's major is ${cleanValue(majorMatch[1])}.`,
      category: "education_career",
      matchingMemoryIds: [],
      reasoning: "The user stated their major.",
    };
  }

  const universityMatch = text.match(/\b(?:i\s+(?:go to|attend|study at)|my\s+(?:university|college|school)\s+is)\s+([^.!?]+)/i);
  if (universityMatch?.[1]) {
    return {
      action: "update",
      content: `User attends ${cleanValue(universityMatch[1])}.`,
      category: "education_career",
      matchingMemoryIds: [],
      reasoning: "The user stated their university or school.",
    };
  }

  const nameMatch = text.match(/\b(?:my\s+name\s+is|i\s+am|i'm|call\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/);
  if (nameMatch?.[1]) {
    return {
      action: "update",
      content: `User's name is ${cleanValue(nameMatch[1])}.`,
      category: "identity",
      matchingMemoryIds: [],
      reasoning: "The user stated their name.",
    };
  }

  const favoriteMatch = text.match(/\b(?:my\s+)?favou?rite\s+([a-z][a-z\s-]{1,40}?)\s+is\s+([^.!?]+)/i);
  if (favoriteMatch?.[1] && favoriteMatch[2]) {
    const subject = cleanValue(favoriteMatch[1]).toLowerCase();
    const value = cleanValue(favoriteMatch[2]);
    return {
      action: "update",
      content: `User's favorite ${subject} is ${value}.`,
      category: "preferences",
      matchingMemoryIds: [],
      reasoning: `The user stated their favorite ${subject}.`,
    };
  }

  const stoppedWorkMatch =
    text.match(/\bi\s+(?:do\s+not|don't|dont|no\s+longer)\s+work\s+(?:at|for|with)\s+([^.!?]+)/i) ??
    text.match(/\bi\s+(?:stopped|quit)\s+working\s+(?:at|for|with)\s+([^.!?]+)/i);
  if (stoppedWorkMatch?.[1]) {
    const organization = capitalizeWords(cleanOrganizationValue(stoppedWorkMatch[1]));
    return {
      action: "delete",
      content: `User works at or with an organization called ${organization}.`,
      category: "education_career",
      matchingMemoryIds: [],
      reasoning: `The user said they no longer work with ${organization}.`,
    };
  }

  const workMatch = text.match(/\b(?:i\s+work\s+(?:at|for)|my\s+(?:company|employer)\s+is)\s+([^.!?]+)/i);
  if (workMatch?.[1]) {
    return {
      action: "update",
      content: `User works at ${capitalizeWords(cleanValue(workMatch[1]))}.`,
      category: "education_career",
      matchingMemoryIds: [],
      reasoning: "The user stated where they work.",
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  let statement: unknown;
  try {
    const body = await req.json();
    statement = body.statement;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!statement || typeof statement !== "string") {
    return NextResponse.json(
      { error: "statement is required" },
      { status: 400 }
    );
  }

  // Fetch all active memories so the LLM can find matches
  const existingMemories = await prisma.memory.findMany({
    where: { status: "active" },
    select: { id: true, content: true, category: true },
  });

  const memoriesList = existingMemories
    .map((m) => `[${m.id}] (${m.category}) ${m.content}`)
    .join("\n");
  const categories = await getCategories();
  const categoryList = categories.map((c) => `- ${c.slug}: ${c.label}`).join("\n");
  const validCategorySlugs = new Set(categories.map((c) => c.slug));

  let quickResult: QuickStatementResult | null = null;
  let usedLocalFallback = false;
  let llmError: string | null = null;

  try {
    const result = await structuredCall({
      system: `You are a memory update agent. The user is making a statement about themselves. Determine what action to take on their memory store.

Existing memories:
${memoriesList || "(none)"}

Actions:
- "create": The statement contains new information not in any existing memory. Provide the memory content and category.
- "update": The statement updates/corrects an existing memory. Provide the updated content, category, and the ID of the memory to update (matchingMemoryId).
- "delete": The statement explicitly says to remove/forget something, or says an existing fact is no longer true without replacing it. Provide the ID of the memory to delete (matchingMemoryId).

If multiple existing memories repeat the same underlying fact, include all their IDs in matchingMemoryIds. Cortex will keep one canonical memory and archive the repeated stale versions.

Categories available:
${categoryList}

Always return the cleanest, most atomic version of the fact as content. For example, if the user says "Actually I'm 25 not 23", the content should be "User is 25 years old".`,
      user: `User statement: "${statement}"`,
      schema: QuickStatementResultSchema,
      schemaName: "quick_statement",
      schemaDescription: "Determine action for a user statement",
      maxTokens: 512,
      temperature: 0,
    });
    quickResult = result.data;
  } catch (error) {
    llmError = error instanceof Error ? error.message : String(error);
    console.error("Quick statement LLM failed:", error);
    quickResult = inferQuickStatement(statement);
    usedLocalFallback = quickResult !== null;
  }

  if (!quickResult) {
    return NextResponse.json(
      {
        error: "Quick Statement could not reach the LLM, and no safe local fallback matched this statement.",
        detail: llmError,
      },
      { status: 503 }
    );
  }

  const { action, content, matchingMemoryId, reasoning } =
    quickResult;
  const explicitMatchIds = Array.from(
    new Set([
      ...(matchingMemoryId ? [matchingMemoryId] : []),
      ...quickResult.matchingMemoryIds,
    ])
  );
  const category = validCategorySlugs.has(quickResult.category)
    ? quickResult.category
    : (categories[0]?.slug ?? "identity");

  let memoryId: string | null = null;
  let previousContent: string | null = null;
  const archivedDuplicateIds: string[] = [];
  const changedMemoryIds: string[] = [];

  const relatedByFactKey = existingMemories
    .filter((memory) => memoryFactKeysMatch(memory.content, content))
    .map((memory) => memory.id);
  const relatedIds = Array.from(new Set([...explicitMatchIds, ...relatedByFactKey]))
    .filter((id) => existingMemories.some((memory) => memory.id === id));
  const effectiveAction = action === "create" && relatedIds.length > 0 ? "update" : action;

  // Need a source for new memories — use or create a "cortex_manual" source
  const getManualSource = async () => {
    let source = await prisma.source.findFirst({
      where: { type: "manual", name: "Cortex Manual" },
    });
    if (!source) {
      source = await prisma.source.create({
        data: { type: "manual", name: "Cortex Manual", status: "active" },
      });
    }
    return source;
  };

  async function archiveDuplicates(ids: string[], keepId?: string) {
    for (const id of ids) {
      if (id === keepId) continue;
      const memory = existingMemories.find((candidate) => candidate.id === id);
      if (!memory) continue;
      await prisma.memory.update({
        where: { id },
        data: {
          status: "archived",
          archivedAt: new Date(),
          archivedReason: keepId
            ? `Superseded by quick memory change ${keepId}`
            : "User deleted via quick statement",
        },
      });
      archivedDuplicateIds.push(id);
    }
  }

  switch (effectiveAction) {
    case "create": {
      const source = await getManualSource();
      const memory = await prisma.memory.create({
        data: {
          content,
          category,
          confidence: 1.0,
          temporality: "durable",
          sensitive: false,
          sourceId: source.id,
          status: "active",
          approvedAt: new Date(),
        },
      });
      memoryId = memory.id;
      changedMemoryIds.push(memory.id);
      break;
    }
    case "update": {
      const keepId = relatedIds[0];
      if (keepId) {
        const existing = existingMemories.find((memory) => memory.id === keepId);
        previousContent = existing?.content ?? null;
        const memory = await prisma.memory.update({
          where: { id: keepId },
          data: {
            content,
            category,
            referenceCount: { increment: 1 },
            lastReferencedAt: new Date(),
          },
        });
        memoryId = memory.id;
        changedMemoryIds.push(memory.id);
        await archiveDuplicates(relatedIds, keepId);
      } else {
        const source = await getManualSource();
        const memory = await prisma.memory.create({
          data: {
            content,
            category,
            confidence: 1.0,
            temporality: "durable",
            sensitive: false,
            sourceId: source.id,
            status: "active",
            approvedAt: new Date(),
          },
        });
        memoryId = memory.id;
        changedMemoryIds.push(memory.id);
      }
      break;
    }
    case "delete": {
      if (relatedIds.length > 0) {
        previousContent = existingMemories.find((memory) => memory.id === relatedIds[0])?.content ?? null;
        await archiveDuplicates(relatedIds);
        memoryId = relatedIds[0];
      } else if (matchingMemoryId) {
        await prisma.memory.update({
          where: { id: matchingMemoryId },
          data: {
            status: "archived",
            archivedAt: new Date(),
            archivedReason: "User deleted via quick statement",
          },
        });
        memoryId = matchingMemoryId;
        archivedDuplicateIds.push(matchingMemoryId);
      }
      break;
    }
  }

  // Log activity
  await prisma.activityLog.create({
    data: {
      action: "quick_statement",
      summary: `${action}: ${content}`,
      details: JSON.stringify({
        statement,
        action: effectiveAction,
        requestedAction: action,
        content,
        category,
        matchingMemoryId: memoryId,
        matchingMemoryIds: relatedIds,
        previousContent,
        archivedDuplicateIds,
        reasoning,
        usedLocalFallback,
        llmError,
      }),
    },
  });

  const propagation = await notifyMemoryChange({
    action: effectiveAction,
    memoryId,
    content,
    category,
    previousContent,
    archivedCount: archivedDuplicateIds.length,
  });
  const propagatedCount = propagation.destinations.filter((destination) => destination.success).length;
  const message =
    effectiveAction === "delete"
      ? `Archived ${archivedDuplicateIds.length || 1} memor${(archivedDuplicateIds.length || 1) === 1 ? "y" : "ies"} and propagated the removal to ${propagatedCount} platform(s).`
      : previousContent
        ? `Updated "${previousContent}" to "${content}"${archivedDuplicateIds.length > 0 ? ` and archived ${archivedDuplicateIds.length} repeated memor${archivedDuplicateIds.length === 1 ? "y" : "ies"}` : ""}. Propagated to ${propagatedCount} platform(s).`
        : `Created "${content}". Propagated to ${propagatedCount} platform(s).`;

  return NextResponse.json({
    action: effectiveAction,
    requestedAction: action,
    content,
    category,
    reasoning,
    memoryId,
    previousContent,
    changedMemoryIds,
    archivedDuplicateIds,
    usedLocalFallback,
    message,
    propagation: {
      destinations: propagation.destinations,
      chatgptText: propagation.chatgptText,
    },
  });
}
