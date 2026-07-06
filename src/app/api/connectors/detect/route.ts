import { NextResponse } from "next/server";
import { detectIntegrations } from "@/integrations/connectors/auto-detect";

// GET /api/connectors/detect — Auto-detect integrations from local AI tool configs
//
// Scans Claude Code, Claude Desktop, and other AI tool configurations to find
// services that are already connected via MCP. Returns detected integrations
// with metadata about where they were found and whether Cortex has a matching
// connector to leverage them.
//
// This endpoint reads local config files only — no network calls, no auth.

export async function GET() {
  try {
    const result = await detectIntegrations();

    return NextResponse.json({
      integrations: result.integrations.map((i) => ({
        id: i.id,
        name: i.name,
        serviceType: i.serviceType,
        detectedVia: i.detectedVia,
        detectedViaLabel: i.detectedViaLabel,
        configPath: i.configPath,
        mcpServerName: i.mcpServerName,
        transport: i.transport,
        hasConnector: i.hasConnector,
      })),
      scannedPaths: result.scannedPaths,
      errors: result.errors,
      summary: {
        total: result.integrations.length,
        withConnector: result.integrations.filter((i) => i.hasConnector).length,
        bySource: groupBy(result.integrations, (i) => i.detectedVia),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to detect integrations",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

function groupBy<T>(
  items: T[],
  key: (item: T) => string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}
