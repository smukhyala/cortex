import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { invalidateCategoryCache } from "@/lib/categories";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { label, color, sortOrder } = body;

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(label !== undefined && { label }),
      ...(color !== undefined && { color }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  });

  invalidateCategoryCache();
  return NextResponse.json(category);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  // Check if any memories use this category
  const memCount = await prisma.memory.count({ where: { category: category.slug } });
  if (memCount > 0) {
    // Require a migration target
    const url = new URL(req.url);
    const migrateTo = url.searchParams.get("migrateTo");
    if (!migrateTo) {
      return NextResponse.json(
        { error: `${memCount} memories use this category. Provide ?migrateTo=<slug> to migrate them.` },
        { status: 400 }
      );
    }
    await prisma.memory.updateMany({
      where: { category: category.slug },
      data: { category: migrateTo },
    });
  }

  await prisma.category.delete({ where: { id } });
  invalidateCategoryCache();
  return NextResponse.json({ success: true });
}
