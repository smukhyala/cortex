import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const sources = await prisma.source.findMany({
    include: { _count: { select: { memories: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(sources);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, name, config, accountLabel } = body;

  if (!type || !name) {
    return NextResponse.json(
      { error: "type and name are required" },
      { status: 400 }
    );
  }

  const source = await prisma.source.create({
    data: {
      type,
      name,
      config: JSON.stringify(config || {}),
      ...(accountLabel ? { accountLabel } : {}),
    },
  });

  return NextResponse.json(source, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, accountLabel } = body;

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400 }
    );
  }

  const source = await prisma.source.update({
    where: { id },
    data: { accountLabel: accountLabel ?? null },
  });

  return NextResponse.json(source);
}
