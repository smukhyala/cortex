import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { structuredCall } from "@/lib/llm";
import { propagateToAllPlatforms } from "@/services/propagate";

const QuickStatementResultSchema = z.object({
  action: z.enum(["create", "update", "delete"]),
  content: z.string(),
  category: z.string(),
  matchingMemoryId: z.string().optional(),
  reasoning: z.string(),
});

export async function POST(req: NextRequest) {
  const { statement } = await req.json();
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

  const result = await structuredCall({
    system: `You are a memory update agent. The user is making a statement about themselves. Determine what action to take on their memory store.

Existing memories:
${memoriesList || "(none)"}

Actions:
- "create": The statement contains new information not in any existing memory. Provide the memory content and category.
- "update": The statement updates/corrects an existing memory. Provide the updated content, category, and the ID of the memory to update (matchingMemoryId).
- "delete": The statement explicitly says to remove/forget something. Provide the ID of the memory to delete (matchingMemoryId).

Categories available: identity, education_career, projects, research, preferences, goals, relationships, writing_voice, workflows, temporary

Always return the cleanest, most atomic version of the fact as content. For example, if the user says "Actually I'm 25 not 23", the content should be "User is 25 years old".`,
    user: `User statement: "${statement}"`,
    schema: QuickStatementResultSchema,
    schemaName: "quick_statement",
    schemaDescription: "Determine action for a user statement",
    maxTokens: 512,
    temperature: 0,
  });

  const { action, content, category, matchingMemoryId, reasoning } =
    result.data;

  let memoryId: string | null = null;

  // Need a source for new memories — use or create a "cortex_manual" source
  const getManualSource = async () => {
    let source = await prisma.source.findFirst({
      where: { type: "poke", name: "Cortex Manual" },
    });
    if (!source) {
      source = await prisma.source.create({
        data: { type: "poke", name: "Cortex Manual", status: "active" },
      });
    }
    return source;
  };

  switch (action) {
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
      break;
    }
    case "update": {
      if (matchingMemoryId) {
        await prisma.memory.update({
          where: { id: matchingMemoryId },
          data: { content, category },
        });
        memoryId = matchingMemoryId;
      }
      break;
    }
    case "delete": {
      if (matchingMemoryId) {
        await prisma.memory.update({
          where: { id: matchingMemoryId },
          data: {
            status: "archived",
            archivedAt: new Date(),
            archivedReason: "User deleted via quick statement",
          },
        });
        memoryId = matchingMemoryId;
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
        action,
        content,
        category,
        matchingMemoryId,
        reasoning,
      }),
    },
  });

  // Propagate to all platforms
  const propagation = await propagateToAllPlatforms();

  return NextResponse.json({
    action,
    content,
    category,
    reasoning,
    memoryId,
    propagation: {
      destinations: propagation.destinations,
      chatgptText: propagation.chatgptText,
    },
  });
}
