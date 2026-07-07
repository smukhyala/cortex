import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { propagateToAllPlatforms } from "@/services/propagate";

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

  // Propagate changes to all platforms
  propagateToAllPlatforms({
    pokeMessage:
      memory.status === "archived"
        ? `Please forget/remove this user memory if you have stored it: ${memory.content}`
        : `Please remember this Cortex user memory and use it in future answers automatically, without requiring me to ask you to use Cortex or MCP: ${memory.content}`,
    pokeRunId: `cortex-memory-${memory.status === "archived" ? "archive" : "update"}-${memory.id}`,
    pokeMetadata: {
      type: "memory_update",
      action: memory.status === "archived" ? "delete" : "update",
      memoryId: memory.id,
      memory: memory.content,
      category: memory.category,
    },
  }).catch(console.error);

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

  // Propagate changes to all platforms
  propagateToAllPlatforms({
    pokeMessage: `Please forget/remove this Cortex user memory if you have stored it, and do not use it in future answers: ${memory.content}`,
    pokeRunId: `cortex-memory-delete-${memory.id}`,
    pokeMetadata: {
      type: "memory_update",
      action: "delete",
      memoryId: memory.id,
      memory: memory.content,
      category: memory.category,
    },
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
