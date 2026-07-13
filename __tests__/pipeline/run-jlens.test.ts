import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/services/j-lens", () => ({
  logSignal: vi.fn().mockResolvedValue("sig-1"),
  scoreBatch: vi.fn().mockResolvedValue({ loaded: 2, evicted: 1 }),
}));

import { logSignal, scoreBatch } from "@/services/j-lens";

const mockedLogSignal = logSignal as unknown as ReturnType<typeof vi.fn>;
const mockedScoreBatch = scoreBatch as unknown as ReturnType<typeof vi.fn>;

describe("Pipeline J-Lens integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logSignal accepts correct input shape", async () => {
    await logSignal({
      type: "conversation_sync",
      keywords: ["webarena", "cold-start"],
      categories: ["projects", "research"],
      sourceType: "claude_code",
    });

    expect(mockedLogSignal).toHaveBeenCalledWith({
      type: "conversation_sync",
      keywords: ["webarena", "cold-start"],
      categories: ["projects", "research"],
      sourceType: "claude_code",
    });
  });

  it("scoreBatch returns load/evict counts", async () => {
    const result = await scoreBatch();
    expect(result.loaded).toBe(2);
    expect(result.evicted).toBe(1);
  });
});
