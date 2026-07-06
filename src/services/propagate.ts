import path from "path";
import fs from "fs";
import { prisma } from "@/lib/db";
import { pushToPoke } from "@/exporters/poke";
import { writeClaudeExport } from "@/exporters/claude";
import { formatForChatGPT } from "@/exporters/chatgpt";

interface PropagationResult {
  destinations: Array<{
    type: string;
    name: string;
    success: boolean;
    error?: string;
  }>;
  chatgptText?: string; // ChatGPT doesn't have write-back, so return text for user to copy
}

export async function propagateToAllPlatforms(): Promise<PropagationResult> {
  const memories = await prisma.memory.findMany({
    where: { status: "active" },
    select: { content: true, category: true, sensitive: true },
  });

  const sources = await prisma.source.findMany({
    where: { status: "active" },
  });

  const results: PropagationResult = { destinations: [] };
  const startTime = Date.now();

  // Claude Code sources — write to CLAUDE.md
  const claudeCodeSources = sources.filter((s) => s.type === "claude_code");
  for (const source of claudeCodeSources) {
    try {
      const config = JSON.parse(source.config || "{}");
      let filePath = config.filePath || config.path;
      if (filePath) {
        // If the path is a directory, resolve to CLAUDE.md inside it
        try {
          if (fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, "CLAUDE.md");
          }
        } catch {
          // Path doesn't exist yet — assume it's a file path
        }
        await writeClaudeExport(filePath, memories);
        results.destinations.push({
          type: "claude_code",
          name: source.name,
          success: true,
        });
        await prisma.exportLog.create({
          data: {
            destination: "claude_code",
            status: "success",
            memoriesCount: memories.length,
            durationMs: Date.now() - startTime,
          },
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.destinations.push({
        type: "claude_code",
        name: source.name,
        success: false,
        error: msg,
      });
      await prisma.exportLog.create({
        data: {
          destination: "claude_code",
          status: "failed",
          memoriesCount: memories.length,
          errorMessage: msg,
          durationMs: Date.now() - startTime,
        },
      });
    }
  }

  // Poke — push via API
  const pokeApiKey = process.env.POKE_API_KEY;
  if (pokeApiKey) {
    try {
      const result = await pushToPoke(memories, pokeApiKey);
      results.destinations.push({
        type: "poke",
        name: "Poke",
        success: result.success,
        error: result.error,
      });
      await prisma.exportLog.create({
        data: {
          destination: "poke",
          status: result.success ? "success" : "failed",
          memoriesCount: memories.length,
          errorMessage: result.error || null,
          durationMs: Date.now() - startTime,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.destinations.push({
        type: "poke",
        name: "Poke",
        success: false,
        error: msg,
      });
    }
  }

  // ChatGPT — generate text (no write-back API)
  const chatgptSources = sources.filter((s) => s.type === "chatgpt_export");
  if (chatgptSources.length > 0) {
    results.chatgptText = formatForChatGPT(memories);
    results.destinations.push({
      type: "chatgpt_export",
      name: "ChatGPT",
      success: true,
    });
  }

  // Log activity
  const successCount = results.destinations.filter((d) => d.success).length;
  await prisma.activityLog.create({
    data: {
      action: "propagation_completed",
      summary: `Propagated ${memories.length} memories to ${successCount}/${results.destinations.length} destinations`,
      details: JSON.stringify(results),
    },
  });

  return results;
}
