import type { NormalizedConversation } from "@/contracts/conversation";
import type { SourceType } from "@/contracts/source";
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
    case "chatgpt_export": {
      const { parseChatGPTExport } = await import("@/parsers/chatgpt");
      all = await parseChatGPTExport(params.filePath);
      break;
    }
    case "claude_code": {
      const { parseClaudeCodeMemory } = await import("@/parsers/claude-code");
      const { parseClaudeCodeSessions } = await import("@/integrations/claude/session-parser");
      // Parse both memory files AND actual conversation sessions
      const memories = await parseClaudeCodeMemory(params.filePath);
      const sessions = await parseClaudeCodeSessions(params.filePath);
      all = [...memories, ...sessions];
      break;
    }
    case "claude_export": {
      const { parseClaudeExport } = await import("@/parsers/claude-export");
      all = await parseClaudeExport(params.filePath);
      break;
    }
    case "granola": {
      const { parseGranolaNotes } = await import("@/integrations/granola/parser");
      all = await parseGranolaNotes(params.filePath);
      break;
    }
    case "poke":
      // Poke has no read API — this would only work with a manual file upload
      // For now, try to parse as a generic JSON conversation file
      const { parseClaudeExport } = await import("@/parsers/claude-export");
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
