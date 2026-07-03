import { createHash } from "crypto";
import { readFile } from "fs/promises";
import AdmZip from "adm-zip";
import type { NormalizedConversation, NormalizedMessage } from "@/contracts/conversation";

// ─── ChatGPT Export Types ───────────────────────────────────────────────────

interface ChatGPTContent {
  content_type: string;
  parts?: (string | null | Record<string, unknown>)[];
  text?: string;
}

interface ChatGPTMessage {
  id: string;
  author: { role: string; name?: string | null };
  create_time: number | null;
  content: ChatGPTContent;
  status?: string;
}

interface ChatGPTMappingNode {
  id: string;
  message: ChatGPTMessage | null;
  parent: string | null;
  children: string[];
}

interface ChatGPTConversation {
  title: string;
  create_time: number;
  update_time: number;
  conversation_id?: string;
  id?: string;
  current_node?: string;
  mapping: Record<string, ChatGPTMappingNode>;
}

// ─── Content Extraction ─────────────────────────────────────────────────────

function extractTextContent(content: ChatGPTContent): string {
  if (content.text) return content.text;
  if (!content.parts) return "";

  return content.parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n");
}

// ─── Tree Flattening ────────────────────────────────────────────────────────

/**
 * Flatten a ChatGPT conversation tree by walking from current_node
 * back to the root via parent pointers, then reversing.
 * This extracts only the "active" branch the user sees in the UI.
 */
function flattenConversationTree(conv: ChatGPTConversation): NormalizedMessage[] {
  const currentNode = conv.current_node;
  if (!currentNode || !conv.mapping[currentNode]) return [];

  // Walk from current_node up to root, collecting node IDs
  const nodeIds: string[] = [];
  let nodeId: string | null = currentNode;
  while (nodeId) {
    nodeIds.push(nodeId);
    nodeId = conv.mapping[nodeId]?.parent ?? null;
  }

  // Reverse so we go root → leaf
  nodeIds.reverse();

  // Map to messages, filtering out skeleton nodes and empty system messages
  const messages: NormalizedMessage[] = [];
  const fallbackTimestamp = new Date(conv.create_time * 1000);

  for (const id of nodeIds) {
    const node = conv.mapping[id];
    if (!node?.message) continue;

    const msg = node.message;
    const role = msg.author.role;
    if (role !== "user" && role !== "assistant" && role !== "system") continue;

    const content = extractTextContent(msg.content);
    if (!content.trim()) continue;

    // Skip empty system messages
    if (role === "system" && content.trim().length === 0) continue;

    messages.push({
      role: role as "user" | "assistant" | "system",
      content,
      timestamp: msg.create_time ? new Date(msg.create_time * 1000) : fallbackTimestamp,
    });
  }

  return messages;
}

// ─── ZIP Handling ───────────────────────────────────────────────────────────

async function readConversationsFromFile(filePath: string): Promise<ChatGPTConversation[]> {
  if (filePath.endsWith(".zip")) {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();

    // Look for conversations.json inside the ZIP
    const convEntry = entries.find(
      (e) => e.entryName === "conversations.json" || e.entryName.endsWith("/conversations.json")
    );

    if (!convEntry) {
      throw new Error(
        "No conversations.json found in ZIP. ChatGPT exports should contain a conversations.json file."
      );
    }

    const raw = convEntry.getData().toString("utf-8");
    return JSON.parse(raw);
  }

  // Plain JSON file
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

// ─── Main Parser ────────────────────────────────────────────────────────────

export async function parseChatGPTExport(
  filePath: string
): Promise<NormalizedConversation[]> {
  const conversations = await readConversationsFromFile(filePath);

  const results: NormalizedConversation[] = [];

  for (const conv of conversations) {
    const messages = flattenConversationTree(conv);

    // Skip conversations with no meaningful messages (only system msgs or empty)
    const hasMeaningful = messages.some((m) => m.role === "user" || m.role === "assistant");
    if (!hasMeaningful) continue;

    const externalId = conv.conversation_id || conv.id || createHash("sha256")
      .update(conv.title + conv.create_time)
      .digest("hex")
      .slice(0, 16);

    const fullText = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    const contentHash = createHash("sha256").update(fullText).digest("hex");

    results.push({
      externalId,
      title: conv.title || null,
      messages,
      contentHash,
      sourceDate: new Date(conv.create_time * 1000),
    });
  }

  return results;
}
