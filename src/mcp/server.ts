import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { CATEGORY_LABELS, MEMORY_CATEGORIES, type MemoryCategory } from "@/contracts/memory";
import type { ExtractedMemory } from "@/contracts/pipeline";
import { deduplicateMemories } from "@/pipeline/deduplicate";
import { commit } from "@/pipeline/commit";

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

/** Get or create a persistent "claude_desktop" source for MCP-ingested memories */
async function getOrCreateMcpSource(): Promise<string> {
  const existing = await prisma.source.findFirst({
    where: { type: "claude_desktop", name: "Claude Desktop (MCP)" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const source = await prisma.source.create({
    data: {
      type: "claude_desktop",
      name: "Claude Desktop (MCP)",
      status: "active",
      config: JSON.stringify({ transport: "mcp_stdio" }),
    },
  });
  return source.id;
}

// ─── Tool: cortex_save_conversation ─────────────────────────────────────────

server.tool(
  "cortex_save_conversation",
  "Save memories from the current conversation. Call this when you learn durable facts about the user (preferences, goals, projects, background, etc). Each key_fact becomes a candidate memory that goes through deduplication.",
  {
    summary: z.string().describe("A brief summary of what was discussed in this conversation"),
    key_facts: z.array(z.string()).describe(
      "Key durable facts about the user learned in this conversation. Each should be an atomic fact (one idea per string). Example: 'User prefers TypeScript over JavaScript'"
    ),
    topic: z.string().describe(
      "The main topic/category of the conversation (e.g., 'projects', 'preferences', 'career', 'goals', 'identity', 'workflows')"
    ),
  },
  async ({ summary, key_facts, topic }) => {
    if (key_facts.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No facts provided. Nothing to save." }],
      };
    }

    try {
      const sourceId = await getOrCreateMcpSource();
      const category = inferCategory(topic);

      // Build ExtractedMemory objects from the key facts
      const extractedMemories: ExtractedMemory[] = key_facts.map((fact) => ({
        content: fact,
        subject: "user",
        category,
        confidence: 0.85,
        verbatimQuote: fact,
        temporality: "durable" as const,
        sensitive: false,
        isCorrection: false,
      }));

      // Run through deduplication pipeline
      let clean = extractedMemories;
      let duplicatesDropped = 0;
      let conflicts: Awaited<ReturnType<typeof deduplicateMemories>>["output"]["conflicts"] = [];

      try {
        const dedupResult = await deduplicateMemories(extractedMemories);
        clean = dedupResult.output.clean;
        conflicts = dedupResult.output.conflicts;
        duplicatesDropped = dedupResult.output.duplicatesDropped;
      } catch (dedupError) {
        // If dedup fails (e.g., no API key), skip it and commit all as pending
        console.error("Dedup failed, committing all as pending:", dedupError);
      }

      // Commit clean memories and handle conflicts
      const commitResult = await commit({
        sourceId,
        clean,
        conflicts,
        conversationMap: new Map(),
      });

      // Log activity
      await prisma.activityLog.create({
        data: {
          action: "mcp_save_conversation",
          summary: `Claude Desktop saved ${key_facts.length} facts from conversation about "${topic}"`,
          details: JSON.stringify({
            summary,
            topic,
            factsReceived: key_facts.length,
            memoriesCreated: commitResult.memoriesCreated,
            duplicatesDropped,
            conflictsFound: commitResult.conflictsCreated,
            autoApproved: commitResult.autoApproved,
            autoSuperseded: commitResult.autoSuperseded,
          }),
        },
      });

      const parts: string[] = [
        `Saved ${commitResult.memoriesCreated} new memories (pending review).`,
      ];
      if (duplicatesDropped > 0) parts.push(`${duplicatesDropped} duplicates skipped.`);
      if (commitResult.autoApproved > 0) parts.push(`${commitResult.autoApproved} auto-merged as refinements.`);
      if (commitResult.autoSuperseded > 0) parts.push(`${commitResult.autoSuperseded} auto-superseded.`);
      if (commitResult.conflictsCreated > 0) parts.push(`${commitResult.conflictsCreated} conflicts need review.`);

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
  "Log user facts learned during conversation — a lightweight way to push context to Cortex without needing a full summary. Each fact is saved as a pending memory.",
  {
    facts: z.array(
      z.object({
        content: z.string().describe("The fact about the user, e.g. 'User is based in San Francisco'"),
        category: z.enum(MEMORY_CATEGORIES).optional().describe(
          "Memory category. If omitted, defaults to 'identity'."
        ),
      })
    ).describe("Array of user facts to save"),
  },
  async ({ facts }) => {
    if (facts.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No facts provided. Nothing to log." }],
      };
    }

    try {
      const sourceId = await getOrCreateMcpSource();

      // Build ExtractedMemory objects
      const extractedMemories: ExtractedMemory[] = facts.map((f) => ({
        content: f.content,
        subject: "user",
        category: f.category || "identity",
        confidence: 0.8,
        verbatimQuote: f.content,
        temporality: "durable" as const,
        sensitive: false,
        isCorrection: false,
      }));

      // Run through deduplication
      let clean = extractedMemories;
      let duplicatesDropped = 0;
      let conflicts: Awaited<ReturnType<typeof deduplicateMemories>>["output"]["conflicts"] = [];

      try {
        const dedupResult = await deduplicateMemories(extractedMemories);
        clean = dedupResult.output.clean;
        conflicts = dedupResult.output.conflicts;
        duplicatesDropped = dedupResult.output.duplicatesDropped;
      } catch (dedupError) {
        console.error("Dedup failed, committing all as pending:", dedupError);
      }

      // Commit
      const commitResult = await commit({
        sourceId,
        clean,
        conflicts,
        conversationMap: new Map(),
      });

      // Log activity
      await prisma.activityLog.create({
        data: {
          action: "mcp_log_context",
          summary: `Claude Desktop logged ${facts.length} user facts`,
          details: JSON.stringify({
            factsReceived: facts.length,
            memoriesCreated: commitResult.memoriesCreated,
            duplicatesDropped,
            autoApproved: commitResult.autoApproved,
            autoSuperseded: commitResult.autoSuperseded,
          }),
        },
      });

      const parts: string[] = [
        `Logged ${commitResult.memoriesCreated} facts as pending memories.`,
      ];
      if (duplicatesDropped > 0) parts.push(`${duplicatesDropped} duplicates skipped.`);
      if (commitResult.autoApproved > 0) parts.push(`${commitResult.autoApproved} refinements auto-merged.`);
      if (commitResult.autoSuperseded > 0) parts.push(`${commitResult.autoSuperseded} superseded.`);

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
