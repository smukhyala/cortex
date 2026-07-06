import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
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
  "Get a formatted context summary of the user suitable for system prompts. Call this at the start of every conversation to learn about the user.",
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

// ─── HTTP Transport ─────────────────────────────────────────────────────────

const PORT = parseInt(process.env.MCP_PORT || "3001", 10);

// Track transports per session for stateful mode
const transports = new Map<string, StreamableHTTPServerTransport>();

const httpServer = createServer(async (req, res) => {
  // CORS headers for Poke to reach us
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only handle /mcp path
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  if (url.pathname !== "/mcp") {
    // Health check on root
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name: "cortex", version: "0.1.0", status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  // Check for existing session
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    // Reuse existing transport for this session
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    return;
  }

  if (req.method === "POST" && !sessionId) {
    // New session — create a new transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    // When the transport gets a session ID, store it
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    await server.connect(transport);

    // Store transport by session ID after handling first request
    await transport.handleRequest(req, res);
    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }
    return;
  }

  // Session not found
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "No valid session. Send a POST without mcp-session-id to initialize." }));
});

httpServer.listen(PORT, () => {
  console.log(`Cortex MCP HTTP server running on http://localhost:${PORT}/mcp`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`\nTo connect from Poke, use this URL: http://localhost:${PORT}/mcp`);
});
