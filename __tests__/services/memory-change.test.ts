import { beforeEach, describe, expect, it, vi } from "vitest";

const propagateToAllPlatformsMock = vi.hoisted(() => vi.fn());
const writeAllClaudeBootstrapsMock = vi.hoisted(() => vi.fn());

vi.mock("@/services/propagate", () => ({
  propagateToAllPlatforms: propagateToAllPlatformsMock,
}));

vi.mock("@/exporters/bootstrap", () => ({
  writeAllClaudeBootstraps: writeAllClaudeBootstrapsMock,
}));

import { notifyMemoryChange } from "@/services/memory-change";

describe("notifyMemoryChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propagateToAllPlatformsMock.mockResolvedValue({ destinations: [] });
    writeAllClaudeBootstrapsMock.mockResolvedValue([
      { path: "/tmp/CLAUDE.md", installed: true },
    ]);
  });

  it("propagates memory updates and refreshes local Claude bootstraps", async () => {
    await notifyMemoryChange({
      action: "create",
      memoryId: "mem_1",
      content: "User would name a dog Leslie.",
      category: "preferences",
    });

    expect(writeAllClaudeBootstrapsMock).toHaveBeenCalledTimes(1);
    expect(propagateToAllPlatformsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pokeMessage: expect.stringContaining("User would name a dog Leslie."),
        pokeMetadata: expect.objectContaining({
          type: "memory_update",
          action: "create",
          memoryId: "mem_1",
          category: "preferences",
        }),
      })
    );
  });

  it("does not fail memory propagation when bootstrap refresh fails", async () => {
    writeAllClaudeBootstrapsMock.mockRejectedValueOnce(new Error("disk unavailable"));

    await expect(notifyMemoryChange({ action: "create", count: 2 })).resolves.toEqual({ destinations: [] });
    expect(propagateToAllPlatformsMock).toHaveBeenCalled();
  });
});
