import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    data.name = body.name.trim();
    data.slug = slugify(body.name.trim());
  }
  if (body.parentId !== undefined) data.parentId = body.parentId || null;
  if (body.icon !== undefined) data.icon = body.icon || null;
  if (body.color !== undefined) data.color = body.color || null;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

  const folder = await prisma.folder.update({
    where: { id },
    data,
    include: { _count: { select: { memories: true } } },
  });

  return NextResponse.json(folder);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Detach all memories from this folder first
  await prisma.memoryFolder.deleteMany({ where: { folderId: id } });
  // Re-parent children to null
  await prisma.folder.updateMany({
    where: { parentId: id },
    data: { parentId: null },
  });
  await prisma.folder.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
