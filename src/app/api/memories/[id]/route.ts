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

  const memory = await prisma.memory.update({
    where: { id },
    data: {
      ...(body.content !== undefined && { content: body.content }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.status === "archived" && {
        archivedAt: new Date(),
        archivedReason: body.reason || "Manual archive",
      }),
    },
  });

  await notifyMemoryChange({
    action: memory.status === "archived" ? "archive" : "update",
    memoryId: memory.id,
    content: memory.content,
    category: memory.category,
  });

  return NextResponse.json(memory);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const memory = await prisma.memory.update({
    where: { id },
    data: { status: "archived", archivedAt: new Date(), archivedReason: "Deleted by user" },
  });

  await notifyMemoryChange({
    action: "delete",
    memoryId: memory.id,
    content: memory.content,
    category: memory.category,
  });

  return NextResponse.json({ success: true });
}
