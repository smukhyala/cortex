import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyMemoryChange } from "@/services/memory-change";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "24", 10)));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.reviewItem.findMany({
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
      skip,
      take: limit,
    }),
    prisma.reviewItem.count({ where: { status: "pending" } }),
  ]);

  return NextResponse.json({ items, total, page, limit });
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

    await notifyMemoryChange({ action: "approve_all", count: pending.length });

    return NextResponse.json({ approved: pending.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
