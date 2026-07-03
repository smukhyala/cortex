import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { action, editedContent, note, resolution } = body;

  const reviewItem = await prisma.reviewItem.findUnique({
    where: { id },
    include: { conflict: true },
  });

  if (!reviewItem) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  switch (action) {
    case "approve": {
      // If content was edited, update the memory first
      if (editedContent) {
        await prisma.memory.update({
          where: { id: reviewItem.memoryId },
          data: { content: editedContent },
        });
      }

      await prisma.memory.update({
        where: { id: reviewItem.memoryId },
        data: { status: "active", approvedAt: new Date() },
      });

      await prisma.reviewItem.update({
        where: { id },
        data: { status: "approved", resolvedAt: new Date(), note },
      });

      await prisma.activityLog.create({
        data: {
          action: "memory_approved",
          summary: `Approved memory: ${(editedContent || "").slice(0, 80) || reviewItem.title}`,
        },
      });

      return NextResponse.json({ success: true, action: "approved" });
    }

    case "reject": {
      await prisma.memory.update({
        where: { id: reviewItem.memoryId },
        data: { status: "rejected" },
      });

      await prisma.reviewItem.update({
        where: { id },
        data: { status: "rejected", resolvedAt: new Date(), note },
      });

      await prisma.activityLog.create({
        data: {
          action: "memory_rejected",
          summary: `Rejected memory: ${reviewItem.title}`,
        },
      });

      return NextResponse.json({ success: true, action: "rejected" });
    }

    case "resolve_conflict": {
      if (!reviewItem.conflict) {
        return NextResponse.json({ error: "Not a conflict item" }, { status: 400 });
      }

      // resolution: "keep_new" | "keep_existing" | "merge" | "dismiss"
      switch (resolution) {
        case "keep_new":
          // Archive old, approve new
          await prisma.memory.update({
            where: { id: reviewItem.conflict.existingMemoryId },
            data: { status: "archived", archivedAt: new Date(), archivedReason: "Superseded by newer memory" },
          });
          await prisma.memory.update({
            where: { id: reviewItem.memoryId },
            data: { status: "active", approvedAt: new Date() },
          });
          break;

        case "keep_existing":
          // Reject new
          await prisma.memory.update({
            where: { id: reviewItem.memoryId },
            data: { status: "rejected" },
          });
          break;

        case "merge":
          // Update existing with merged content, reject new
          if (editedContent) {
            await prisma.memory.update({
              where: { id: reviewItem.conflict.existingMemoryId },
              data: { content: editedContent },
            });
          }
          await prisma.memory.update({
            where: { id: reviewItem.memoryId },
            data: { status: "rejected" },
          });
          break;

        case "dismiss":
          // Keep both as-is, approve new
          await prisma.memory.update({
            where: { id: reviewItem.memoryId },
            data: { status: "active", approvedAt: new Date() },
          });
          break;
      }

      await prisma.conflict.update({
        where: { id: reviewItem.conflict.id },
        data: { status: "resolved", resolvedAt: new Date() },
      });

      await prisma.reviewItem.update({
        where: { id },
        data: { status: "approved", resolvedAt: new Date(), note },
      });

      await prisma.activityLog.create({
        data: {
          action: "conflict_resolved",
          summary: `Resolved conflict (${resolution}): ${reviewItem.title}`,
        },
      });

      return NextResponse.json({ success: true, action: "resolved", resolution });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
