import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatForChatGPT } from "@/exporters/chatgpt";
import { formatForClaude } from "@/exporters/claude";
import { pushToPoke } from "@/exporters/poke";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ format: string }> }
) {
  const { format } = await params;

  const memories = await prisma.memory.findMany({
    where: { status: "active" },
    orderBy: { category: "asc" },
  });

  const exportable = memories.map((m) => ({
    content: m.content,
    category: m.category,
    sensitive: m.sensitive,
  }));

  switch (format) {
    case "chatgpt": {
      const text = formatForChatGPT(exportable);
      return new NextResponse(text, {
        headers: { "Content-Type": "text/plain" },
      });
    }

    case "claude": {
      const text = formatForClaude(exportable);
      return new NextResponse(text, {
        headers: {
          "Content-Type": "text/markdown",
          "Content-Disposition": "attachment; filename=CLAUDE.md",
        },
      });
    }

    case "json": {
      return NextResponse.json({
        version: 1,
        exportedAt: new Date().toISOString(),
        memoryCount: memories.length,
        memories: memories.map((m) => ({
          content: m.content,
          subject: m.subject,
          category: m.category,
          confidence: m.confidence,
          temporality: m.temporality,
          sensitive: m.sensitive,
          createdAt: m.createdAt,
        })),
      });
    }

    case "poke": {
      const apiKey = process.env.POKE_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "POKE_API_KEY not configured" },
          { status: 400 }
        );
      }
      const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
      const startTime = Date.now();
      const result = await pushToPoke(exportable, apiKey, { dryRun });

      if (dryRun) {
        await prisma.exportLog.create({
          data: {
            destination: "poke",
            status: "dry_run",
            memoriesCount: exportable.length,
            durationMs: Date.now() - startTime,
          },
        });
        return NextResponse.json(result);
      }

      await prisma.exportLog.create({
        data: {
          destination: "poke",
          status: result.success ? "success" : "failed",
          memoriesCount: exportable.length,
          errorMessage: result.error || null,
          durationMs: Date.now() - startTime,
        },
      });

      if (result.success) {
        await prisma.activityLog.create({
          data: {
            action: "export_generated",
            summary: `Pushed ${exportable.length} memories to Poke`,
          },
        });
      }
      return NextResponse.json(result, { status: result.success ? 200 : 500 });
    }

    default:
      return NextResponse.json(
        { error: `Unknown format: ${format}. Use: chatgpt, claude, json, poke` },
        { status: 400 }
      );
  }
}
