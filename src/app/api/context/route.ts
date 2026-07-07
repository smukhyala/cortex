import { NextRequest, NextResponse } from "next/server";
import { ContextDestinationSchema } from "@/contracts/context";
import { getContextBundle } from "@/services/context";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const destinationParam = searchParams.get("destination");
  const destination = destinationParam
    ? ContextDestinationSchema.parse(destinationParam)
    : undefined;
  const sourceId = searchParams.get("sourceId") ?? undefined;
  const includeSensitive = searchParams.get("includeSensitive") === "true";
  const maxItemsParam = searchParams.get("maxItems");
  const maxItems = maxItemsParam ? Number(maxItemsParam) : undefined;
  const format = searchParams.get("format") ?? "json";

  const bundle = await getContextBundle({
    destination,
    sourceId,
    includeSensitive,
    maxItems: Number.isFinite(maxItems) ? maxItems : undefined,
  });

  if (format === "markdown") {
    return new NextResponse(bundle.markdown, {
      headers: { "Content-Type": "text/markdown" },
    });
  }

  if (format === "prompt") {
    return new NextResponse(bundle.prompt, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json(bundle);
}
