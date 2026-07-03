import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeClaudeExport } from "@/exporters/claude";

/**
 * POST /api/writeback
 * Write active memories back to a CLAUDE.md file at a specified path.
 * Body: { filePath: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filePath } = body;

    if (!filePath) {
      return NextResponse.json(
        { error: "filePath is required" },
        { status: 400 }
      );
    }

    const memories = await prisma.memory.findMany({
      where: { status: "active" },
      orderBy: { category: "asc" },
      select: {
        content: true,
        category: true,
        sensitive: true,
      },
    });

    if (memories.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active memories to write",
        memoriesWritten: 0,
      });
    }

    await writeClaudeExport(filePath, memories);

    await prisma.activityLog.create({
      data: {
        action: "export_generated",
        summary: `Wrote ${memories.length} memories to ${filePath}`,
        details: JSON.stringify({ filePath, count: memories.length }),
      },
    });

    return NextResponse.json({
      success: true,
      memoriesWritten: memories.length,
      filePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
