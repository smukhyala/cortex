import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";

export async function GET() {
  const folders = await prisma.folder.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { memories: true } },
      children: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { memories: true } } },
      },
    },
    where: { parentId: null },
  });

  return NextResponse.json(folders);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name: string = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let slug = slugify(name);
  // Ensure slug uniqueness by appending a counter
  const existing = await prisma.folder.findUnique({ where: { slug } });
  if (existing) {
    let counter = 2;
    while (await prisma.folder.findUnique({ where: { slug: `${slug}-${counter}` } })) {
      counter++;
    }
    slug = `${slug}-${counter}`;
  }

  const folder = await prisma.folder.create({
    data: {
      name,
      slug,
      parentId: body.parentId || null,
      icon: body.icon || null,
      color: body.color || null,
    },
    include: { _count: { select: { memories: true } } },
  });

  return NextResponse.json(folder, { status: 201 });
}
