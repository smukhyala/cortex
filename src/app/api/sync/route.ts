import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runPipeline } from "@/pipeline/run";
import type { SourceType, SyncTrigger } from "@/contracts/source";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sourceId } = body;

    if (!sourceId) {
      return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
    }

    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Parse config to get file path
    const config = JSON.parse(source.config || "{}");
    const filePath = config.path || config.filePath;
    if (!filePath) {
      return NextResponse.json(
        { error: "Source has no configured path. Upload a file or configure a directory." },
        { status: 400 }
      );
    }

    const result = await runPipeline({
      sourceId: source.id,
      sourceType: source.type as SourceType,
      filePath,
      trigger: "manual" as SyncTrigger,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Sync failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
