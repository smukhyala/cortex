import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCategories } from "@/lib/categories";
import { ExchangeDestinationSchema, ExchangePolicySchema } from "@/contracts/exchange";
import {
  deriveExchangePolicyFromText,
  getExchangePolicy,
  withExchangePolicyConfig,
} from "@/services/exchange-policy";

const CONFIGURABLE_DESTINATIONS = new Set(["claude_code", "poke"]);

function destinationForSource(type: string) {
  if (type === "poke") return "poke";
  if (type === "claude_code") return "claude_code";
  return null;
}

export async function GET() {
  const [sources, categories] = await Promise.all([
    prisma.source.findMany({
      where: { type: { in: Array.from(CONFIGURABLE_DESTINATIONS) }, status: "active" },
      orderBy: { name: "asc" },
    }),
    getCategories(),
  ]);

  const destinations = sources
    .map((source) => {
      const destination = destinationForSource(source.type);
      if (!destination) return null;
      return {
        sourceId: source.id,
        sourceName: source.name,
        sourceType: source.type,
        destination,
        policy: getExchangePolicy(source.config, destination),
      };
    })
    .filter((item) => item !== null);

  return NextResponse.json({ categories, destinations });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const sourceId = typeof body.sourceId === "string" ? body.sourceId : "";
  const destination = ExchangeDestinationSchema.safeParse(body.destination);

  if (!sourceId || !destination.success) {
    return NextResponse.json(
      { error: "sourceId and valid destination are required" },
      { status: 400 }
    );
  }

  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  const sourceDestination = destinationForSource(source.type);
  if (sourceDestination !== destination.data) {
    return NextResponse.json(
      { error: `Source "${source.name}" cannot be configured for ${destination.data}` },
      { status: 400 }
    );
  }

  const previous = getExchangePolicy(source.config, destination.data);
  let policy;

  if (typeof body.naturalLanguageRule === "string" && body.naturalLanguageRule.trim()) {
    const categories = await getCategories();
    policy = deriveExchangePolicyFromText({
      destination: destination.data,
      instruction: body.naturalLanguageRule,
      categories,
      previous,
    });
  } else {
    policy = ExchangePolicySchema.parse({
      destination: destination.data,
      mode: body.mode ?? "all",
      allowedCategories: Array.isArray(body.allowedCategories) ? body.allowedCategories : [],
      blockedCategories: Array.isArray(body.blockedCategories) ? body.blockedCategories : [],
      naturalLanguageRule: body.naturalLanguageRule || previous.naturalLanguageRule,
    });
  }

  const updated = await prisma.source.update({
    where: { id: sourceId },
    data: { config: withExchangePolicyConfig(source.config, policy) },
  });

  return NextResponse.json({
    sourceId: updated.id,
    destination: destination.data,
    policy: getExchangePolicy(updated.config, destination.data),
  });
}
