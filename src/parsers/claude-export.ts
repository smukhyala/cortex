import { createHash } from "crypto";
import { readFile } from "fs/promises";
import type { NormalizedConversation, NormalizedMessage } from "@/contracts/conversation";

// ─── Claude.ai Export Types ─────────────────────────────────────────────────

interface ClaudeMessage {
  uuid: string;
  text: string;
  sender: "human" | "assistant";
  created_at: string;
  updated_at: string;
}

interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  chat_messages: ClaudeMessage[];
}

// ─── Parser ─────────────────────────────────────────────────────────────────

export async function parseClaudeExport(
  filePath: string
): Promise<NormalizedConversation[]> {
  const raw = await readFile(filePath, "utf-8");
  const conversations: ClaudeConversation[] = JSON.parse(raw);

  return conversations
    .filter((conv) => conv.chat_messages.length > 0)
    .map((conv) => {
      const messages: NormalizedMessage[] = conv.chat_messages.map((msg) => ({
        role: msg.sender === "human" ? "user" : "assistant",
        content: msg.text,
        timestamp: new Date(msg.created_at),
      }));

      const fullText = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
      const contentHash = createHash("sha256").update(fullText).digest("hex");

      return {
        externalId: conv.uuid,
        title: conv.name || null,
        messages,
        contentHash,
        sourceDate: new Date(conv.created_at),
      };
    });
}
