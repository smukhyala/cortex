import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { prisma } from "@/lib/db";
import { runPipeline } from "@/pipeline/run";
import type { SourceType, SyncTrigger } from "@/contracts/source";

const UPLOAD_DIR = path.resolve(process.cwd(), "data/uploads");

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sourceType = formData.get("sourceType") as string | null;
    const sourceName = formData.get("sourceName") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!sourceType) {
      return NextResponse.json({ error: "sourceType is required" }, { status: 400 });
    }

    // Read file content
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Check for duplicate upload via file hash
    const fileHash = createHash("sha256").update(buffer).digest("hex");

    // Save file to uploads directory
    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = path.extname(file.name) || ".json";
    const fileName = `${sourceType}-${Date.now()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    await writeFile(filePath, buffer);

    // Find or create source
    let source = await prisma.source.findFirst({
      where: { type: sourceType, lastFileHash: fileHash },
    });

    if (source) {
      return NextResponse.json({
        message: "This file has already been processed",
        sourceId: source.id,
        skipped: true,
      });
    }

    source = await prisma.source.findFirst({
      where: { type: sourceType },
    });

    if (!source) {
      source = await prisma.source.create({
        data: {
          type: sourceType,
          name: sourceName || `${sourceType} upload`,
          config: JSON.stringify({ filePath }),
          lastFileHash: fileHash,
        },
      });
    } else {
      await prisma.source.update({
        where: { id: source.id },
        data: {
          config: JSON.stringify({ ...JSON.parse(source.config || "{}"), filePath }),
          lastFileHash: fileHash,
        },
      });
    }

    // Run pipeline
    const result = await runPipeline({
      sourceId: source.id,
      sourceType: sourceType as SourceType,
      filePath,
      trigger: "upload" as SyncTrigger,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Upload failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
