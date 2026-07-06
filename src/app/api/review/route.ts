import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { propagateToAllPlatforms } from "@/services/propagate";

export async function GET() {
  const items = await prisma.reviewItem.findMany({
    where: { status: "pending" },
    include: {
      memory: {
        include: { source: { select: { name: true, type: true } } },
      },
      conflict: {
        include: { existingMemory: true },
      },
    },
    orderBy: [{ type: "desc" }, { createdAt: "desc" }], // conflicts first
  });

  return NextResponse.json(items);
}

// Batch approve all pending
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body; // "approve_all"

  if (action === "approve_all") {
    const pending = await prisma.reviewItem.findMany({
      where: { status: "pending", type: "new_memory" },
      select: {
        id: true,
        memoryId: true,
        memory: { select: { content: true, category: true } },
      },
    });

    for (const item of pending) {
      await prisma.reviewItem.update({
        where: { id: item.id },
        data: { status: "approved", resolvedAt: new Date() },
      });
      await prisma.memory.update({
        where: { id: item.memoryId },
        data: { status: "active", approvedAt: new Date() },
      });
    }

    await prisma.activityLog.create({
      data: {
        action: "memory_approved",
        summary: `Batch approved ${pending.length} memories`,
      },
    });

    propagateToAllPlatforms({
      pokeMessage: [
        `Please remember these ${pending.length} newly approved Cortex memories. If I ask about them later, answer using these memories.`,
        ...pending.map((item) => `- ${item.memory.content}`),
      ].join("\n"),
      pokeRunId: `cortex-review-approve-all-${Date.now()}`,
      pokeMetadata: {
        type: "memory_update",
        action: "approve_all",
        count: pending.length,
      },
    }).catch(console.error);

    return NextResponse.json({ approved: pending.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
