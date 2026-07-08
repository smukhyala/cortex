import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const memoryIds: string[] = body.memoryIds;

  if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
    return NextResponse.json({ error: "memoryIds array is required" }, { status: 400 });
  }

  // SQLite does not support skipDuplicates in createMany, so loop with try/catch
  let added = 0;
  for (const memoryId of memoryIds) {
    try {
      await prisma.memoryFolder.create({
        data: { memoryId, folderId: id },
      });
      added++;
    } catch {
      // Ignore unique constraint violations (already assigned)
    }
  }

  return NextResponse.json({ added });
}
