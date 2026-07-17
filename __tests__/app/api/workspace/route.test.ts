import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/services/j-lens", () => ({
  getWorkspaceResponse: vi.fn().mockResolvedValue({
    slots: [
      {
        position: 0,
        memoryId: "mem-1",
        conceptLabel: "test concept",
        loading: 0.9,
        pinned: false,
        sourceSignal: "activity",
        activatedAt: "2026-07-12T10:00:00Z",
        memories: ["test memory"],
      },
    ],
    capacity: { used: 1, total: 20 },
    lastUpdated: "2026-07-12T14:00:00Z",
  }),
  holdInMind: vi.fn().mockResolvedValue({ slotPosition: 0, conceptLabel: "test" }),
  suppress: vi.fn().mockResolvedValue({ evictedSlot: 0, suppressedUntil: "2026-07-13T10:00:00Z" }),
  release: vi.fn().mockResolvedValue({ slotPosition: 0 }),
  decayAllSlots: vi.fn().mockResolvedValue({ decayed: 0, evicted: 0 }),
}));

vi.mock("@/services/workspace", () => ({
  computeWorkspace: vi.fn().mockResolvedValue({
    active: [],
    suppressed: [],
    ignitionCluster: null,
    capacity: 20,
    totalCandidates: 0,
    varianceExplained: 0,
    steeringApplied: [],
    computedAt: "2026-07-12T14:00:00Z",
    candidates: [
      {
        memoryId: "mem-bg-1",
        content: "background candidate",
        category: "preferences",
        relevanceScore: 1.5,
        strengthScore: 0.3,
        coherenceScore: 0.2,
        totalScore: 2.0,
        clusterId: null,
        pinned: false,
      },
    ],
  }),
}));

vi.mock("@/lib/seed-workspace", () => ({
  seedWorkspaceSlots: vi.fn().mockResolvedValue(20),
}));

import { GET, POST } from "@/app/api/workspace/route";
import { holdInMind, suppress, release } from "@/services/j-lens";
import { computeWorkspace } from "@/services/workspace";

describe("GET /api/workspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns workspace state", async () => {
    const request = new NextRequest("http://localhost/api/workspace");
    const response = await GET(request);
    const data = await response.json();
    expect(data.slots).toHaveLength(1);
    expect(data.capacity.used).toBe(1);
    expect(data.capacity.total).toBe(20);
    expect(data.candidates).toBeUndefined();
  });

  it("returns candidates when include=candidates", async () => {
    const request = new NextRequest("http://localhost/api/workspace?include=candidates");
    const response = await GET(request);
    const data = await response.json();
    expect(data.active).toHaveLength(0);
    expect(data.candidates).toHaveLength(1);
    expect(data.candidates[0].memoryId).toBe("mem-bg-1");
    expect(computeWorkspace).toHaveBeenCalledWith({ includeCandidates: true });
  });
});

describe("POST /api/workspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("handles hold action", async () => {
    const request = new Request("http://localhost/api/workspace", {
      method: "POST",
      body: JSON.stringify({ action: "hold", concept: "test concept" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    const data = await response.json();
    expect(data.slotPosition).toBe(0);
    expect(holdInMind).toHaveBeenCalledWith("test concept");
  });

  it("handles suppress action", async () => {
    const request = new Request("http://localhost/api/workspace", {
      method: "POST",
      body: JSON.stringify({ action: "suppress", concept: "guitar", durationHours: 48 }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(request);
    expect(suppress).toHaveBeenCalledWith("guitar", 48);
  });

  it("handles release action", async () => {
    const request = new Request("http://localhost/api/workspace", {
      method: "POST",
      body: JSON.stringify({ action: "release", concept: "Ian meeting" }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(request);
    expect(release).toHaveBeenCalledWith("Ian meeting");
  });

  it("returns 400 for unknown action", async () => {
    const request = new Request("http://localhost/api/workspace", {
      method: "POST",
      body: JSON.stringify({ action: "unknown" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
