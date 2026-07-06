import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NormalizedConversation } from "@/contracts/conversation";

// Mock all parsers and integrations
vi.mock("@/parsers/chatgpt", () => ({
  parseChatGPTExport: vi.fn(),
}));

vi.mock("@/parsers/claude-code", () => ({
  parseClaudeCodeMemory: vi.fn(),
}));

vi.mock("@/parsers/claude-export", () => ({
  parseClaudeExport: vi.fn(),
}));

vi.mock("@/integrations/claude/session-parser", () => ({
  parseClaudeCodeSessions: vi.fn(),
}));

vi.mock("@/integrations/granola/parser", () => ({
  parseGranolaNotes: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const mockPrisma = {
    conversation: {
      findMany: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { ingest } from "@/pipeline/ingest";
import { prisma } from "@/lib/db";
import { parseChatGPTExport } from "@/parsers/chatgpt";
import { parseClaudeCodeMemory } from "@/parsers/claude-code";
import { parseClaudeExport } from "@/parsers/claude-export";
import { parseClaudeCodeSessions } from "@/integrations/claude/session-parser";
import { parseGranolaNotes } from "@/integrations/granola/parser";

const mockedPrisma = vi.mocked(prisma);
const mockedParseChatGPT = vi.mocked(parseChatGPTExport);
const mockedParseClaudeCode = vi.mocked(parseClaudeCodeMemory);
const mockedParseClaudeExport = vi.mocked(parseClaudeExport);
const mockedParseClaudeSessions = vi.mocked(parseClaudeCodeSessions);
const mockedParseGranola = vi.mocked(parseGranolaNotes);

function makeConversation(
  externalId: string,
  contentHash: string,
  title: string = "Test conversation"
): NormalizedConversation {
  return {
    externalId,
    title,
    messages: [
      { role: "user", content: "Hello", timestamp: new Date() },
      { role: "assistant", content: "Hi there", timestamp: new Date() },
    ],
    contentHash,
    sourceDate: new Date(),
  };
}

describe("ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no existing conversations
    mockedPrisma.conversation.findMany.mockResolvedValue([]);
  });

  it("routes ChatGPT format to the correct parser", async () => {
    const conv = makeConversation("chatgpt-1", "hash-a");
    mockedParseChatGPT.mockResolvedValue([conv]);

    const result = await ingest({
      sourceId: "src-1",
      sourceType: "chatgpt_export",
      filePath: "/tmp/chatgpt.json",
    });

    expect(mockedParseChatGPT).toHaveBeenCalledOnce();
    expect(mockedParseChatGPT).toHaveBeenCalledWith("/tmp/chatgpt.json");
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].externalId).toBe("chatgpt-1");
  });

  it("routes Claude export format to the correct parser", async () => {
    const conv = makeConversation("claude-1", "hash-b");
    mockedParseClaudeExport.mockResolvedValue([conv]);

    const result = await ingest({
      sourceId: "src-1",
      sourceType: "claude_export",
      filePath: "/tmp/claude.json",
    });

    expect(mockedParseClaudeExport).toHaveBeenCalledOnce();
    expect(mockedParseClaudeExport).toHaveBeenCalledWith("/tmp/claude.json");
    expect(result.conversations).toHaveLength(1);
  });

  it("routes Claude Code format to both memory and session parsers", async () => {
    const memConv = makeConversation("claude-code-mem-1", "hash-c");
    const sessConv = makeConversation("claude-code-sess-1", "hash-d");
    mockedParseClaudeCode.mockResolvedValue([memConv]);
    mockedParseClaudeSessions.mockResolvedValue([sessConv]);

    const result = await ingest({
      sourceId: "src-1",
      sourceType: "claude_code",
      filePath: "/tmp/claude-code",
    });

    expect(mockedParseClaudeCode).toHaveBeenCalledOnce();
    expect(mockedParseClaudeSessions).toHaveBeenCalledOnce();
    expect(result.conversations).toHaveLength(2);
  });

  it("routes Granola format to the correct parser", async () => {
    const conv = makeConversation("granola-1", "hash-e");
    mockedParseGranola.mockResolvedValue([conv]);

    const result = await ingest({
      sourceId: "src-1",
      sourceType: "granola",
      filePath: "/tmp/granola",
    });

    expect(mockedParseGranola).toHaveBeenCalledOnce();
    expect(result.conversations).toHaveLength(1);
  });

  it("filters out already-processed conversations by contentHash", async () => {
    const conv1 = makeConversation("conv-1", "existing-hash");
    const conv2 = makeConversation("conv-2", "new-hash");
    mockedParseChatGPT.mockResolvedValue([conv1, conv2]);

    // Simulate that conv1's hash already exists
    mockedPrisma.conversation.findMany.mockResolvedValue([
      { contentHash: "existing-hash" } as any,
    ]);

    const result = await ingest({
      sourceId: "src-1",
      sourceType: "chatgpt_export",
      filePath: "/tmp/chatgpt.json",
    });

    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].contentHash).toBe("new-hash");
    expect(result.skipped).toBe(1);
  });

  it("filters out multiple already-processed conversations", async () => {
    const convs = [
      makeConversation("conv-1", "hash-1"),
      makeConversation("conv-2", "hash-2"),
      makeConversation("conv-3", "hash-3"),
    ];
    mockedParseChatGPT.mockResolvedValue(convs);

    mockedPrisma.conversation.findMany.mockResolvedValue([
      { contentHash: "hash-1" } as any,
      { contentHash: "hash-3" } as any,
    ]);

    const result = await ingest({
      sourceId: "src-1",
      sourceType: "chatgpt_export",
      filePath: "/tmp/chatgpt.json",
    });

    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].contentHash).toBe("hash-2");
    expect(result.skipped).toBe(2);
  });

  it("handles empty input gracefully (parser returns no conversations)", async () => {
    mockedParseChatGPT.mockResolvedValue([]);

    const result = await ingest({
      sourceId: "src-1",
      sourceType: "chatgpt_export",
      filePath: "/tmp/empty.json",
    });

    expect(result.conversations).toHaveLength(0);
    expect(result.skipped).toBe(0);
  });

  it("returns all conversations when none have been processed before", async () => {
    const convs = [
      makeConversation("conv-1", "hash-1"),
      makeConversation("conv-2", "hash-2"),
    ];
    mockedParseChatGPT.mockResolvedValue(convs);

    const result = await ingest({
      sourceId: "src-1",
      sourceType: "chatgpt_export",
      filePath: "/tmp/chatgpt.json",
    });

    expect(result.conversations).toHaveLength(2);
    expect(result.skipped).toBe(0);
  });

  it("throws on unknown source type", async () => {
    await expect(
      ingest({
        sourceId: "src-1",
        sourceType: "unknown_type" as any,
        filePath: "/tmp/unknown",
      })
    ).rejects.toThrow("Unknown source type");
  });

  it("queries existing hashes scoped to the given sourceId", async () => {
    mockedParseChatGPT.mockResolvedValue([]);

    await ingest({
      sourceId: "src-42",
      sourceType: "chatgpt_export",
      filePath: "/tmp/chatgpt.json",
    });

    expect(mockedPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceId: "src-42" },
        select: { contentHash: true },
      })
    );
  });
});
