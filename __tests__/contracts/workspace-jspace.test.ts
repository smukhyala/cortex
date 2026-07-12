import { describe, expect, it } from "vitest";
import {
  WorkspaceSlotSchema,
  ActivitySignalSchema,
  JLensConfigSchema,
  WorkspaceResponseSchema,
  MemoryTierSchema,
  SourceSignalSchema,
  DEFAULT_JLENS_CONFIG,
} from "@/contracts/workspace";

describe("J-Space workspace contracts", () => {
  it("validates a workspace slot", () => {
    const slot = {
      position: 0,
      memoryId: "mem-123",
      conceptLabel: "cold-start research",
      loading: 0.85,
      pinned: false,
      sourceSignal: "activity",
      activatedAt: "2026-07-12T10:00:00Z",
      memories: ["fact 1", "fact 2"],
    };
    expect(WorkspaceSlotSchema.parse(slot)).toEqual(slot);
  });

  it("rejects slot with position > 29", () => {
    expect(() =>
      WorkspaceSlotSchema.parse({
        position: 30,
        loading: 0.5,
        pinned: false,
        sourceSignal: "activity",
        activatedAt: "2026-07-12T10:00:00Z",
        memories: [],
      })
    ).toThrow();
  });

  it("validates an activity signal", () => {
    const signal = {
      type: "mcp_query",
      keywords: ["webarena", "bug"],
      categories: ["projects"],
      sourceType: "claude_code",
    };
    expect(ActivitySignalSchema.parse(signal)).toEqual(signal);
  });

  it("validates memory tier enum", () => {
    expect(MemoryTierSchema.parse("workspace")).toBe("workspace");
    expect(MemoryTierSchema.parse("background")).toBe("background");
    expect(() => MemoryTierSchema.parse("other")).toThrow();
  });

  it("validates source signal enum", () => {
    expect(SourceSignalSchema.parse("activity")).toBe("activity");
    expect(SourceSignalSchema.parse("explicit")).toBe("explicit");
    expect(SourceSignalSchema.parse("query")).toBe("query");
    expect(SourceSignalSchema.parse("sync")).toBe("sync");
  });

  it("validates J-Lens config with defaults", () => {
    const config = JLensConfigSchema.parse({});
    expect(config.halfLifeDays).toBe(7);
    expect(config.evictionThreshold).toBe(0.15);
    expect(config.reinforcementBoost).toBe(0.2);
    expect(config.capacity).toBe(20);
  });

  it("validates workspace response shape", () => {
    const response = {
      slots: [
        {
          position: 0,
          memoryId: "mem-1",
          conceptLabel: "test",
          loading: 0.9,
          pinned: false,
          sourceSignal: "activity",
          activatedAt: "2026-07-12T10:00:00Z",
          memories: ["fact"],
        },
      ],
      capacity: { used: 1, total: 20 },
      lastUpdated: "2026-07-12T14:00:00Z",
    };
    expect(WorkspaceResponseSchema.parse(response)).toEqual(response);
  });

  it("has sensible default J-Lens config", () => {
    expect(DEFAULT_JLENS_CONFIG.halfLifeDays).toBe(7);
    expect(DEFAULT_JLENS_CONFIG.capacity).toBe(20);
    expect(DEFAULT_JLENS_CONFIG.evictionThreshold).toBe(0.15);
  });
});
