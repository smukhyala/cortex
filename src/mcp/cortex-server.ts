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

function keywordsFromQuestion(question: string): string[] {
  const stopWords = new Set([
    "what", "would", "should", "could", "might", "will", "using", "cortex",
    "name", "named", "call", "called", "the", "a", "an", "my", "me", "i",
    "you", "your", "about", "from", "with", "for", "and", "or", "to", "do",
  ]);
  return Array.from(new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && !stopWords.has(word))
  )).slice(0, 8);
}

const CATEGORY_TOOL_CONFIGS: Array<{
  name: string;
  category: MemoryCategory;
  description: string;
}> = [
  {
    name: "cortex_get_identity_profile",
    category: "identity",
    description: "Get Cortex memories about the user's identity and profile: name, background, location, age, accounts, devices, general biographical facts. Use before answering who the user is or personal profile questions.",
  },
  {
    name: "cortex_get_education_career",
    category: "education_career",
    description: "Get Cortex memories about the user's education and career: school, courses, exams, jobs, founder work, labs, professional history. Use before answering questions about studies, work, credentials, or career context.",
  },
  {
    name: "cortex_get_projects_startups",
    category: "projects",
    description: "Get Cortex memories about the user's projects, startups, repositories, products, apps, experiments, and active builds. Use before answering what the user is building or project-specific questions.",
  },
  {
    name: "cortex_get_research_interests",
    category: "research",
    description: "Get Cortex memories about the user's research interests, papers, labs, collaborators, technical topics, and intellectual directions. Use before answering research or technical-interest questions.",
  },
  {
    name: "cortex_get_preferences_style",
    category: "preferences",
    description: "Get Cortex memories about the user's preferences and style: likes, dislikes, favorites, naming choices, aesthetics, coding preferences, learning preferences, UI taste, and what the user would choose. Use before any question about what the user likes, wants, would name, would pick, or prefers.",
  },
  {
    name: "cortex_get_goals_plans",
    category: "goals",
    description: "Get Cortex memories about the user's goals, plans, ambitions, next steps, future intentions, and desired outcomes. Use before planning or prioritization questions.",
  },
  {
    name: "cortex_get_relationships_contacts",
    category: "relationships",
    description: "Get Cortex memories about the user's relationships, collaborators, friends, contacts, pets, teams, and people they know. Use before answering questions involving people in the user's life or network.",
  },
  {
    name: "cortex_get_writing_voice",
    category: "writing_voice",
    description: "Get Cortex memories about the user's writing voice, communication style, creative prose, tone preferences, and content style. Use before drafting or editing in the user's voice.",
  },
  {
    name: "cortex_get_workflows_tools",
    category: "workflows",
    description: "Get Cortex memories about the user's workflows, tools, development setup, commands, editors, automation habits, and process preferences. Use before giving workflow, tooling, setup, or implementation advice.",
  },
  {
    name: "cortex_get_current_context",
    category: "temporary",
    description: "Get Cortex memories about temporary or current context: recent status, short-term facts, active constraints, and things that may expire. Use before answering current-context questions.",
  },
];

async function getCategoryMemories(category: MemoryCategory) {
  return prisma.memory.findMany({
    where: { status: "active", category, sensitive: false },
    orderBy: [{ referenceCount: "desc" }, { lastReferencedAt: "desc" }],
    select: {
      content: true,
      category: true,
      confidence: true,
      referenceCount: true,
      lastReferencedAt: true,
    },
  });
}

function formatCategoryMemories(category: MemoryCategory, memories: Awaited<ReturnType<typeof getCategoryMemories>>): string {
  const label = CATEGORY_LABELS[category];
  if (memories.length === 0) {
    return `No active non-sensitive Cortex memories found for ${label}.`;
  }

  const lines = [`${label} (${memories.length} Cortex memories):`, ""];
  for (const memory of memories) {
    lines.push(
      `- ${memory.content} (confidence: ${Math.round(memory.confidence * 100)}%, references: ${memory.referenceCount})`
    );
  }
  return lines.join("\n");
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
      query: z.string().describe("Search query - matches against memory content"),
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
    "cortex_get_memory_map",
    "Get a live map of what kinds of memories Cortex currently has about this user, grouped by category. Use this first when deciding which Cortex tool to call for a personal question, or when you are unsure whether Cortex has relevant context.",
    {},
    async () => {
      const memories = await prisma.memory.findMany({
        where: { status: "active", sensitive: false },
        select: { category: true },
      });
      const counts = new Map<string, number>();
      for (const memory of memories) {
        counts.set(memory.category, (counts.get(memory.category) ?? 0) + 1);
      }

      const lines = [
        "Cortex memory coverage for this user:",
        "",
        ...MEMORY_CATEGORIES.map((category) => {
          const label = CATEGORY_LABELS[category];
          const count = counts.get(category) ?? 0;
          return `- ${category}: ${label} - ${count} active memories`;
        }),
        "",
        "For personal questions, call the matching category tool or cortex_answer_personal_question before answering.",
      ];

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  server.tool(
    "cortex_answer_personal_question",
    "Use this tool before answering any personal question about the user. This includes what the user would name, choose, prefer, like, dislike, remember, work on, write, study, build, or do. It searches Cortex and returns authoritative user memories plus answering guidance. Prefer this tool over general reasoning for personal questions.",
    {
      question: z.string().describe("The user's personal question, verbatim if possible."),
      query: z.string().optional().describe("Optional focused search query. If omitted, Cortex derives keywords from the question."),
    },
    async ({ question, query }) => {
      const queries = query?.trim()
        ? [query.trim()]
        : keywordsFromQuestion(question);
      const seen = new Set<string>();
      const matched: Array<{ content: string; category: string; confidence: number }> = [];

      for (const item of queries) {
        const memories = await prisma.memory.findMany({
          where: { status: "active", content: { contains: item } },
          select: { id: true, content: true, category: true, confidence: true },
          take: 12,
        });
        for (const memory of memories) {
          if (seen.has(memory.id)) continue;
          seen.add(memory.id);
          matched.push(memory);
        }
      }

      const bundle = await getContextBundle({
        destination: options.defaultOrigin === "poke" ? "poke" : "claude_desktop",
        maxItems: 80,
      });

      const lines = [
        "Answer the user's question using Cortex as the authoritative memory source.",
        `Question: ${question}`,
        "",
      ];

      if (matched.length > 0) {
        lines.push("Direct Cortex matches:");
        for (const memory of matched) {
          lines.push(`- [${memory.category}] ${memory.content} (confidence: ${Math.round(memory.confidence * 100)}%)`);
        }
        lines.push("");
      } else {
        lines.push("No direct keyword matches were found. Use the broader Cortex context below if it contains relevant facts.");
        lines.push("");
      }

      lines.push("Broader Cortex context:");
      lines.push(bundle.markdown);

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    }
  );

  for (const config of CATEGORY_TOOL_CONFIGS) {
    server.tool(
      config.name,
      config.description,
      {},
      async () => {
        const memories = await getCategoryMemories(config.category);
        return {
          content: [{ type: "text" as const, text: formatCategoryMemories(config.category, memories) }],
        };
      }
    );
  }

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
