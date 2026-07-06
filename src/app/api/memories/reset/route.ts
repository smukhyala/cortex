import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE() {
  try {
    const now = new Date();

    // Archive all active memories
    const result = await prisma.memory.updateMany({
      where: { status: "active" },
      data: {
        status: "archived",
        archivedAt: now,
        archivedReason: "User reset all memories",
      },
    });

    // Also archive any pending memories
    const pendingResult = await prisma.memory.updateMany({
      where: { status: "pending" },
      data: {
        status: "archived",
        archivedAt: now,
        archivedReason: "User reset all memories",
      },
    });

    const totalArchived = result.count + pendingResult.count;

    // Log the action
    await prisma.activityLog.create({
      data: {
        action: "reset_all_memories",
        summary: `User reset all memories — ${totalArchived} memories archived`,
        details: JSON.stringify({
          activeArchived: result.count,
          pendingArchived: pendingResult.count,
          totalArchived,
          timestamp: now.toISOString(),
        }),
      },
    });

    return NextResponse.json({ archived: totalArchived });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Reset failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
