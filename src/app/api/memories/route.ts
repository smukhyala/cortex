import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const status = searchParams.get("status") || "active";
  const search = searchParams.get("q");

  const where: Record<string, unknown> = { status };
  if (category) where.category = category;
  if (search) where.content = { contains: search };

  const memories = await prisma.memory.findMany({
    where,
    include: { source: { select: { name: true, type: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(memories);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const memory = await prisma.memory.create({
    data: {
      content: body.content,
      subject: body.subject || "user",
      category: body.category,
      confidence: body.confidence || 1.0,
      temporality: body.temporality || "durable",
      sensitive: body.sensitive || false,
      sourceId: body.sourceId,
      status: "active",
      approvedAt: new Date(),
    },
  });

  return NextResponse.json(memory, { status: 201 });
}
