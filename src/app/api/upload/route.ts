import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { prisma } from "@/lib/db";
import { runPipeline } from "@/pipeline/run";
import type { SourceType, SyncTrigger } from "@/contracts/source";

const UPLOAD_DIR = path.resolve(process.cwd(), "data/uploads");

/**
 * Content-based detection of source type for JSON files.
 * Peeks at the parsed JSON structure to determine the actual format,
 * overriding the client-side filename-based guess.
 */
function detectSourceType(buffer: Buffer, clientGuess: string): string {
  // ZIP files are always chatgpt_export (ChatGPT exports as .zip)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return "chatgpt_export";
  }

  try {
    const text = buffer.toString("utf-8");
    const parsed = JSON.parse(text);

    // Handle arrays (both Claude.ai and ChatGPT export arrays of conversations)
    const sample = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!sample || typeof sample !== "object") return clientGuess;

    // Claude.ai export: has uuid + chat_messages
    if ("uuid" in sample && "chat_messages" in sample) {
      return "claude_export";
    }

    // ChatGPT export: has mapping + current_node (tree structure)
    if ("mapping" in sample && "current_node" in sample) {
      return "chatgpt_export";
    }

    // ChatGPT export: has title + mapping (alternate structure)
    if ("title" in sample && "mapping" in sample) {
      return "chatgpt_export";
    }

    return clientGuess;
  } catch {
    // If JSON parse fails, trust the client guess
    return clientGuess;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const clientSourceType = formData.get("sourceType") as string | null;
    const sourceName = formData.get("sourceName") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!clientSourceType) {
      return NextResponse.json({ error: "sourceType is required" }, { status: 400 });
    }

    // Read file content
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Content-based source type detection (overrides client-side filename guess)
    const sourceType = detectSourceType(buffer, clientSourceType);

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
