import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all dependencies before importing the module under test
vi.mock("@/lib/db", () => {
  const mockPrisma = {
    memory: {
      findMany: vi.fn(),
    },
    source: {
      findMany: vi.fn(),
    },
    exportLog: {
      create: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

vi.mock("@/exporters/poke", () => ({
  pushToPoke: vi.fn(),
}));

vi.mock("@/exporters/claude", () => ({
  writeClaudeExport: vi.fn(),
}));

vi.mock("@/exporters/chatgpt", () => ({
  formatForChatGPT: vi.fn(),
}));

vi.mock("fs", () => ({
  default: {
    statSync: vi.fn(),
  },
}));

import { propagateToAllPlatforms } from "@/services/propagate";
import { prisma } from "@/lib/db";
import { pushToPoke } from "@/exporters/poke";
import { writeClaudeExport } from "@/exporters/claude";
import { formatForChatGPT } from "@/exporters/chatgpt";
import fs from "fs";

const mockedPrisma = vi.mocked(prisma);
const mockedPushToPoke = vi.mocked(pushToPoke);
const mockedWriteClaudeExport = vi.mocked(writeClaudeExport);
const mockedFormatForChatGPT = vi.mocked(formatForChatGPT);
const mockedFs = vi.mocked(fs);

const sampleMemories = [
  { content: "User is Sanjay", category: "identity", sensitive: false },
  { content: "User prefers TypeScript", category: "preferences", sensitive: false },
];

describe("propagateToAllPlatforms", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    // Default mock setup
    mockedPrisma.memory.findMany.mockResolvedValue(sampleMemories as any);
    mockedPrisma.source.findMany.mockResolvedValue([]);
    mockedPrisma.exportLog.create.mockResolvedValue({} as any);
    mockedPrisma.activityLog.create.mockResolvedValue({} as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("successfully propagates to Claude Code sources", async () => {
    mockedPrisma.source.findMany.mockResolvedValue([
      {
        id: "src-1",
        name: "My Claude Code",
        type: "claude_code",
        status: "active",
        config: JSON.stringify({ filePath: "/tmp/CLAUDE.md" }),
      } as any,
    ]);

    mockedFs.statSync.mockImplementation(() => {
      throw new Error("not a directory");
    });
    mockedWriteClaudeExport.mockResolvedValue(undefined);

    const result = await propagateToAllPlatforms();

    expect(mockedWriteClaudeExport).toHaveBeenCalledOnce();
    expect(mockedWriteClaudeExport).toHaveBeenCalledWith(
      "/tmp/CLAUDE.md",
      sampleMemories
    );

    const claudeDest = result.destinations.find((d) => d.type === "claude_code");
    expect(claudeDest).toBeDefined();
    expect(claudeDest!.success).toBe(true);

    // Should log success to exportLog
    expect(mockedPrisma.exportLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destination: "claude_code",
          status: "success",
        }),
      })
    );
  });

  it("resolves directory paths to CLAUDE.md for Claude Code sources", async () => {
    mockedPrisma.source.findMany.mockResolvedValue([
      {
        id: "src-1",
        name: "Claude Code Dir",
        type: "claude_code",
        status: "active",
        config: JSON.stringify({ filePath: "/tmp/my-project" }),
      } as any,
    ]);

    // Simulate filePath being a directory
    mockedFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
    mockedWriteClaudeExport.mockResolvedValue(undefined);

    const result = await propagateToAllPlatforms();

    expect(mockedWriteClaudeExport).toHaveBeenCalledWith(
      expect.stringContaining("CLAUDE.md"),
      sampleMemories
    );
    expect(result.destinations[0].success).toBe(true);
  });

  it("handles Claude Code write errors gracefully", async () => {
    mockedPrisma.source.findMany.mockResolvedValue([
      {
        id: "src-1",
        name: "Broken Claude",
        type: "claude_code",
        status: "active",
        config: JSON.stringify({ filePath: "/nonexistent/CLAUDE.md" }),
      } as any,
    ]);

    mockedFs.statSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockedWriteClaudeExport.mockRejectedValue(new Error("EACCES: permission denied"));

    const result = await propagateToAllPlatforms();

    const claudeDest = result.destinations.find((d) => d.type === "claude_code");
    expect(claudeDest).toBeDefined();
    expect(claudeDest!.success).toBe(false);
    expect(claudeDest!.error).toContain("EACCES");

    // Should log failure to exportLog
    expect(mockedPrisma.exportLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destination: "claude_code",
          status: "failed",
          errorMessage: expect.stringContaining("EACCES"),
        }),
      })
    );
  });

  it("handles Poke API errors gracefully", async () => {
    process.env.POKE_API_KEY = "test-poke-key";

    mockedPushToPoke.mockRejectedValue(new Error("Network timeout"));

    const result = await propagateToAllPlatforms();

    const pokeDest = result.destinations.find((d) => d.type === "poke");
    expect(pokeDest).toBeDefined();
    expect(pokeDest!.success).toBe(false);
    expect(pokeDest!.error).toContain("Network timeout");
  });

  it("handles Poke API returning failure result", async () => {
    process.env.POKE_API_KEY = "test-poke-key";

    mockedPushToPoke.mockResolvedValue({
      success: false,
      error: "Poke API error (401): Unauthorized",
    });

    const result = await propagateToAllPlatforms();

    const pokeDest = result.destinations.find((d) => d.type === "poke");
    expect(pokeDest).toBeDefined();
    expect(pokeDest!.success).toBe(false);

    // Should log the failure
    expect(mockedPrisma.exportLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destination: "poke",
          status: "failed",
        }),
      })
    );
  });

  it("generates ChatGPT text for chatgpt_export sources", async () => {
    mockedPrisma.source.findMany.mockResolvedValue([
      {
        id: "src-chatgpt",
        name: "ChatGPT",
        type: "chatgpt_export",
        status: "active",
        config: "{}",
      } as any,
    ]);

    mockedFormatForChatGPT.mockReturnValue(
      "[Identity & Profile]\nUser is Sanjay\n\n[Preferences & Style]\nUser prefers TypeScript"
    );

    const result = await propagateToAllPlatforms();

    expect(mockedFormatForChatGPT).toHaveBeenCalledOnce();
    expect(mockedFormatForChatGPT).toHaveBeenCalledWith(sampleMemories);
    expect(result.chatgptText).toBeDefined();
    expect(result.chatgptText).toContain("Sanjay");

    const chatgptDest = result.destinations.find((d) => d.type === "chatgpt_export");
    expect(chatgptDest).toBeDefined();
    expect(chatgptDest!.success).toBe(true);
  });

  it("logs export attempts to ExportLog", async () => {
    process.env.POKE_API_KEY = "test-poke-key";

    mockedPrisma.source.findMany.mockResolvedValue([
      {
        id: "src-1",
        name: "Claude Code",
        type: "claude_code",
        status: "active",
        config: JSON.stringify({ filePath: "/tmp/CLAUDE.md" }),
      } as any,
    ]);

    mockedFs.statSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockedWriteClaudeExport.mockResolvedValue(undefined);
    mockedPushToPoke.mockResolvedValue({ success: true, message: "OK" });

    await propagateToAllPlatforms();

    // Should have exportLog entries for Claude Code and Poke
    expect(mockedPrisma.exportLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destination: "claude_code",
          memoriesCount: 2,
        }),
      })
    );
    expect(mockedPrisma.exportLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destination: "poke",
          memoriesCount: 2,
        }),
      })
    );
  });

  it("handles case where no sources are configured", async () => {
    mockedPrisma.source.findMany.mockResolvedValue([]);
    delete process.env.POKE_API_KEY;

    const result = await propagateToAllPlatforms();

    expect(result.destinations).toHaveLength(0);
    expect(result.chatgptText).toBeUndefined();

    // Should still log activity
    expect(mockedPrisma.activityLog.create).toHaveBeenCalledOnce();
  });

  it("skips Poke when no API key is configured", async () => {
    delete process.env.POKE_API_KEY;

    const result = await propagateToAllPlatforms();

    expect(mockedPushToPoke).not.toHaveBeenCalled();
    const pokeDest = result.destinations.find((d) => d.type === "poke");
    expect(pokeDest).toBeUndefined();
  });

  it("can skip destinations during peer exchange propagation", async () => {
    process.env.POKE_API_KEY = "test-poke-key";
    mockedPrisma.source.findMany.mockResolvedValue([
      {
        id: "src-1",
        name: "Claude Code",
        type: "claude_code",
        status: "active",
        config: JSON.stringify({ filePath: "/tmp/CLAUDE.md" }),
      } as any,
    ]);
    mockedFs.statSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockedWriteClaudeExport.mockResolvedValue(undefined);

    const result = await propagateToAllPlatforms({ skipDestinations: ["poke"] });

    expect(mockedWriteClaudeExport).toHaveBeenCalledOnce();
    expect(mockedPushToPoke).not.toHaveBeenCalled();
    expect(result.destinations.some((destination) => destination.type === "claude_code")).toBe(true);
    expect(result.destinations.some((destination) => destination.type === "poke")).toBe(false);
  });

  it("filters destination memories with exchange policies", async () => {
    mockedPrisma.memory.findMany.mockResolvedValue([
      ...sampleMemories,
      { content: "User studies design at school", category: "education_career", sensitive: false },
    ] as any);
    mockedPrisma.source.findMany.mockResolvedValue([
      {
        id: "poke-src",
        name: "Poke",
        type: "poke",
        status: "active",
        config: JSON.stringify({
          apiKey: "test-poke-key",
          exchangePolicies: [
            {
              destination: "poke",
              mode: "block",
              allowedCategories: [],
              blockedCategories: ["education_career"],
            },
          ],
        }),
      } as any,
    ]);
    mockedPushToPoke.mockResolvedValue({ success: true, message: "OK" });

    await propagateToAllPlatforms();

    expect(mockedPushToPoke).toHaveBeenCalledWith(
      expect.not.arrayContaining([
        expect.objectContaining({ category: "education_career" }),
      ]),
      "test-poke-key",
      expect.any(Object)
    );
  });

  it("does not send targeted Poke messages for blocked categories", async () => {
    mockedPrisma.source.findMany.mockResolvedValue([
      {
        id: "poke-src",
        name: "Poke",
        type: "poke",
        status: "active",
        config: JSON.stringify({
          apiKey: "test-poke-key",
          exchangePolicies: [
            {
              destination: "poke",
              mode: "block",
              allowedCategories: [],
              blockedCategories: ["education_career"],
            },
          ],
        }),
      } as any,
    ]);

    const result = await propagateToAllPlatforms({
      pokeMessage: "Please remember: User studies at Berkeley",
      pokeMetadata: { category: "education_career" },
    });

    expect(mockedPushToPoke).not.toHaveBeenCalled();
    expect(result.destinations[0]).toMatchObject({ type: "poke", success: true });
  });

  it("logs activity summary on completion", async () => {
    mockedPrisma.source.findMany.mockResolvedValue([
      {
        id: "src-chatgpt",
        name: "ChatGPT",
        type: "chatgpt_export",
        status: "active",
        config: "{}",
      } as any,
    ]);

    mockedFormatForChatGPT.mockReturnValue("formatted text");

    await propagateToAllPlatforms();

    expect(mockedPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "propagation_completed",
          summary: expect.stringContaining("2 memories"),
        }),
      })
    );
  });

  it("handles multiple Claude Code sources independently", async () => {
    mockedPrisma.source.findMany.mockResolvedValue([
      {
        id: "src-1",
        name: "Project A",
        type: "claude_code",
        status: "active",
        config: JSON.stringify({ filePath: "/tmp/project-a/CLAUDE.md" }),
      } as any,
      {
        id: "src-2",
        name: "Project B",
        type: "claude_code",
        status: "active",
        config: JSON.stringify({ filePath: "/tmp/project-b/CLAUDE.md" }),
      } as any,
    ]);

    mockedFs.statSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockedWriteClaudeExport
      .mockResolvedValueOnce(undefined) // First succeeds
      .mockRejectedValueOnce(new Error("Write failed")); // Second fails

    const result = await propagateToAllPlatforms();

    const claudeDests = result.destinations.filter((d) => d.type === "claude_code");
    expect(claudeDests).toHaveLength(2);
    expect(claudeDests[0].success).toBe(true);
    expect(claudeDests[1].success).toBe(false);
  });
});
