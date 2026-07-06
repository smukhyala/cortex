import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { structuredCall } from "@/lib/llm";
import { getCategories, invalidateCategoryCache } from "@/lib/categories";

export async function POST() {
  const categories = await getCategories();
  const memories = await prisma.memory.findMany({
    where: { status: "active" },
    select: { id: true, content: true, category: true },
  });

  if (memories.length === 0) {
    return NextResponse.json({ changed: 0, total: 0 });
  }

  const categoryList = categories.map(c => `- "${c.slug}": ${c.label}`).join("\n");
  const BatchResultSchema = z.object({
    assignments: z.array(z.object({
      id: z.string(),
      category: z.string(),
    })),
  });

  let totalChanged = 0;
  const batchSize = 50;

  for (let i = 0; i < memories.length; i += batchSize) {
    const batch = memories.slice(i, i + batchSize);
    const memoriesList = batch.map(m => `[${m.id}] ${m.content} (current: ${m.category})`).join("\n");

    const result = await structuredCall({
      system: `You are a memory categorization agent. Given a list of memories and a set of categories, assign each memory to the most appropriate category.

Available categories:
${categoryList}

For each memory, return its ID and the best-matching category slug. Only change the category if the current one is clearly wrong for the new category set. If the current category still exists and is appropriate, keep it.`,
      user: `Re-categorize these memories:\n\n${memoriesList}`,
      schema: BatchResultSchema,
      schemaName: "recategorize_memories",
      schemaDescription: "Assign categories to memories",
      maxTokens: 4096,
      temperature: 0,
    });

    for (const assignment of result.data.assignments) {
      const memory = batch.find(m => m.id === assignment.id);
      if (memory && assignment.category !== memory.category) {
        await prisma.memory.update({
          where: { id: assignment.id },
          data: { category: assignment.category },
        });
        totalChanged++;
      }
    }
  }

  invalidateCategoryCache();

  return NextResponse.json({
    changed: totalChanged,
    total: memories.length,
  });
}
