import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { formatForChatGPT } from "@/exporters/chatgpt";
import { formatForClaude } from "@/exporters/claude";
import { pushToPoke } from "@/exporters/poke";
import { propagateToAllPlatforms } from "@/services/propagate";

function readConfig(config: string | null | undefined): Record<string, unknown> {
  try {
    return JSON.parse(config || "{}");
  } catch {
    return {};
  }
}

async function getPokeApiKey(): Promise<string | null> {
  if (process.env.POKE_API_KEY) return process.env.POKE_API_KEY;

  const source = await prisma.source.findFirst({
    where: { type: "poke", status: "active" },
    orderBy: { createdAt: "desc" },
  });
  const apiKey = source ? readConfig(source.config).apiKey : null;
  return typeof apiKey === "string" && apiKey.length > 0 ? apiKey : null;
}

function getPokeKeyKind(apiKey: string): "legacy_pk" | "v2" {
  return apiKey.startsWith("pk_") ? "legacy_pk" : "v2";
}

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
      const apiKey = await getPokeApiKey();
      if (!apiKey) {
        return NextResponse.json(
          { error: "No Poke API key configured. Add POKE_API_KEY or a Poke account in Settings." },
          { status: 400 }
        );
      }
      const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
      if (!dryRun) {
        const propagation = await propagateToAllPlatforms({
          onlyDestinations: ["poke"],
          pokeRunId: `cortex-export-poke-${Date.now()}`,
          pokeMetadata: { type: "manual_poke_export" },
        });
        const ok = propagation.destinations.every((destination) => destination.success);
        return NextResponse.json(
          { success: ok, destinations: propagation.destinations },
          { status: ok ? 200 : 500 }
        );
      }
      const startTime = Date.now();
      const result = await pushToPoke(exportable, apiKey, { dryRun });

      if (dryRun) {
        await prisma.exportLog.create({
          data: {
            destination: "poke",
            status: "dry_run",
            memoriesCount: exportable.length,
            details: JSON.stringify({
              endpoint: result.endpoint,
              keyKind: getPokeKeyKind(apiKey),
              dryRun: true,
            }),
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
          details: JSON.stringify({
            endpoint: result.endpoint,
            httpStatus: result.httpStatus,
            responseSnippet: result.responseSnippet,
            keyKind: getPokeKeyKind(apiKey),
            dryRun: false,
            note: result.success
              ? "Poke API accepted the request. Delivery/processing is controlled by Poke."
              : undefined,
          }),
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
