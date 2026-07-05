import { NextRequest, NextResponse } from "next/server";
import { runDedupScan, applyDedupResults } from "@/pipeline/agents/dedup-scan";

/**
 * GET /api/deduplicate — Scan for duplicates (preview, no changes)
 * POST /api/deduplicate — Apply dedup results (merge + archive)
 */
export async function GET() {
  try {
    const result = await runDedupScan();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Dedup scan failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { groups } = body;

    if (!groups || !Array.isArray(groups)) {
      return NextResponse.json({ error: "groups array required" }, { status: 400 });
    }

    const result = await applyDedupResults(groups);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Dedup apply failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
