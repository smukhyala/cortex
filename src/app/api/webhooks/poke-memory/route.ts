import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { PokeWebhookOrchestrator } from "@/pipeline/agents/poke-webhook-orchestrator";

function hasValidSecret(req: NextRequest): boolean {
  const expected = process.env.POKE_WEBHOOK_SECRET;
  if (!expected) return true;

  const headerSecret = req.headers.get("x-cortex-webhook-secret");
  const auth = req.headers.get("authorization");
  const bearerSecret = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length).trim()
    : null;

  return headerSecret === expected || bearerSecret === expected;
}

export async function POST(req: NextRequest) {
  if (!hasValidSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  try {
    const orchestrator = new PokeWebhookOrchestrator();
    const result = await orchestrator.run(payload);
    return NextResponse.json(result, { status: result.ingested ? 201 : 202 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid Poke webhook payload", issues: error.flatten() },
        { status: 400 }
      );
    }

    console.error("Failed to ingest Poke webhook:", error);
    return NextResponse.json(
      { error: "Failed to ingest Poke webhook" },
      { status: 500 }
    );
  }
}

