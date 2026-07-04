import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const pokeKey = process.env.POKE_API_KEY;

  const [memoryCount, pendingCount, sourceCount, lastSync] = await Promise.all([
    prisma.memory.count({ where: { status: "active" } }),
    prisma.reviewItem.count({ where: { status: "pending" } }),
    prisma.source.count(),
    prisma.syncRun.findFirst({ orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
  ]);

  return NextResponse.json({
    connections: {
      anthropic: {
        connected: !!anthropicKey,
        label: "Anthropic",
        description: "Powers memory extraction pipeline",
      },
      poke: {
        connected: !!pokeKey,
        label: "Poke",
        description: "Sync memories to Poke AI",
      },
    },
    stats: {
      memories: memoryCount,
      pending: pendingCount,
      sources: sourceCount,
      lastSync: lastSync?.completedAt?.toISOString() ?? null,
    },
  });
}
