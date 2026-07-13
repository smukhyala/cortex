import { prisma } from "@/lib/db";
import { computeMemoryStrength } from "@/lib/memory-strength";
import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";
import { CATEGORY_MEMORY_TOOL_LIST } from "@/contracts/memory-routing";
import {
  DEFAULT_WORKSPACE_CONFIG,
  FOCUS_MODES,
  type FocusMode,
  type IgnitionCluster,
  type WorkspaceCandidate,
  type WorkspaceConfig,
  type WorkspaceState,
} from "@/contracts/workspace";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RawMemory {
  id: string;
  content: string;
  category: string;
  confidence: number;
  referenceCount: number;
  lastReferencedAt: Date;
  sensitive: boolean;
  manuallyStrong: boolean;
  pinned: boolean;
}

interface CoherenceCluster {
  id: string;
  label: string;
  members: Set<string>;
}

interface WorkspaceQuery {
  question?: string;
  focusModeId?: string;
  boostCategories?: MemoryCategory[];
  suppressCategories?: MemoryCategory[];
  config?: Partial<WorkspaceConfig>;
  includeCandidates?: boolean;
}

// ─── Stop words for keyword extraction ──────────────────────────────────────

const STOP_WORDS = new Set([
  "what", "would", "should", "could", "might", "will", "using",
  "name", "named", "call", "called", "the", "an", "my", "me",
  "you", "your", "about", "from", "with", "for", "and", "or", "to", "do",
  "is", "are", "was", "were", "be", "been", "has", "have", "had", "this",
  "that", "these", "those", "it", "its", "of", "in", "on", "at", "by",
  "as", "not", "no", "so", "if", "but", "just", "also", "very", "can",
  "how", "when", "where", "who", "which", "than", "then", "all", "any",
  "some", "such", "each", "every", "both", "few", "more", "most", "other",
  "into", "over", "after", "before", "between", "under", "again", "once",
  "here", "there", "why", "does", "did", "doing", "done",
]);

// ─── Keyword extraction ─────────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  return Array.from(new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  ));
}

// ─── Category trigger detection (reused from MCP logic) ─────────────────────

function triggeredCategories(question: string): Set<MemoryCategory> {
  const categories = new Set<MemoryCategory>();
  const lower = question.toLowerCase();
  for (const tool of CATEGORY_MEMORY_TOOL_LIST) {
    if (tool.triggers.some((trigger) => lower.includes(trigger))) {
      categories.add(tool.category);
    }
  }
  return categories;
}

// ─── Union-Find for cluster formation ───────────────────────────────────────

class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let current = x;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;
    const rankX = this.rank.get(rootX) ?? 0;
    const rankY = this.rank.get(rootY) ?? 0;
    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  groups(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const group = result.get(root) ?? [];
      group.push(key);
      result.set(root, group);
    }
    return result;
  }
}

// ─── Coherence clustering ───────────────────────────────────────────────────

function buildCoherenceClusters(
  memories: RawMemory[],
  queryKeywords: string[]
): CoherenceCluster[] {
  const uf = new UnionFind();
  const keywordIndex = new Map<string, string[]>();

  // Initialize all memories in union-find
  for (const mem of memories) {
    uf.find(mem.id);
  }

  // Extract keywords per memory and build inverted index
  const memKeywords = new Map<string, string[]>();
  for (const mem of memories) {
    const keywords = extractKeywords(mem.content);
    memKeywords.set(mem.id, keywords);
    for (const kw of keywords) {
      const ids = keywordIndex.get(kw) ?? [];
      ids.push(mem.id);
      keywordIndex.set(kw, ids);
    }
  }

  // Union memories that share 2+ keywords
  for (const mem of memories) {
    const kws = memKeywords.get(mem.id) ?? [];
    const neighborCounts = new Map<string, number>();
    for (const kw of kws) {
      const ids = keywordIndex.get(kw) ?? [];
      for (const id of ids) {
        if (id !== mem.id) {
          neighborCounts.set(id, (neighborCounts.get(id) ?? 0) + 1);
        }
      }
    }
    for (const [neighborId, count] of neighborCounts) {
      if (count >= 2) {
        uf.union(mem.id, neighborId);
      }
    }
  }

  // Union memories in the same category that also share a query keyword
  if (queryKeywords.length > 0) {
    const byCategoryAndQuery = new Map<string, string[]>();
    for (const mem of memories) {
      const kws = memKeywords.get(mem.id) ?? [];
      const matchesQuery = queryKeywords.some((qk) => kws.includes(qk));
      if (matchesQuery) {
        const key = mem.category;
        const ids = byCategoryAndQuery.get(key) ?? [];
        ids.push(mem.id);
        byCategoryAndQuery.set(key, ids);
      }
    }
    for (const ids of byCategoryAndQuery.values()) {
      for (let i = 1; i < ids.length; i++) {
        uf.union(ids[0], ids[i]);
      }
    }
  }

  // Build cluster objects
  const groups = uf.groups();
  const clusters: CoherenceCluster[] = [];
  for (const [root, memberIds] of groups) {
    if (memberIds.length < 2) continue;

    // Determine cluster label from dominant category
    const categoryCounts = new Map<string, number>();
    for (const id of memberIds) {
      const mem = memories.find((m) => m.id === id);
      if (mem) {
        categoryCounts.set(mem.category, (categoryCounts.get(mem.category) ?? 0) + 1);
      }
    }
    let dominantCategory = "";
    let maxCount = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxCount) {
        dominantCategory = cat;
        maxCount = count;
      }
    }

    const label = CATEGORY_LABELS[dominantCategory as MemoryCategory] ?? dominantCategory;
    clusters.push({
      id: `cluster:${root}`,
      label,
      members: new Set(memberIds),
    });
  }

  return clusters;
}

// ─── Scoring ────────────────────────────────────────────────────────────────

function scoreRelevance(
  memory: RawMemory,
  queryKeywords: string[],
  triggeredCats: Set<MemoryCategory>
): number {
  let score = 0;

  // Category trigger match
  if (triggeredCats.has(memory.category as MemoryCategory)) {
    score += 3;
  }

  // Keyword matching
  const contentLower = memory.content.toLowerCase();
  for (const term of queryKeywords) {
    const pattern = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?($|[^a-z0-9])`, "i");
    if (pattern.test(memory.content)) {
      score += 5;
    } else if (contentLower.includes(term)) {
      score += 1;
    }
  }

  // Reference count bonus (0-1 range)
  score += Math.min(memory.referenceCount, 10) / 10;

  return score;
}

function computeCoherenceScore(
  memoryId: string,
  clusters: CoherenceCluster[]
): { score: number; clusterId: string | null } {
  let bestScore = 0;
  let bestClusterId: string | null = null;

  for (const cluster of clusters) {
    if (cluster.members.has(memoryId)) {
      // Coherence score scales with cluster size (diminishing returns)
      const clusterScore = Math.log2(cluster.members.size + 1) / Math.log2(20);
      if (clusterScore > bestScore) {
        bestScore = clusterScore;
        bestClusterId = cluster.id;
      }
    }
  }

  return { score: Math.min(bestScore, 1), clusterId: bestClusterId };
}

// ─── Ignition ───────────────────────────────────────────────────────────────

function detectIgnition(
  candidates: WorkspaceCandidate[],
  clusters: CoherenceCluster[],
  threshold: number
): IgnitionCluster | null {
  let bestCluster: CoherenceCluster | null = null;
  let bestTotalRelevance = 0;

  for (const cluster of clusters) {
    if (cluster.members.size < threshold) continue;

    // Sum relevance scores of cluster members
    let totalRelevance = 0;
    for (const candidate of candidates) {
      if (cluster.members.has(candidate.memoryId)) {
        totalRelevance += candidate.relevanceScore;
      }
    }

    if (totalRelevance > bestTotalRelevance) {
      bestTotalRelevance = totalRelevance;
      bestCluster = cluster;
    }
  }

  if (!bestCluster) return null;

  return {
    id: bestCluster.id,
    label: bestCluster.label,
    members: Array.from(bestCluster.members),
    totalScore: bestTotalRelevance,
  };
}

// ─── Focus mode resolution ──────────────────────────────────────────────────

function resolveFocusMode(query: WorkspaceQuery): FocusMode | null {
  if (query.focusModeId) {
    return FOCUS_MODES.find((m) => m.id === query.focusModeId) ?? null;
  }
  if (query.boostCategories?.length || query.suppressCategories?.length) {
    return {
      id: "custom",
      label: "Custom Steering",
      boostedCategories: query.boostCategories ?? [],
      suppressedCategories: query.suppressCategories ?? [],
    };
  }
  return null;
}

// ─── Main workspace computation ─────────────────────────────────────────────

export async function computeWorkspace(query: WorkspaceQuery = {}): Promise<WorkspaceState> {
  const config: WorkspaceConfig = { ...DEFAULT_WORKSPACE_CONFIG, ...query.config };
  const now = new Date();

  // 1. Fetch all active, non-sensitive memories
  const memories = await prisma.memory.findMany({
    where: { status: "active", sensitive: false },
    select: {
      id: true,
      content: true,
      category: true,
      confidence: true,
      referenceCount: true,
      lastReferencedAt: true,
      sensitive: true,
      manuallyStrong: true,
      pinned: true,
    },
  });

  if (memories.length === 0) {
    return emptyWorkspace(config);
  }

  // 2. Extract query context
  const queryKeywords = query.question ? extractKeywords(query.question) : [];
  const triggeredCats = query.question ? triggeredCategories(query.question) : new Set<MemoryCategory>();

  // 3. Build coherence clusters
  const clusters = buildCoherenceClusters(memories, queryKeywords);

  // 4. Score all memories
  const candidates: WorkspaceCandidate[] = memories.map((mem) => {
    const relevanceScore = query.question
      ? scoreRelevance(mem, queryKeywords, triggeredCats)
      : mem.confidence * 3; // Without a query, use confidence as base relevance

    const strengthScore = computeMemoryStrength(
      mem.referenceCount,
      mem.lastReferencedAt,
      now,
      { content: mem.content, category: mem.category, manuallyStrong: mem.manuallyStrong }
    );

    const { score: coherenceScore, clusterId } = computeCoherenceScore(mem.id, clusters);

    // Weighted total: relevance dominant, coherence and strength as modifiers
    const relevanceWeight = 1 - config.coherenceWeight;
    const totalScore =
      relevanceWeight * relevanceScore +
      config.coherenceWeight * coherenceScore * 5 + // Scale coherence to relevance range
      strengthScore * 0.5; // Strength as a mild boost

    return {
      memoryId: mem.id,
      content: mem.content,
      category: mem.category as MemoryCategory,
      relevanceScore,
      strengthScore,
      coherenceScore,
      totalScore,
      clusterId,
      pinned: mem.pinned,
    };
  });

  // 5. Ignition check
  const ignitionCluster = detectIgnition(candidates, clusters, config.ignitionThreshold);

  // 6. Apply ignition boost/suppression
  if (ignitionCluster) {
    const ignitedMembers = new Set(ignitionCluster.members);
    for (const candidate of candidates) {
      if (ignitedMembers.has(candidate.memoryId)) {
        candidate.totalScore *= config.ignitionBoost;
      } else {
        candidate.totalScore *= config.suppressionFactor;
      }
    }
  }

  // 7. Apply focus mode / steering
  const focusMode = resolveFocusMode(query);
  const steeringApplied: string[] = [];
  if (focusMode && focusMode.id !== "balanced") {
    steeringApplied.push(focusMode.label);
    const boosted = new Set(focusMode.boostedCategories);
    const suppressed = new Set(focusMode.suppressedCategories);
    for (const candidate of candidates) {
      if (boosted.has(candidate.category)) {
        candidate.totalScore *= 1.5;
      } else if (suppressed.has(candidate.category)) {
        candidate.totalScore *= 0.5;
      }
    }
  }

  // 8. Sort by total score
  candidates.sort((a, b) => b.totalScore - a.totalScore);

  // 9. Capacity gate: pinned memories always enter
  const pinned = candidates.filter((c) => c.pinned);
  const unpinned = candidates.filter((c) => !c.pinned);
  const remainingSlots = Math.max(0, config.capacity - pinned.length);
  const active = [...pinned, ...unpinned.slice(0, remainingSlots)]
    .sort((a, b) => b.totalScore - a.totalScore);
  const suppressed = unpinned.slice(remainingSlots);

  // 10. Compute variance explained
  const totalAllScores = candidates.reduce((sum, c) => sum + c.totalScore, 0);
  const totalActiveScores = active.reduce((sum, c) => sum + c.totalScore, 0);
  const varianceExplained = totalAllScores > 0 ? totalActiveScores / totalAllScores : 0;

  // 11. Optionally include top 50 background-tier candidates that didn't make it into active
  const topCandidates = query.includeCandidates
    ? suppressed.slice(0, 50)
    : undefined;

  return {
    active,
    suppressed,
    ignitionCluster,
    capacity: config.capacity,
    totalCandidates: candidates.length,
    varianceExplained: Math.round(varianceExplained * 1000) / 1000,
    steeringApplied,
    computedAt: now.toISOString(),
    ...(topCandidates !== undefined ? { candidates: topCandidates } : {}),
  };
}

function emptyWorkspace(config: WorkspaceConfig): WorkspaceState {
  return {
    active: [],
    suppressed: [],
    ignitionCluster: null,
    capacity: config.capacity,
    totalCandidates: 0,
    varianceExplained: 0,
    steeringApplied: [],
    computedAt: new Date().toISOString(),
  };
}

// ─── Convenience: format workspace for MCP text output ──────────────────────

export function formatWorkspaceForMcp(state: WorkspaceState): string {
  const lines: string[] = [];

  lines.push(`Workspace: ${state.active.length}/${state.capacity} slots occupied (${Math.round(state.varianceExplained * 100)}% relevance captured)`);
  lines.push("");

  if (state.ignitionCluster) {
    lines.push(`Ignition: "${state.ignitionCluster.label}" cluster (${state.ignitionCluster.members.length} memories, score: ${state.ignitionCluster.totalScore.toFixed(1)})`);
    lines.push("");
  }

  if (state.steeringApplied.length > 0) {
    lines.push(`Steering: ${state.steeringApplied.join(", ")}`);
    lines.push("");
  }

  if (state.active.length === 0) {
    lines.push("No memories in workspace. The user may not have synced any sources yet.");
    return lines.join("\n");
  }

  lines.push("Active workspace memories:");
  for (const mem of state.active) {
    const pin = mem.pinned ? " [pinned]" : "";
    const cluster = mem.clusterId ? ` (cluster)` : "";
    lines.push(`- [${mem.category}] ${mem.content} (score: ${mem.totalScore.toFixed(1)}${pin}${cluster})`);
  }

  return lines.join("\n");
}

// ─── Convenience: extract just the memory contents for context serving ──────

export function workspaceToContextMemories(state: WorkspaceState): Array<{
  id: string;
  content: string;
  category: string;
  confidence: number;
}> {
  // Return workspace-active memories in a format compatible with context.ts grouping
  return state.active.map((c) => ({
    id: c.memoryId,
    content: c.content,
    category: c.category,
    confidence: c.totalScore, // Use workspace score as confidence signal
  }));
}
