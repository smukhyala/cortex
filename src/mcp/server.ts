import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { CATEGORY_LABELS, MEMORY_CATEGORIES, type MemoryCategory } from "@/contracts/memory";

// ─── Database ───────────────────────────────────────────────────────────────

const dbPath = path.resolve(process.cwd(), "data/cortex.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "cortex",
  version: "0.1.0",
});

// ─── Tool: getMemories ──────────────────────────────────────────────────────

server.tool(
  "cortex_get_memories",
  "Get all active memories from the user's canonical profile, optionally filtered by category",
  {
    category: z.enum([...MEMORY_CATEGORIES, "all" as const]).optional().describe(
      "Filter by category. Omit or pass 'all' for all categories."
    ),
  },
  async ({ category }) => {
    const where: Record<string, unknown> = { status: "active" };
    if (category && category !== "all") {
      where.category = category;
    }

    const memories = await prisma.memory.findMany({
      where,
      orderBy: { category: "asc" },
      select: {
        content: true,
        category: true,
        subject: true,
        confidence: true,
        temporality: true,
      },
    });

    if (memories.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No active memories found. The user may not have synced any sources yet.",
          },
        ],
      };
    }

    // Group by category for readability
    const grouped = new Map<string, string[]>();
    for (const mem of memories) {
      const items = grouped.get(mem.category) || [];
      items.push(mem.content);
      grouped.set(mem.category, items);
    }

    const lines: string[] = [`Found ${memories.length} memories:\n`];
    for (const [cat, items] of grouped) {
      const label = CATEGORY_LABELS[cat as MemoryCategory] || cat;
      lines.push(`## ${label}`);
      for (const item of items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  }
);

// ─── Tool: getContext ───────────────────────────────────────────────────────

server.tool(
  "cortex_get_context",
  "Get a formatted context summary of the user suitable for system prompts",
  {},
  async () => {
    const memories = await prisma.memory.findMany({
      where: { status: "active", sensitive: false },
      orderBy: { category: "asc" },
      select: { content: true, category: true },
    });

    if (memories.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No context available yet. The user hasn't synced any memory sources.",
          },
        ],
      };
    }

    const grouped = new Map<string, string[]>();
    for (const mem of memories) {
      const items = grouped.get(mem.category) || [];
      items.push(mem.content);
      grouped.set(mem.category, items);
    }

    const lines: string[] = ["Here is what I know about this user:\n"];
    for (const [cat, items] of grouped) {
      const label = CATEGORY_LABELS[cat as MemoryCategory] || cat;
      lines.push(`${label}:`);
      for (const item of items) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  }
);

// ─── Tool: searchMemories ───────────────────────────────────────────────────

server.tool(
  "cortex_search_memories",
  "Search across the user's memories by keyword",
  {
    query: z.string().describe("Search query — matches against memory content"),
  },
  async ({ query }) => {
    const memories = await prisma.memory.findMany({
      where: {
        status: "active",
        content: { contains: query },
      },
      select: {
        content: true,
        category: true,
        confidence: true,
      },
    });

    if (memories.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No memories found matching "${query}".`,
          },
        ],
      };
    }

    const lines = memories.map(
      (m) => `- [${m.category}] ${m.content} (confidence: ${Math.round(m.confidence * 100)}%)`
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `Found ${memories.length} memories matching "${query}":\n\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

// ─── Start Server ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cortex MCP server running on stdio");
}

main().catch((error) => {
  console.error("MCP server error:", error);
  process.exit(1);
});
