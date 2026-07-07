import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CATEGORY_LABELS, MEMORY_CATEGORIES, type MemoryCategory } from "@/contracts/memory";
import { ingestExchangeFacts } from "@/services/exchange-ingest";
import { getContextBundle } from "@/services/context";

type DefaultOrigin = "claude" | "poke";

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
  return "identity";
}

function summarizeExchangeResult(prefix: string, result: Awaited<ReturnType<typeof ingestExchangeFacts>>): string {
  const successCount = result.propagatedDestinations.filter((destination) => destination.success).length;
  const parts = [`${prefix} ${result.memoriesCreated} active exchange memories.`];
  if (result.referencesUpdated > 0) parts.push(`${result.referencesUpdated} existing memories reinforced.`);
  if (result.conflictsCreated > 0) parts.push(`${result.conflictsCreated} conflicts need review.`);
  parts.push(`Propagated to ${successCount}/${result.propagatedDestinations.length} destinations.`);
  return parts.join(" ");
}

export function createCortexMcpServer(options: { defaultOrigin: DefaultOrigin }) {
  const server = new McpServer({
    name: "cortex",
    version: "0.1.0",
  });

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
      if (category && category !== "all") where.category = category;

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
          content: [{ type: "text" as const, text: "No active memories found. The user may not have synced any sources yet." }],
        };
      }

      const grouped = new Map<string, string[]>();
      for (const mem of memories) {
        const items = grouped.get(mem.category) || [];
        items.push(mem.content);
        grouped.set(mem.category, items);
      }

      const lines = [`Found ${memories.length} memories:\n`];
      for (const [cat, items] of grouped) {
        const label = CATEGORY_LABELS[cat as MemoryCategory] || cat;
        lines.push(`## ${label}`);
        for (const item of items) lines.push(`- ${item}`);
        lines.push("");
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  server.tool(
    "cortex_get_context",
    "Get a formatted, latest Cortex context summary suitable for system prompts. Call this automatically at the start of a conversation, and before answering any personalized question about the user's profile, preferences, projects, goals, relationships, writing style, workflows, or memory.",
    {},
    async () => {
      const bundle = await getContextBundle({
        destination: options.defaultOrigin === "poke" ? "poke" : "claude_desktop",
      });
      return { content: [{ type: "text" as const, text: bundle.prompt }] };
    }
  );

  server.tool(
    "cortex_search_memories",
    "Search the user's authoritative Cortex memories. Call this automatically when the user asks about themselves or their saved facts, for example: favorite color, preferences, likes, dislikes, background, projects, goals, people, writing style, tools, setup, or what you should remember about them.",
    {
      query: z.string().describe("Search query — matches against memory content"),
    },
    async ({ query }) => {
      const memories = await prisma.memory.findMany({
        where: { status: "active", content: { contains: query } },
        select: { content: true, category: true, confidence: true },
      });

      if (memories.length === 0) {
        return { content: [{ type: "text" as const, text: `No memories found matching "${query}".` }] };
      }

      const lines = memories.map(
        (memory) => `- [${memory.category}] ${memory.content} (confidence: ${Math.round(memory.confidence * 100)}%)`
      );
      return {
        content: [{ type: "text" as const, text: `Found ${memories.length} memories matching "${query}":\n\n${lines.join("\n")}` }],
      };
    }
  );

  server.tool(
    "cortex_save_conversation",
    "Save and exchange memories from the current conversation. Call this when you learn durable facts about the user; Cortex stores them as active memories and propagates them to the user's other AI tools.",
    {
      summary: z.string().describe("A brief summary of what was discussed in this conversation"),
      key_facts: z.array(z.string()).describe("Key durable facts about the user learned in this conversation. Each should be an atomic fact."),
      topic: z.string().describe("The main topic/category of the conversation"),
      origin: z.enum(["claude", "poke"]).optional().describe(`Which assistant learned these facts. Defaults to '${options.defaultOrigin}'.`),
    },
    async ({ summary, key_facts, topic, origin }) => {
      if (key_facts.length === 0) {
        return { content: [{ type: "text" as const, text: "No facts provided. Nothing to save." }] };
      }

      try {
        const category = inferCategory(topic);
        const result = await ingestExchangeFacts({
          origin: origin ?? options.defaultOrigin,
          summary,
          topic,
          facts: key_facts.map((fact) => ({ content: fact, category })),
        });
        return { content: [{ type: "text" as const, text: summarizeExchangeResult("Saved", result) }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Failed to save conversation: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cortex_log_context",
    "Log and exchange user facts learned during conversation. Cortex stores each fact as active memory and propagates it to the user's other AI tools.",
    {
      facts: z.array(
        z.object({
          content: z.string().describe("The fact about the user, e.g. 'User is based in San Francisco'"),
          category: z.enum(MEMORY_CATEGORIES).optional().describe("Memory category. If omitted, defaults to 'identity'."),
        })
      ).describe("Array of user facts to save"),
      origin: z.enum(["claude", "poke"]).optional().describe(`Which assistant learned these facts. Defaults to '${options.defaultOrigin}'.`),
    },
    async ({ facts, origin }) => {
      if (facts.length === 0) {
        return { content: [{ type: "text" as const, text: "No facts provided. Nothing to log." }] };
      }

      try {
        const result = await ingestExchangeFacts({
          origin: origin ?? options.defaultOrigin,
          facts: facts.map((fact) => ({ content: fact.content, category: fact.category })),
        });
        return { content: [{ type: "text" as const, text: summarizeExchangeResult("Logged", result) }] };
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
