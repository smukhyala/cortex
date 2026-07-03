import { describe, it, expect } from "vitest";
import { parseClaudeExport } from "@/parsers/claude-export";
import path from "path";

const FIXTURE = path.resolve(__dirname, "../../fixtures/claude-export.json");

describe("parseClaudeExport", () => {
  it("parses Claude.ai JSON export into conversations", async () => {
    const conversations = await parseClaudeExport(FIXTURE);
    expect(conversations.length).toBe(2);
  });

  it("maps human/assistant senders to user/assistant roles", async () => {
    const conversations = await parseClaudeExport(FIXTURE);
    const conv = conversations[0];

    expect(conv.messages[0].role).toBe("user");
    expect(conv.messages[1].role).toBe("assistant");
    expect(conv.messages[2].role).toBe("user");
    expect(conv.messages[3].role).toBe("assistant");
  });

  it("preserves conversation title and externalId", async () => {
    const conversations = await parseClaudeExport(FIXTURE);
    expect(conversations[0].title).toBe("Project architecture discussion");
    expect(conversations[0].externalId).toBe("conv-claude-001");
    expect(conversations[1].title).toBe("Quick question about TypeScript");
    expect(conversations[1].externalId).toBe("conv-claude-002");
  });

  it("parses message timestamps", async () => {
    const conversations = await parseClaudeExport(FIXTURE);
    const msg = conversations[0].messages[0];
    expect(msg.timestamp).toBeInstanceOf(Date);
    expect(msg.timestamp!.toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });

  it("generates deterministic content hashes", async () => {
    const run1 = await parseClaudeExport(FIXTURE);
    const run2 = await parseClaudeExport(FIXTURE);
    expect(run1[0].contentHash).toBe(run2[0].contentHash);
    expect(run1[0].contentHash).toHaveLength(64);
  });

  it("sets sourceDate from conversation created_at", async () => {
    const conversations = await parseClaudeExport(FIXTURE);
    expect(conversations[0].sourceDate).toBeInstanceOf(Date);
    expect(conversations[0].sourceDate!.toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });
});
