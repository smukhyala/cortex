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
    capacity: {
      used: occupiedSlots.length,
      total: 20,
    },
    lastUpdated: new Date().toISOString(),
  };
}
