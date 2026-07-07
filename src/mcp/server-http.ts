import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { z } from "zod";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { CATEGORY_LABELS, MEMORY_CATEGORIES, type MemoryCategory } from "@/contracts/memory";
import { ingestExchangeFacts } from "@/services/exchange-ingest";

// ─── Database ───────────────────────────────────────────────────────────────

const dbPath = path.resolve(process.cwd(), "data/cortex.db");
const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

// ─── MCP Server ─────────────────────────────────────────────────────────────

function createCortexMcpServer() {
  const server = new McpServer({
    name: "cortex",
    version: "0.1.0",
  });

// ─── Tool: getMemories ──────────────────────────────────────────────────────

server.tool(
  "cortex_get_memories",
  "Get all active memories from the user's canonical profile, optionally filtered by category. Use this whenever you need authoritative facts about the user's identity, preferences, projects, goals, relationships, writing style, workflows, or current context.",
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
  "Get a formatted context summary of the user suitable for system prompts. Call this automatically at the start of a conversation, and before answering any personalized question about the user's profile, preferences, projects, goals, relationships, writing style, workflows, or memory.",
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
  "Search the user's authoritative Cortex memories. Call this automatically when the user asks about themselves or their saved facts, for example: favorite color, preferences, likes, dislikes, background, projects, goals, people, writing style, tools, setup, or what you should remember about them.",
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

// ─── Helpers: Source + Category ──────────────────────────────────────────────

const TOPIC_TO_CATEGORY: Record<string, MemoryCategory> = {
  identity: "identity",
  personal: "identity",
  profile: "identity",
  background: "identity",
  education: "education_career",
  career: "education_career",
  work: "education_career",
  job: "education_career",
  school: "education_career",
  project: "projects",
  startup: "projects",
  building: "projects",
  app: "projects",
  research: "research",
  interest: "research",
  learning: "research",
  preference: "preferences",
  style: "preferences",
  like: "preferences",
  dislike: "preferences",
  opinion: "preferences",
  goal: "goals",
  plan: "goals",
  future: "goals",
  relationship: "relationships",
  contact: "relationships",
  people: "relationships",
  writing: "writing_voice",
  voice: "writing_voice",
  communication: "writing_voice",
  workflow: "workflows",
  tool: "workflows",
  setup: "workflows",
  dev: "workflows",
  temporary: "temporary",
  current: "temporary",
};

function inferCategory(topic: string): MemoryCategory {
  const lower = topic.toLowerCase();
  for (const [keyword, category] of Object.entries(TOPIC_TO_CATEGORY)) {
    if (lower.includes(keyword)) return category;
  }
  return "identity"; // safe default
}

// ─── Tool: cortex_save_conversation ─────────────────────────────────────────

server.tool(
  "cortex_save_conversation",
  "Save and exchange memories from the current conversation. Call this when you learn durable facts about the user; Cortex stores them as active memories and propagates them to the user's other AI tools.",
  {
    summary: z.string().describe("A brief summary of what was discussed in this conversation"),
    key_facts: z.array(z.string()).describe(
      "Key durable facts about the user learned in this conversation. Each should be an atomic fact (one idea per string). Example: 'User prefers TypeScript over JavaScript'"
    ),
    topic: z.string().describe(
      "The main topic/category of the conversation (e.g., 'projects', 'preferences', 'career', 'goals', 'identity', 'workflows')"
    ),
    origin: z.enum(["claude", "poke"]).optional().describe(
      "Which assistant learned these facts. Defaults to 'poke' for HTTP MCP."
    ),
  },
  async ({ summary, key_facts, topic, origin }) => {
    if (key_facts.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No facts provided. Nothing to save." }],
      };
    }

    try {
      const category = inferCategory(topic);
      const result = await ingestExchangeFacts({
        origin: origin ?? "poke",
        summary,
        topic,
        facts: key_facts.map((fact) => ({ content: fact, category })),
      });

      const successCount = result.propagatedDestinations.filter((destination) => destination.success).length;
      const parts: string[] = [`Saved ${result.memoriesCreated} active exchange memories.`];
      if (result.referencesUpdated > 0) parts.push(`${result.referencesUpdated} existing memories reinforced.`);
      if (result.conflictsCreated > 0) parts.push(`${result.conflictsCreated} conflicts need review.`);
      parts.push(`Propagated to ${successCount}/${result.propagatedDestinations.length} destinations.`);

      return {
        content: [{ type: "text" as const, text: parts.join(" ") }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to save conversation: ${msg}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: cortex_log_context ───────────────────────────────────────────────

server.tool(
  "cortex_log_context",
  "Log and exchange user facts learned during conversation. Cortex stores each fact as active memory and propagates it to the user's other AI tools.",
  {
    facts: z.array(
      z.object({
        content: z.string().describe("The fact about the user, e.g. 'User is based in San Francisco'"),
        category: z.enum(MEMORY_CATEGORIES).optional().describe(
          "Memory category. If omitted, defaults to 'identity'."
        ),
      })
    ).describe("Array of user facts to save"),
    origin: z.enum(["claude", "poke"]).optional().describe(
      "Which assistant learned these facts. Defaults to 'poke' for HTTP MCP."
    ),
  },
  async ({ facts, origin }) => {
    if (facts.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No facts provided. Nothing to log." }],
      };
    }

    try {
      const result = await ingestExchangeFacts({
        origin: origin ?? "poke",
        facts: facts.map((fact) => ({
          content: fact.content,
          category: fact.category,
        })),
      });

      const successCount = result.propagatedDestinations.filter((destination) => destination.success).length;
      const parts: string[] = [`Logged ${result.memoriesCreated} active exchange memories.`];
      if (result.referencesUpdated > 0) parts.push(`${result.referencesUpdated} existing memories reinforced.`);
      if (result.conflictsCreated > 0) parts.push(`${result.conflictsCreated} conflicts need review.`);
      parts.push(`Propagated to ${successCount}/${result.propagatedDestinations.length} destinations.`);

      return {
        content: [{ type: "text" as const, text: parts.join(" ") }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Failed to log context: ${msg}` }],
        isError: true,
      };
    }
  }
);

  return server;
}

// ─── HTTP Transport ─────────────────────────────────────────────────────────

const PORT = parseInt(process.env.MCP_PORT || "3001", 10);

// Track transports per session for stateful mode
const transports = new Map<string, StreamableHTTPServerTransport | SSEServerTransport>();

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return undefined;

  return JSON.parse(raw);
}

function logMcpBody(body: unknown) {
  const messages = Array.isArray(body) ? body : [body];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const record = message as { id?: unknown; method?: unknown };
    console.log(`[mcp-http] body id=${record.id ?? "-"} method=${record.method ?? "-"}`);
  }
}

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

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const isMcpPath = url.pathname === "/mcp" || url.pathname.endsWith("/mcp");
  const isSsePath = url.pathname === "/sse" || url.pathname.endsWith("/sse");
  const isMessagesPath = url.pathname === "/messages" || url.pathname.endsWith("/messages");
  console.log(
    `[mcp-http] ${req.method} ${url.pathname} session=${req.headers["mcp-session-id"] || url.searchParams.get("sessionId") || "-"} ua=${req.headers["user-agent"] || "-"}`
  );

  let parsedBody: unknown;
  if (req.method === "POST") {
    try {
      parsedBody = await readJsonBody(req);
      logMcpBody(parsedBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[mcp-http] failed to parse JSON body: ${message}`);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
  }

  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ name: "cortex", version: "0.1.0", status: "ok" }));
    return;
  }

  if ((isMcpPath || isSsePath) && req.method === "GET" && !req.headers["mcp-session-id"]) {
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);
    transport.onclose = () => transports.delete(transport.sessionId);

    const server = createCortexMcpServer();
    await server.connect(transport);
    return;
  }

  if (isMessagesPath && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    const transport = sessionId ? transports.get(sessionId) : undefined;

    if (!(transport instanceof SSEServerTransport)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Session not found");
      return;
    }

    await transport.handlePostMessage(req, res, parsedBody);
    return;
  }

  if (!isMcpPath) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  // Check for existing session
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    // Reuse existing transport for this session
    const transport = transports.get(sessionId)!;
    if (!(transport instanceof StreamableHTTPServerTransport)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Session exists but uses a different MCP transport." }));
      return;
    }
    await transport.handleRequest(req, res, parsedBody);
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

    const server = createCortexMcpServer();
    await server.connect(transport);

    // Store transport by session ID after handling first request
    await transport.handleRequest(req, res, parsedBody);
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
