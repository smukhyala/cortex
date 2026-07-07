import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeMemoryStrength } from "@/lib/memory-strength";
import { notifyMemoryChange } from "@/services/memory-change";
import { isLikelyTechnicalMemory } from "@/lib/memory-quality";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const status = searchParams.get("status") || "active";
  const search = searchParams.get("q");

  const where: Record<string, unknown> = { status };
  if (category) where.category = category;
  if (search) where.content = { contains: search };

  const memories = await prisma.memory.findMany({
    where,
    include: {
      source: { select: { name: true, type: true, config: true } },
      conversation: { select: { title: true, externalId: true } },
    },
  });

  const now = new Date();
  const memoriesWithStrength = memories
    .map((m) => {
      const isTechnical = isLikelyTechnicalMemory(m.content);
      return {
        ...m,
        strength: computeMemoryStrength(
          m.referenceCount,
          new Date(m.lastReferencedAt),
          now,
          {
            content: m.content,
            category: m.category,
            isTechnical,
            manuallyStrong: m.manuallyStrong,
          }
        ),
        quality: {
          isTechnical,
        },
      };
    })
    .sort((a, b) =>
      b.strength - a.strength ||
      b.referenceCount - a.referenceCount ||
      b.lastReferencedAt.getTime() - a.lastReferencedAt.getTime()
    );

  return NextResponse.json(memoriesWithStrength);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const memory = await prisma.memory.create({
    data: {
      content: body.content,
      subject: body.subject || "user",
      category: body.category,
      confidence: body.confidence || 1.0,
      temporality: body.temporality || "durable",
      sensitive: body.sensitive || false,
      sourceId: body.sourceId,
      status: "active",
      approvedAt: new Date(),
    },
  });

  await notifyMemoryChange({
    action: "create",
    memoryId: memory.id,
    content: memory.content,
    category: memory.category,
  });

  return NextResponse.json(memory, { status: 201 });
}
