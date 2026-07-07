import { NextRequest, NextResponse } from "next/server";
import { ExchangeIngestInputSchema } from "@/contracts/exchange";
import { ingestExchangeFacts } from "@/services/exchange-ingest";

export async function POST(req: NextRequest) {
  const parsed = ExchangeIngestInputSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid exchange ingest payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await ingestExchangeFacts(parsed.data);
  return NextResponse.json(result, { status: 201 });
}
