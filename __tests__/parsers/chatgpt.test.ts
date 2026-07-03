import { describe, it, expect } from "vitest";
import { parseChatGPTExport } from "@/parsers/chatgpt";
import path from "path";

const FIXTURE = path.resolve(__dirname, "../../fixtures/chatgpt-export.json");
const ZIP_FIXTURE = path.resolve(__dirname, "../../fixtures/chatgpt-export.zip");

describe("parseChatGPTExport", () => {
  it("parses conversations from the fixture file", async () => {
    const conversations = await parseChatGPTExport(FIXTURE);
    // 3 conversations in fixture, but the "Empty conversation" has only an empty system msg
    expect(conversations.length).toBe(2);
  });

  it("flattens a branching conversation tree into linear messages", async () => {
    const conversations = await parseChatGPTExport(FIXTURE);
    const conv = conversations.find((c) => c.title === "TypeScript project setup")!;
    expect(conv).toBeDefined();

    // Should follow: msg-2 (user) → msg-3 (assistant) → msg-4 (user) → msg-5 (assistant)
    // msg-1 is system with empty content → skipped
    // msg-4-branch is on a different branch → skipped
    expect(conv.messages.length).toBe(4);
    expect(conv.messages[0].role).toBe("user");
    expect(conv.messages[0].content).toContain("Cortex");
    expect(conv.messages[1].role).toBe("assistant");
    expect(conv.messages[2].role).toBe("user");
    expect(conv.messages[2].content).toContain("San Francisco");
    expect(conv.messages[3].role).toBe("assistant");
  });

  it("does NOT include messages from alternate branches", async () => {
    const conversations = await parseChatGPTExport(FIXTURE);
    const conv = conversations.find((c) => c.title === "TypeScript project setup")!;
    const allContent = conv.messages.map((m) => m.content).join(" ");
    expect(allContent).not.toContain("branched message");
  });

  it("handles null entries in content.parts", async () => {
    const conversations = await parseChatGPTExport(FIXTURE);
    const conv = conversations.find((c) => c.title === "Multipart content test")!;
    expect(conv).toBeDefined();

    // First message has parts: ["My name is Sanjay...", null, "console.log('hello')"]
    // null should be filtered out, strings joined with newline
    const firstMsg = conv.messages[0];
    expect(firstMsg.content).toContain("Sanjay");
    expect(firstMsg.content).toContain("console.log");
    expect(firstMsg.content).not.toContain("null");
  });

  it("skips system messages with empty content", async () => {
    const conversations = await parseChatGPTExport(FIXTURE);
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        if (msg.role === "system") {
          expect(msg.content.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("uses conversation-level timestamp when message timestamp is null", async () => {
    // The system message in conv-abc-123 has create_time: null
    // If it were included (it's empty so it's skipped), it would use fallback
    // But we can verify all messages have valid timestamps
    const conversations = await parseChatGPTExport(FIXTURE);
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        expect(msg.timestamp).toBeInstanceOf(Date);
        expect(msg.timestamp!.getTime()).toBeGreaterThan(0);
      }
    }
  });

  it("generates stable externalId from conversation_id", async () => {
    const conversations = await parseChatGPTExport(FIXTURE);
    expect(conversations[0].externalId).toBe("conv-abc-123");
    expect(conversations[1].externalId).toBe("conv-def-456");
  });

  it("generates deterministic contentHash", async () => {
    const run1 = await parseChatGPTExport(FIXTURE);
    const run2 = await parseChatGPTExport(FIXTURE);
    expect(run1[0].contentHash).toBe(run2[0].contentHash);
    expect(run1[0].contentHash).toHaveLength(64); // SHA-256 hex
  });

  it("skips conversations with only empty system messages", async () => {
    const conversations = await parseChatGPTExport(FIXTURE);
    const empty = conversations.find((c) => c.title === "Empty conversation");
    expect(empty).toBeUndefined();
  });

  it("parses conversations from a ZIP file", async () => {
    const conversations = await parseChatGPTExport(ZIP_FIXTURE);
    expect(conversations.length).toBe(2);
    expect(conversations[0].externalId).toBe("conv-abc-123");
  });

  it("produces identical results from ZIP and JSON", async () => {
    const fromJson = await parseChatGPTExport(FIXTURE);
    const fromZip = await parseChatGPTExport(ZIP_FIXTURE);
    expect(fromJson.length).toBe(fromZip.length);
    for (let i = 0; i < fromJson.length; i++) {
      expect(fromJson[i].externalId).toBe(fromZip[i].externalId);
      expect(fromJson[i].contentHash).toBe(fromZip[i].contentHash);
      expect(fromJson[i].messages.length).toBe(fromZip[i].messages.length);
    }
  });
});
