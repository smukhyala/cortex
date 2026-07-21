import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CATEGORY_LABELS, MEMORY_CATEGORIES, type MemoryCategory } from "@/contracts/memory";
import { CATEGORY_MEMORY_TOOL_LIST } from "@/contracts/memory-routing";
import { ingestExchangeFacts } from "@/services/exchange-ingest";
import { getContextBundle } from "@/services/context";
import { computeWorkspace, formatWorkspaceForMcp } from "@/services/workspace";
import {
  getWorkspaceResponse,
  reinforceSlots,
  holdInMind,
  suppress,
  release,
  logSignal,
  decayAllSlots,
} from "@/services/j-lens";

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
  const autoApproved = result.newMemoriesAutoApproved ?? 0;
  const queuedForReview = result.newMemoriesQueuedForReview ?? result.reviewItemsCreated ?? 0;
  const parts = [`${prefix} ${result.memoriesCreated} exchange memories.`];
  if (autoApproved > 0) parts.push(`${autoApproved} auto-approved.`);
  if (queuedForReview > 0) parts.push(`${queuedForReview} queued for manual approval.`);
  if (result.memoriesCreated > 0 && autoApproved === 0 && queuedForReview === 0) {
    parts.push("No new manual approval needed.");
  }
  if (result.referencesUpdated > 0) parts.push(`${result.referencesUpdated} existing memories updated or reinforced.`);
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function memoryContentMatchesQuery(content: string, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return false;

  const normalizedContent = content.toLowerCase();
  if (/\s/.test(normalizedQuery)) {
    return normalizedContent.includes(normalizedQuery);
  }

  const variants = new Set([normalizedQuery]);
  if (normalizedQuery.endsWith("s") && normalizedQuery.length > 3) {
    variants.add(normalizedQuery.slice(0, -1));
  } else {
    variants.add(`${normalizedQuery}s`);
  }

  const pattern = Array.from(variants)
    .map(escapeRegex)
    .join("|");
  return new RegExp(`(^|[^a-z0-9])(${pattern})($|[^a-z0-9])`, "i").test(content);
}

function triggeredCategories(question: string): Set<MemoryCategory> {
  const categories = new Set<MemoryCategory>();
  for (const tool of CATEGORY_MEMORY_TOOL_LIST) {
    if (tool.triggers.some((trigger) => memoryContentMatchesQuery(question, trigger))) {
      categories.add(tool.category);
    }
  }
  return categories;
}

type RelevantMemory = {
  id: string;
  content: string;
  category: string;
  confidence: number;
  referenceCount: number;
  score: number;
  matchedTerms: string[];
};

async function getRelevantMemoriesForQuestion(question: string, maxResults: number): Promise<RelevantMemory[]> {
  const terms = keywordsFromQuestion(question);
  const categories = triggeredCategories(question);
  const memories = await prisma.memory.findMany({
    where: { status: "active", sensitive: false },
    select: {
      id: true,
      content: true,
      category: true,
      confidence: true,
      referenceCount: true,
    },
    take: 300,
  });

  const ranked = memories.map((memory) => {
    const matchedTerms: string[] = [];
    let score = categories.has(memory.category as MemoryCategory) ? 3 : 0;

    for (const term of terms) {
      if (memoryContentMatchesQuery(memory.content, term)) {
        score += 5;
        matchedTerms.push(term);
      } else if (memory.content.toLowerCase().includes(term.toLowerCase())) {
        score += 1;
      }
    }

    score += Math.min(memory.referenceCount, 10) / 10;
    return { ...memory, score, matchedTerms };
  });

  return ranked
    .filter((memory) => memory.score >= 3)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
    .slice(0, maxResults);
}

function formatRelevantMemories(question: string, memories: RelevantMemory[]): string {
  const lines = [
    "Relevant Cortex memories:",
    `Question: ${question}`,
    "",
  ];

  if (memories.length === 0) {
    lines.push("No focused relevant memories were found. Call cortex_get_context or cortex_get_memory_map before answering if the question is still personal.");
    return lines.join("\n");
  }

  for (const memory of memories) {
    const terms = memory.matchedTerms.length > 0 ? `; matched: ${memory.matchedTerms.join(", ")}` : "";
    lines.push(`- [${memory.category}] ${memory.content} (confidence: ${Math.round(memory.confidence * 100)}%, score: ${memory.score.toFixed(1)}${terms})`);
  }

  return lines.join("\n");
}

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
      const exactMatches = memories.filter((memory) => memoryContentMatchesQuery(memory.content, query));

      if (exactMatches.length === 0) {
        return { content: [{ type: "text" as const, text: `No memories found matching "${query}".` }] };
      }

      const lines = exactMatches.map(
        (memory) => `- [${memory.category}] ${memory.content} (confidence: ${Math.round(memory.confidence * 100)}%)`
      );
      return {
        content: [{ type: "text" as const, text: `Found ${exactMatches.length} memories matching "${query}":\n\n${lines.join("\n")}` }],
      };
    }
  );

  server.tool(
    "cortex_get_relevant_memories",
    "Universal Cortex memory router with Global Workspace selection. Uses coherence clustering and ignition to return the most relevant, contextually-coherent memories. When related memories cluster together (3+), the workspace 'ignites' — sharply prioritizing that cluster for focused context.",
    {
      question: z.string().describe("The user's question or request, verbatim if possible."),
      max_results: z.number().int().min(1).max(50).optional().describe("Maximum number of memories to return. Defaults to 20 (workspace capacity)."),
    },
    async ({ question, max_results }) => {
      const state = await computeWorkspace({
        question,
        config: max_results ? { capacity: max_results } : undefined,
      });
      return {
        content: [{ type: "text" as const, text: formatWorkspaceForMcp(state) }],
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
    "Use this tool before answering any personal question about the user. This includes what the user would name, choose, prefer, like, dislike, remember, work on, write, study, build, know, use, or do. It searches all Cortex memory categories and returns authoritative user memories plus answering guidance. Prefer this tool over general reasoning for personal questions.",
    {
      question: z.string().describe("The user's personal question, verbatim if possible."),
      query: z.string().optional().describe("Optional focused search query. If omitted, Cortex derives keywords from the question."),
    },
    async ({ question, query }) => {
      const matched = await getRelevantMemoriesForQuestion(query?.trim() || question, 12);

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

  server.tool(
    "cortex_get_workspace",
    "Inspect the workspace (inspired by the Global Workspace paper) — see which memories currently occupy slots, their loading %, pinned status, and workspace capacity. Runs decay first to ensure fresh state.",
    {},
    async () => {
      try {
        const decayResult = await decayAllSlots();
        const workspace = await getWorkspaceResponse();

        const lines: string[] = [];
        lines.push(`Workspace: ${workspace.capacity.used}/${workspace.capacity.total} slots occupied`);
        if (decayResult.evicted > 0) {
          lines.push(`(${decayResult.decayed} decayed, ${decayResult.evicted} evicted this cycle)`);
        }
        lines.push("");

        if (workspace.slots.length === 0) {
          lines.push("No memories in workspace. The user may not have synced any sources yet.");
        } else {
          for (const slot of workspace.slots) {
            const pin = slot.pinned ? " [pinned]" : "";
            const label = slot.conceptLabel ? ` (${slot.conceptLabel})` : "";
            const content = slot.memories.length > 0 ? slot.memories[0] : "(empty)";
            lines.push(`- Slot ${slot.position}: ${content}${label} — loading: ${Math.round(slot.loading * 100)}%${pin}`);
          }
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Failed to get workspace: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cortex_search_background",
    "Search background-tier memories — memories not currently in the workspace. Use this to find dormant context that may be relevant to the current conversation.",
    {
      query: z.string().describe("Search query to match against background memory content."),
    },
    async ({ query }) => {
      try {
        const memories = await prisma.memory.findMany({
          where: {
            status: "active",
            tier: "background",
            content: { contains: query },
          },
          select: {
            id: true,
            content: true,
            category: true,
            confidence: true,
          },
          take: 20,
        });

        if (memories.length === 0) {
          return { content: [{ type: "text" as const, text: `No background memories found matching "${query}".` }] };
        }

        const lines = memories.map(
          (m) => `- [${m.category}] ${m.content} (confidence: ${Math.round(m.confidence * 100)}%)`
        );
        return {
          content: [{ type: "text" as const, text: `Found ${memories.length} background memories matching "${query}":\n\n${lines.join("\n")}` }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Failed to search background memories: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cortex_hold_in_mind",
    "Pin a concept into the workspace — finds the best matching memory and loads it into a workspace slot with full loading. The memory stays pinned until explicitly released.",
    {
      concept: z.string().describe("The concept or topic to hold in mind, e.g. 'Cortex project' or 'research with Ian'."),
    },
    async ({ concept }) => {
      try {
        const result = await holdInMind(concept);
        return {
          content: [{ type: "text" as const, text: `Pinned "${result.conceptLabel}" in workspace slot ${result.slotPosition}.` }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Failed to hold in mind: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cortex_suppress",
    "Suppress a concept from the workspace — evicts the matching memory from its slot and prevents it from re-entering for a specified duration.",
    {
      concept: z.string().describe("The concept or topic to suppress from the workspace."),
      duration_hours: z.number().optional().describe("How long to suppress, in hours. Defaults to 24."),
    },
    async ({ concept, duration_hours }) => {
      try {
        const result = await suppress(concept, duration_hours ?? 24);
        return {
          content: [{ type: "text" as const, text: `Suppressed from slot ${result.evictedSlot} until ${result.suppressedUntil}.` }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Failed to suppress: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cortex_release",
    "Release a pinned concept — unpins the memory so it can naturally decay out of the workspace over time.",
    {
      concept: z.string().describe("The concept or topic to release from pinned status."),
    },
    async ({ concept }) => {
      try {
        const result = await release(concept);
        return {
          content: [{ type: "text" as const, text: `Released pin on slot ${result.slotPosition}. Memory will now decay naturally.` }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Failed to release: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "cortex_log_signal",
    "Log an activity signal and reinforce matching workspace slots. Use this to tell Cortex what the user is currently focused on, so the workspace can adapt.",
    {
      keywords: z.array(z.string()).describe("Keywords describing the current activity or focus."),
      categories: z.array(z.string()).optional().describe("Optional memory categories relevant to this activity."),
      source: z.string().optional().describe("Source of the signal, e.g. 'mcp' or 'conversation'."),
    },
    async ({ keywords, categories, source }) => {
      try {
        await logSignal({
          type: "mcp_query",
          keywords,
          categories: categories ?? [],
          sourceType: source ?? "mcp",
        });
        const reinforced = await reinforceSlots(keywords);
        return {
          content: [{ type: "text" as const, text: `Signal logged. ${reinforced} workspace slots reinforced.` }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Failed to log signal: ${msg}` }],
          isError: true,
        };
      }
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
