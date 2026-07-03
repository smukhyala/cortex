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
  const { type, name, config } = body;

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
    },
  });

  return NextResponse.json(source, { status: 201 });
}
