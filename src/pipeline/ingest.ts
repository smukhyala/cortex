import type { NormalizedConversation } from "@/contracts/conversation";
import type { SourceType } from "@/contracts/source";
import { parseChatGPTExport } from "@/parsers/chatgpt";
import { parseClaudeCodeMemory } from "@/parsers/claude-code";
import { parseClaudeExport } from "@/parsers/claude-export";
import { parseClaudeCodeSessions } from "@/integrations/claude/session-parser";
import { parseGranolaNotes } from "@/integrations/granola/parser";
import { prisma } from "@/lib/db";

export interface IngestResult {
  conversations: NormalizedConversation[];
  skipped: number;
}

/**
 * Agent 1: Ingest
 * Routes to the correct parser by source type, then filters out
 * conversations that have already been processed (same contentHash).
 */
export async function ingest(params: {
  sourceId: string;
  sourceType: SourceType;
  filePath: string;
}): Promise<IngestResult> {
  // Parse source file into normalized conversations
  let all: NormalizedConversation[];

  switch (params.sourceType) {
    case "chatgpt_export":
      all = await parseChatGPTExport(params.filePath);
      break;
    case "claude_code": {
      // Parse both memory files AND actual conversation sessions
      const memories = await parseClaudeCodeMemory(params.filePath);
      const sessions = await parseClaudeCodeSessions(params.filePath);
      all = [...memories, ...sessions];
      break;
    }
    case "claude_export":
      all = await parseClaudeExport(params.filePath);
      break;
    case "granola":
      all = await parseGranolaNotes(params.filePath);
      break;
    case "poke":
      // Poke has no read API — this would only work with a manual file upload
      // For now, try to parse as a generic JSON conversation file
      all = await parseClaudeExport(params.filePath);
      break;
    default:
      throw new Error(`Unknown source type: ${params.sourceType}`);
  }

  // Filter out already-processed conversations by contentHash
  const existingHashes = new Set(
    (
      await prisma.conversation.findMany({
        where: { sourceId: params.sourceId },
        select: { contentHash: true },
      })
    ).map((c) => c.contentHash)
  );

  const newConversations: NormalizedConversation[] = [];
  let skipped = 0;

  for (const conv of all) {
    if (existingHashes.has(conv.contentHash)) {
      skipped++;
    } else {
      newConversations.push(conv);
    }
  }

  return {
    conversations: newConversations,
    skipped,
  };
}
