import { describe, expect, it, vi, beforeEach } from "vitest";

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

vi.mock("@/lib/seed-workspace", () => ({
  seedWorkspaceSlots: vi.fn().mockResolvedValue(20),
}));

import { GET, POST } from "@/app/api/workspace/route";
import { holdInMind, suppress, release } from "@/services/j-lens";

describe("GET /api/workspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns workspace state", async () => {
    const response = await GET();
    const data = await response.json();
    expect(data.slots).toHaveLength(1);
    expect(data.capacity.used).toBe(1);
    expect(data.capacity.total).toBe(20);
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
