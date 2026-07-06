import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { invalidateCategoryCache } from "@/lib/categories";

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, label, color } = body;

  if (!slug || !label) {
    return NextResponse.json({ error: "slug and label required" }, { status: 400 });
  }

  const maxOrder = await prisma.category.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const category = await prisma.category.create({
    data: {
      slug: slug.toLowerCase().replace(/\s+/g, "_"),
      label,
      color: color || "bg-neutral-100 text-neutral-600",
      sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
      isDefault: false,
    },
  });

  invalidateCategoryCache();
  return NextResponse.json(category, { status: 201 });
}
