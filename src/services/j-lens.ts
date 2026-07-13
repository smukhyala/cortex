import { prisma } from "@/lib/db";
import {
  ActivitySignalInput,
  DEFAULT_JLENS_CONFIG,
  WorkspaceResponse,
} from "@/contracts/workspace";

// ─── Stop Words ────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "its", "was", "are", "be",
  "has", "had", "have", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "this", "that", "these", "those",
  "not", "no", "nor", "so", "if", "then", "than", "too", "very",
  "just", "about", "into", "over", "after", "before", "between",
  "under", "above", "all", "each", "every", "both", "few", "more",
  "most", "other", "some", "such", "only", "own", "same", "also",
  "how", "what", "which", "who", "whom", "when", "where", "why",
  "been", "being", "here", "there", "they", "them", "their", "our",
  "your", "his", "her", "she", "him", "you", "we", "me", "my",
]);

// ─── Helpers (internal) ────────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 3);
  return [...new Set(words.filter((w) => !STOP_WORDS.has(w)))];
}

function contentMatchesKeywords(content: string, keywords: string[]): boolean {
  const lower = content.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

// ─── decayAllSlots ─────────────────────────────────────────────────────────

export async function decayAllSlots(): Promise<{ decayed: number; evicted: number }> {
  const slots = await prisma.workspaceSlot.findMany({
    where: {
      memoryId: { not: null },
      pinned: false,
    },
    include: {
      memory: { select: { id: true, content: true, category: true } },
    },
  });

  let decayed = 0;
  let evicted = 0;
  const now = Date.now();

  for (const slot of slots) {
    const minutesSinceActivation = (now - new Date(slot.activatedAt).getTime()) / (1000 * 60);
    const newLoading = slot.loading * Math.exp(-slot.decayRate * minutesSinceActivation);

    if (newLoading < DEFAULT_JLENS_CONFIG.evictionThreshold) {
      // Evict: clear slot and reset memory tier
      await prisma.workspaceSlot.update({
        where: { id: slot.id },
        data: {
          memoryId: null,
          loading: 0,
          conceptLabel: null,
          pinned: false,
          sourceSignal: "automatic",
        },
      });
      if (slot.memoryId) {
        await prisma.memory.update({
          where: { id: slot.memoryId },
          data: { tier: "background" },
        });
      }
      evicted++;
    } else {
      await prisma.workspaceSlot.update({
        where: { id: slot.id },
        data: { loading: newLoading },
      });
      decayed++;
    }
  }

  return { decayed, evicted };
}

// ─── reinforceSlots ────────────────────────────────────────────────────────

export async function reinforceSlots(keywords: string[]): Promise<number> {
  const slots = await prisma.workspaceSlot.findMany({
    where: { memoryId: { not: null } },
    include: {
      memory: { select: { id: true, content: true, category: true } },
    },
  });

  let boosted = 0;

  for (const slot of slots) {
    const memContent = slot.memory?.content ?? "";
    const label = slot.conceptLabel ?? "";

    if (contentMatchesKeywords(memContent, keywords) || contentMatchesKeywords(label, keywords)) {
      const newLoading = Math.min(1.0, slot.loading + 0.2);
      await prisma.workspaceSlot.update({
        where: { id: slot.id },
        data: {
          loading: newLoading,
          activatedAt: new Date(),
          sourceSignal: "reinforced",
        },
      });
      boosted++;
    }
  }

  return boosted;
}

// ─── holdInMind ────────────────────────────────────────────────────────────

export async function holdInMind(
  concept: string
): Promise<{ slotPosition: number; conceptLabel: string }> {
  const keywords = extractKeywords(concept);

  // Find matching memories
  const memories = await prisma.memory.findMany({
    where: { status: "active" },
  });

  const matching = memories.filter((m) => contentMatchesKeywords(m.content, keywords));

  if (matching.length === 0) {
    throw new Error(`No memories match concept: "${concept}"`);
  }

  // Pick the best matching memory (highest confidence)
  const bestMemory = matching.sort(
    (a, b) => (b.confidence as number) - (a.confidence as number)
  )[0];

  // Find an empty slot first
  let slot = await prisma.workspaceSlot.findFirst({
    where: { memoryId: null },
    orderBy: { position: "asc" },
  });

  // If no empty slot, find lowest-loading non-pinned slot to evict
  if (!slot) {
    slot = await prisma.workspaceSlot.findFirst({
      where: { pinned: false },
      orderBy: { loading: "asc" },
    });

    if (!slot) {
      throw new Error("All workspace slots are pinned — cannot load new memory");
    }

    // Evict the current occupant
    if (slot.memoryId) {
      await prisma.memory.update({
        where: { id: slot.memoryId },
        data: { tier: "background" },
      });
    }
  }

  const conceptLabel = keywords.slice(0, 3).join(" ") || concept.slice(0, 50);

  await prisma.workspaceSlot.update({
    where: { id: slot.id },
    data: {
      memoryId: bestMemory.id,
      loading: 1.0,
      pinned: true,
      sourceSignal: "explicit",
      conceptLabel,
      activatedAt: new Date(),
      loadedAt: new Date(),
    },
  });

  await prisma.memory.update({
    where: { id: bestMemory.id },
    data: { tier: "workspace" },
  });

  return { slotPosition: slot.position, conceptLabel };
}

// ─── suppress ──────────────────────────────────────────────────────────────

export async function suppress(
  concept: string,
  durationHours: number = 24
): Promise<{ evictedSlot: number; suppressedUntil: string }> {
  const keywords = extractKeywords(concept);

  const slots = await prisma.workspaceSlot.findMany({
    where: { memoryId: { not: null } },
    include: {
      memory: { select: { id: true, content: true, category: true } },
    },
  });

  // Find slot matching concept
  const matchingSlot = slots.find((s) => {
    const label = s.conceptLabel ?? "";
    const content = s.memory?.content ?? "";
    return contentMatchesKeywords(label, keywords) || contentMatchesKeywords(content, keywords);
  });

  if (!matchingSlot) {
    throw new Error(`No workspace slot matches concept: "${concept}"`);
  }

  const suppressedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  // Clear the slot
  await prisma.workspaceSlot.update({
    where: { id: matchingSlot.id },
    data: {
      memoryId: null,
      loading: 0,
      conceptLabel: null,
      pinned: false,
      sourceSignal: "automatic",
    },
  });

  // Set memory tier and suppressedUntil
  if (matchingSlot.memoryId) {
    await prisma.memory.update({
      where: { id: matchingSlot.memoryId },
      data: {
        tier: "background",
        suppressedUntil,
      },
    });
  }

  return {
    evictedSlot: matchingSlot.position,
    suppressedUntil: suppressedUntil.toISOString(),
  };
}

// ─── release ───────────────────────────────────────────────────────────────

export async function release(
  concept: string
): Promise<{ slotPosition: number }> {
  const keywords = extractKeywords(concept);

  const slots = await prisma.workspaceSlot.findMany({
    where: {
      memoryId: { not: null },
      pinned: true,
    },
    include: {
      memory: { select: { id: true, content: true, category: true } },
    },
  });

  const matchingSlot = slots.find((s) => {
    const label = s.conceptLabel ?? "";
    const content = s.memory?.content ?? "";
    return contentMatchesKeywords(label, keywords) || contentMatchesKeywords(content, keywords);
  });

  if (!matchingSlot) {
    throw new Error(`No pinned workspace slot matches concept: "${concept}"`);
  }

  await prisma.workspaceSlot.update({
    where: { id: matchingSlot.id },
    data: {
      pinned: false,
      activatedAt: new Date(),
    },
  });

  return { slotPosition: matchingSlot.position };
}

// ─── logSignal ─────────────────────────────────────────────────────────────

export async function logSignal(input: ActivitySignalInput): Promise<string> {
  const record = await prisma.activitySignal.create({
    data: {
      type: input.type,
      keywords: JSON.stringify(input.keywords),
      categories: JSON.stringify(input.categories),
      sourceType: input.sourceType ?? "mcp",
      processed: false,
    },
  });

  return record.id;
}

// ─── scoreBatch ────────────────────────────────────────────────────────────

export async function scoreBatch(): Promise<{ loaded: number; evicted: number }> {
  const config = DEFAULT_JLENS_CONFIG;

  // 1. Consume unprocessed signals
  const signals = await prisma.activitySignal.findMany({
    where: { processed: false },
  });

  if (signals.length === 0) {
    return { loaded: 0, evicted: 0 };
  }

  // 2. Aggregate keywords and categories from signals
  const allKeywords: string[] = [];
  const allCategories: string[] = [];

  for (const signal of signals) {
    const kws = JSON.parse(signal.keywords as string) as string[];
    const cats = JSON.parse(signal.categories as string) as string[];
    allKeywords.push(...kws);
    allCategories.push(...cats);
  }

  const uniqueKeywords = [...new Set(allKeywords)];
  const uniqueCategories = [...new Set(allCategories)];

  // 3. Decay all existing slots
  const decayResult = await decayAllSlots();

  // 4. Score background memories against signals
  const now = Date.now();
  const backgroundMemories = await prisma.memory.findMany({
    where: {
      status: "active",
      tier: "background",
      OR: [
        { suppressedUntil: null },
        { suppressedUntil: { lt: new Date() } },
      ],
    },
  });

  const scored = backgroundMemories.map((mem) => {
    const memKeywords = extractKeywords(mem.content);

    // Keyword match score
    const keywordMatches = uniqueKeywords.filter((kw) =>
      memKeywords.some((mk) => mk.includes(kw) || kw.includes(mk))
    ).length;
    const keywordScore = uniqueKeywords.length > 0
      ? keywordMatches / uniqueKeywords.length
      : 0;

    // Category match score
    const categoryScore = uniqueCategories.includes(mem.category) ? 1.0 : 0;

    // Recency score (decay over 7 days)
    const daysSinceRef = (now - new Date(mem.lastReferencedAt).getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.exp(-daysSinceRef / 7);

    // Confidence score
    const confidenceScore = mem.confidence as number;

    const totalScore =
      config.keywordWeight * keywordScore +
      config.categoryWeight * categoryScore +
      config.recencyWeight * recencyScore +
      config.confidenceWeight * confidenceScore;

    return { memory: mem, totalScore };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);

  // 5. Find empty or weak slots to fill
  const allSlots = await prisma.workspaceSlot.findMany({
    orderBy: { position: "asc" },
  });

  const availableSlots = allSlots.filter(
    (s) => s.memoryId === null || (!s.pinned && s.loading < config.evictionThreshold)
  );

  let loaded = 0;

  for (const candidate of scored) {
    if (availableSlots.length === 0) break;
    if (candidate.totalScore <= 0) break;

    const slot = availableSlots.shift()!;

    // If slot had a memory, reset it
    if (slot.memoryId) {
      await prisma.memory.update({
        where: { id: slot.memoryId },
        data: { tier: "background" },
      });
    }

    const conceptLabel = extractKeywords(candidate.memory.content).slice(0, 3).join(" ");

    await prisma.workspaceSlot.update({
      where: { id: slot.id },
      data: {
        memoryId: candidate.memory.id,
        loading: Math.min(1.0, candidate.totalScore + 0.5),
        conceptLabel,
        sourceSignal: "automatic",
        activatedAt: new Date(),
        loadedAt: new Date(),
        pinned: false,
      },
    });

    await prisma.memory.update({
      where: { id: candidate.memory.id },
      data: { tier: "workspace" },
    });

    loaded++;
  }

  // 6. Mark signals as processed
  const signalIds = signals.map((s) => s.id);
  await prisma.activitySignal.updateMany({
    where: { id: { in: signalIds } },
    data: { processed: true },
  });

  return { loaded, evicted: decayResult.evicted };
}

// ─── coldStart ─────────────────────────────────────────────────────────────

export async function coldStart(): Promise<number> {
  // Find empty workspace slots
  const emptySlots = await prisma.workspaceSlot.findMany({
    where: { memoryId: null },
    orderBy: { position: "asc" },
  });

  if (emptySlots.length === 0) return 0;

  // Get top memories by confidence and recency
  const topMemories = await prisma.memory.findMany({
    where: {
      status: "active",
      tier: "background",
    },
    orderBy: [
      { confidence: "desc" },
      { lastReferencedAt: "desc" },
    ],
    take: 20,
  });

  let loaded = 0;

  for (let i = 0; i < Math.min(emptySlots.length, topMemories.length); i++) {
    const slot = emptySlots[i];
    const memory = topMemories[i];

    const conceptLabel = extractKeywords(memory.content).slice(0, 3).join(" ");

    await prisma.workspaceSlot.update({
      where: { id: slot.id },
      data: {
        memoryId: memory.id,
        loading: 0.5,
        conceptLabel,
        sourceSignal: "automatic",
        activatedAt: new Date(),
        loadedAt: new Date(),
      },
    });

    await prisma.memory.update({
      where: { id: memory.id },
      data: { tier: "workspace" },
    });

    loaded++;
  }

  return loaded;
}

// ─── getWorkspaceResponse ──────────────────────────────────────────────────

export async function getWorkspaceResponse(): Promise<WorkspaceResponse> {
  const slots = await prisma.workspaceSlot.findMany({
    include: {
      memory: { select: { id: true, content: true, category: true } },
    },
    orderBy: { position: "asc" },
  });

  const occupiedSlots = slots.filter((s) => s.memoryId !== null && s.memory !== null);

  return {
    slots: occupiedSlots.map((s) => ({
      position: s.position,
      memoryId: s.memoryId!,
      conceptLabel: s.conceptLabel,
      content: s.memory!.content,
      category: s.memory!.category,
      loading: s.loading,
      pinned: s.pinned,
      sourceSignal: s.sourceSignal as "automatic" | "explicit" | "reinforced",
      activatedAt: new Date(s.activatedAt).toISOString(),
      loadedAt: new Date(s.loadedAt).toISOString(),
    })),
    capacity: 20,
    occupied: occupiedSlots.length,
    lastUpdated: new Date().toISOString(),
  };
}
