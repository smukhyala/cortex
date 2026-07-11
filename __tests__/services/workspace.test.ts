import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock prisma before importing workspace
vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: vi.fn(),
    },
  },
}));

import { computeWorkspace } from "@/services/workspace";
import { prisma } from "@/lib/db";

const mockedFindMany = prisma.memory.findMany as unknown as ReturnType<typeof vi.fn>;

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMemory(overrides: Partial<{
  id: string;
  content: string;
  category: string;
  confidence: number;
  referenceCount: number;
  lastReferencedAt: Date;
  sensitive: boolean;
  manuallyStrong: boolean;
  pinned: boolean;
}> = {}) {
  return {
    id: overrides.id ?? `mem-${Math.random().toString(36).slice(2, 8)}`,
    content: overrides.content ?? "Test memory content",
    category: overrides.category ?? "identity",
    confidence: overrides.confidence ?? 0.9,
    referenceCount: overrides.referenceCount ?? 1,
    lastReferencedAt: overrides.lastReferencedAt ?? new Date(),
    sensitive: overrides.sensitive ?? false,
    manuallyStrong: overrides.manuallyStrong ?? false,
    pinned: overrides.pinned ?? false,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("computeWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty workspace when no memories exist", async () => {
    mockedFindMany.mockResolvedValue([]);

    const state = await computeWorkspace();
    expect(state.active).toHaveLength(0);
    expect(state.suppressed).toHaveLength(0);
    expect(state.ignitionCluster).toBeNull();
    expect(state.totalCandidates).toBe(0);
    expect(state.varianceExplained).toBe(0);
  });

  it("respects capacity limit", async () => {
    const memories = Array.from({ length: 30 }, (_, i) =>
      makeMemory({ id: `mem-${i}`, content: `Memory number ${i}`, category: "projects" })
    );
    mockedFindMany.mockResolvedValue(memories);

    const state = await computeWorkspace({ config: { capacity: 10 } });
    expect(state.active.length).toBeLessThanOrEqual(10);
    expect(state.totalCandidates).toBe(30);
  });

  it("pinned memories always enter workspace", async () => {
    const memories = [
      ...Array.from({ length: 20 }, (_, i) =>
        makeMemory({ id: `regular-${i}`, content: `Regular memory ${i}`, confidence: 0.9 })
      ),
      makeMemory({ id: "pinned-1", content: "Pinned important memory", pinned: true, confidence: 0.1 }),
    ];
    mockedFindMany.mockResolvedValue(memories);

    const state = await computeWorkspace({ config: { capacity: 5 } });
    const activeIds = state.active.map((c) => c.memoryId);
    expect(activeIds).toContain("pinned-1");
  });

  it("scores higher for memories matching query keywords", async () => {
    const memories = [
      makeMemory({ id: "match", content: "User is building a project called Cortex", category: "projects" }),
      makeMemory({ id: "nomatch", content: "User's favorite color is green", category: "preferences" }),
    ];
    mockedFindMany.mockResolvedValue(memories);

    const state = await computeWorkspace({ question: "What project is the user building?" });
    const matchCandidate = state.active.find((c) => c.memoryId === "match");
    const noMatchCandidate = state.active.find((c) => c.memoryId === "nomatch")
      ?? state.suppressed.find((c) => c.memoryId === "nomatch");

    expect(matchCandidate).toBeDefined();
    expect(noMatchCandidate).toBeDefined();
    expect(matchCandidate!.totalScore).toBeGreaterThan(noMatchCandidate!.totalScore);
  });

  it("clusters memories sharing keywords and same category", async () => {
    const memories = [
      makeMemory({ id: "cortex-1", content: "User is building Cortex with Next.js", category: "projects" }),
      makeMemory({ id: "cortex-2", content: "Cortex uses Prisma and SQLite for storage", category: "projects" }),
      makeMemory({ id: "cortex-3", content: "Cortex extracts memories from conversations", category: "projects" }),
      makeMemory({ id: "unrelated", content: "User likes turtles", category: "preferences" }),
    ];
    mockedFindMany.mockResolvedValue(memories);

    const state = await computeWorkspace({ question: "Tell me about Cortex" });

    // Cortex memories should cluster together
    const cortexMemories = state.active.filter((c) =>
      c.content.toLowerCase().includes("cortex")
    );
    // Check they share the same cluster
    const clusterIds = new Set(cortexMemories.map((c) => c.clusterId).filter(Boolean));
    expect(clusterIds.size).toBeLessThanOrEqual(1);
  });

  it("fires ignition when cluster reaches threshold", async () => {
    const memories = [
      makeMemory({ id: "p1", content: "User is building Cortex memory app", category: "projects" }),
      makeMemory({ id: "p2", content: "Cortex uses Prisma ORM and SQLite", category: "projects" }),
      makeMemory({ id: "p3", content: "Cortex has a pipeline for memory extraction", category: "projects" }),
      makeMemory({ id: "p4", content: "Cortex syncs memories across AI tools", category: "projects" }),
      makeMemory({ id: "u1", content: "User's name is Sanjay", category: "identity" }),
      makeMemory({ id: "u2", content: "User likes green color", category: "preferences" }),
    ];
    mockedFindMany.mockResolvedValue(memories);

    const state = await computeWorkspace({
      question: "What is Cortex?",
      config: { ignitionThreshold: 3 },
    });

    expect(state.ignitionCluster).not.toBeNull();
    // Ignited cluster should contain Cortex memories
    if (state.ignitionCluster) {
      expect(state.ignitionCluster.members.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not fire ignition when cluster is below threshold", async () => {
    const memories = [
      makeMemory({ id: "a", content: "User likes coding", category: "preferences" }),
      makeMemory({ id: "b", content: "User prefers Python", category: "preferences" }),
      makeMemory({ id: "c", content: "User's name is Sanjay", category: "identity" }),
      makeMemory({ id: "d", content: "User lives in Berkeley", category: "identity" }),
    ];
    mockedFindMany.mockResolvedValue(memories);

    const state = await computeWorkspace({
      question: "basic info",
      config: { ignitionThreshold: 5 },
    });

    expect(state.ignitionCluster).toBeNull();
  });

  it("applies focus mode boost and suppression", async () => {
    const memories = [
      makeMemory({ id: "proj", content: "User is building Oasis", category: "projects", confidence: 0.8 }),
      makeMemory({ id: "rel", content: "User collaborates with Ian", category: "relationships", confidence: 0.8 }),
    ];
    mockedFindMany.mockResolvedValue(memories);

    const workState = await computeWorkspace({ focusModeId: "work" });
    const projScore = workState.active.find((c) => c.memoryId === "proj")?.totalScore
      ?? workState.suppressed.find((c) => c.memoryId === "proj")?.totalScore ?? 0;
    const relScore = workState.active.find((c) => c.memoryId === "rel")?.totalScore
      ?? workState.suppressed.find((c) => c.memoryId === "rel")?.totalScore ?? 0;

    // In "work" mode, projects are boosted and relationships are suppressed
    expect(projScore).toBeGreaterThan(relScore);
  });

  it("applies custom steering categories", async () => {
    const memories = [
      makeMemory({ id: "research", content: "User researches LLM evaluation", category: "research", confidence: 0.8 }),
      makeMemory({ id: "temp", content: "User has a deadline Friday", category: "temporary", confidence: 0.8 }),
    ];
    mockedFindMany.mockResolvedValue(memories);

    const state = await computeWorkspace({
      boostCategories: ["research"],
      suppressCategories: ["temporary"],
    });

    const researchScore = state.active.find((c) => c.memoryId === "research")?.totalScore
      ?? state.suppressed.find((c) => c.memoryId === "research")?.totalScore ?? 0;
    const tempScore = state.active.find((c) => c.memoryId === "temp")?.totalScore
      ?? state.suppressed.find((c) => c.memoryId === "temp")?.totalScore ?? 0;

    expect(researchScore).toBeGreaterThan(tempScore);
    expect(state.steeringApplied).toContain("Custom Steering");
  });

  it("computes variance explained as ratio of active to total scores", async () => {
    const memories = Array.from({ length: 10 }, (_, i) =>
      makeMemory({ id: `mem-${i}`, content: `Memory ${i}`, category: "identity" })
    );
    mockedFindMany.mockResolvedValue(memories);

    const state = await computeWorkspace({ config: { capacity: 5 } });
    expect(state.varianceExplained).toBeGreaterThan(0);
    expect(state.varianceExplained).toBeLessThanOrEqual(1);
  });

  it("workspace without query uses confidence as base relevance", async () => {
    const memories = [
      makeMemory({ id: "high", content: "High confidence fact", confidence: 0.95 }),
      makeMemory({ id: "low", content: "Low confidence fact", confidence: 0.3 }),
    ];
    mockedFindMany.mockResolvedValue(memories);

    const state = await computeWorkspace(); // no question
    const highScore = state.active.find((c) => c.memoryId === "high")?.totalScore ?? 0;
    const lowScore = state.active.find((c) => c.memoryId === "low")?.totalScore ?? 0;
    expect(highScore).toBeGreaterThan(lowScore);
  });

  it("ignition boosts cluster and suppresses others", async () => {
    // 4 closely related project memories + 1 unrelated
    const memories = [
      makeMemory({ id: "c1", content: "Cortex is a memory sync app built with Next.js", category: "projects" }),
      makeMemory({ id: "c2", content: "Cortex uses Prisma for the database layer", category: "projects" }),
      makeMemory({ id: "c3", content: "Cortex extracts memories via a pipeline", category: "projects" }),
      makeMemory({ id: "c4", content: "Cortex exports to Claude and ChatGPT", category: "projects" }),
      makeMemory({ id: "other", content: "User's favorite animal is turtle", category: "preferences" }),
    ];
    mockedFindMany.mockResolvedValue(memories);

    const state = await computeWorkspace({
      question: "How does Cortex work?",
      config: { ignitionThreshold: 3, ignitionBoost: 2.0, suppressionFactor: 0.3 },
    });

    expect(state.ignitionCluster).not.toBeNull();

    const cortexScores = state.active
      .filter((c) => c.content.toLowerCase().includes("cortex"))
      .map((c) => c.totalScore);
    const otherCandidate = state.active.find((c) => c.memoryId === "other")
      ?? state.suppressed.find((c) => c.memoryId === "other");

    // Cortex memories should be much higher scored than the unrelated one
    if (otherCandidate && cortexScores.length > 0) {
      const minCortexScore = Math.min(...cortexScores);
      expect(minCortexScore).toBeGreaterThan(otherCandidate.totalScore);
    }
  });
});
