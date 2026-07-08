import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { notifyMemoryChange } from "@/services/memory-change";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const memory = await prisma.memory.findUnique({
    where: { id },
    include: {
      source: { select: { name: true, type: true } },
      conflictsAsNew: { include: { existingMemory: true } },
      conflictsAsOld: { include: { newMemory: true } },
    },
  });

  if (!memory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(memory);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const nextStatus = typeof body.status === "string" ? body.status : undefined;

  const memory = await prisma.memory.update({
    where: { id },
    data: {
      ...(body.content !== undefined && { content: body.content }),
      ...(body.category !== undefined && { category: body.category }),
      ...(nextStatus !== undefined && { status: nextStatus }),
      ...(body.manuallyStrong !== undefined && { manuallyStrong: Boolean(body.manuallyStrong) }),
      ...(body.project !== undefined && { project: body.project || null }),
      ...(nextStatus === "archived" && {
        archivedAt: new Date(),
        archivedReason: body.reason || "Manual archive",
      }),
      ...(nextStatus === "deleted" && {
        archivedAt: new Date(),
        archivedReason: body.reason || "Deleted from archive",
      }),
      ...(nextStatus === "active" && {
        archivedAt: null,
        archivedReason: null,
      }),
    },
  });

  // Handle folder assignments
  if (Array.isArray(body.folderIds)) {
    // Remove all existing folder assignments
    await prisma.memoryFolder.deleteMany({ where: { memoryId: id } });
    // Create new assignments
    if (body.folderIds.length > 0) {
      for (const folderId of body.folderIds) {
        try {
          await prisma.memoryFolder.create({ data: { memoryId: id, folderId } });
        } catch {
          // skip duplicates
        }
      }
    }
  }

  const action =
    nextStatus === "archived"
        ? "archive"
        : nextStatus === "deleted"
          ? "delete"
          : nextStatus === "active"
            ? "restore"
            : "update";
  const shouldPropagate =
    body.content !== undefined ||
    body.category !== undefined ||
    nextStatus !== undefined;

  if (shouldPropagate) {
    await notifyMemoryChange({
      action,
      memoryId: memory.id,
      content: memory.content,
      category: memory.category,
    });
  }

  return NextResponse.json(memory);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const existing = await prisma.memory.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.status !== "archived") {
    return NextResponse.json(
      { error: "Memories can only be deleted from Archive. Archive this memory first." },
      { status: 409 }
    );
  }

  const memory = await prisma.memory.update({
    where: { id },
    data: { status: "deleted", archivedAt: new Date(), archivedReason: "Deleted from archive" },
  });

  await notifyMemoryChange({
    action: "delete",
    memoryId: memory.id,
    content: memory.content,
    category: memory.category,
  });

  return NextResponse.json({ success: true, status: "deleted" });
}
