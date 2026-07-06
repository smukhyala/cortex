import { createHash } from "crypto";
import { readFile } from "fs/promises";
import type { NormalizedConversation, NormalizedMessage } from "@/contracts/conversation";

// ─── Claude.ai Export Types ─────────────────────────────────────────────────

interface ClaudeContentBlock {
  type: string;
  text?: string;
}

interface ClaudeMessage {
  uuid: string;
  text: string;
  content?: ClaudeContentBlock[];
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

/** Extract text from a Claude message, falling back to content blocks if text is empty */
function extractMessageText(msg: ClaudeMessage): string {
  if (msg.text && msg.text.trim()) return msg.text;
  if (msg.content && msg.content.length > 0) {
    return msg.content
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
  }
  return msg.text || "";
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
        content: extractMessageText(msg),
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
