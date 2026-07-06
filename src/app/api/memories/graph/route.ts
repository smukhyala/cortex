import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ─── Graph data model ────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  category: string;
  fullContent: string;
  confidence: number;
  isCluster: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  strength: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateLabel(content: string, max: number = 60): string {
  if (content.length <= max) return content;
  return content.slice(0, max - 3) + "...";
}

const MAX_GRAPH_MEMORIES = 150;

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET() {
  // Fetch enough active memories for a useful graph without blocking the UI.
  const memories = await prisma.memory.findMany({
    where: { status: "active" },
    select: {
      id: true,
      content: true,
      category: true,
      confidence: true,
    },
    orderBy: { createdAt: "desc" },
    take: MAX_GRAPH_MEMORIES,
  });

  if (memories.length === 0) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  // 2. Build category cluster nodes
  const categorySet = new Set(memories.map((m) => m.category));
  const clusterNodes: GraphNode[] = Array.from(categorySet).map((cat) => ({
    id: `cluster:${cat}`,
    label: cat.replace("_", " "),
    category: cat,
    fullContent: `Category: ${cat.replace("_", " ")}`,
    confidence: 1,
    isCluster: true,
  }));

  // 3. Build memory nodes
  const memoryNodes: GraphNode[] = memories.map((m) => ({
    id: m.id,
    label: truncateLabel(m.content),
    category: m.category,
    fullContent: m.content,
    confidence: m.confidence,
    isCluster: false,
  }));

  // 4. Connect each memory to its category cluster
  const clusterEdges: GraphEdge[] = memories.map((m) => ({
    source: m.id,
    target: `cluster:${m.category}`,
    relationship: "part_of",
    strength: 0.3,
  }));

  const nodes = [...clusterNodes, ...memoryNodes];

  return NextResponse.json({ nodes, edges: clusterEdges });
}
