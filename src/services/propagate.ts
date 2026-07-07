import path from "path";
import fs from "fs";
import { prisma } from "@/lib/db";
import { pushToPoke } from "@/exporters/poke";
import { writeClaudeExport } from "@/exporters/claude";
import { formatForChatGPT } from "@/exporters/chatgpt";
import { filterMemoriesForDestination, getExchangePolicy } from "@/services/exchange-policy";

interface PropagationResult {
  destinations: Array<{
    type: string;
    name: string;
    success: boolean;
    error?: string;
  }>;
  chatgptText?: string; // ChatGPT doesn't have write-back, so return text for user to copy
}

interface PropagationOptions {
  pokeMessage?: string;
  pokeMetadata?: Record<string, unknown>;
  pokeRunId?: string;
  skipDestinations?: string[];
  onlyDestinations?: string[];
}

function readConfig(config: string | null | undefined): Record<string, unknown> {
  try {
    return JSON.parse(config || "{}");
  } catch {
    return {};
  }
}

function isDirectory(filePath: string): boolean {
  return fs.statSync(/* turbopackIgnore: true */ filePath).isDirectory();
}

function getPokeKeyKind(apiKey: string): "legacy_pk" | "v2" {
  return apiKey.startsWith("pk_") ? "legacy_pk" : "v2";
}

function targetedCategory(options: PropagationOptions): string | null {
  const category = options.pokeMetadata?.category;
  return typeof category === "string" ? category : null;
}

export async function propagateToAllPlatforms(
  options: PropagationOptions = {}
): Promise<PropagationResult> {
  const memories = await prisma.memory.findMany({
    where: { status: "active" },
    select: {
      content: true,
      category: true,
      sensitive: true,
      referenceCount: true,
      lastReferencedAt: true,
    },
  });

  const sources = await prisma.source.findMany({
    where: { status: "active" },
  });

  const results: PropagationResult = { destinations: [] };
  const startTime = Date.now();
  const skipDestinations = new Set(options.skipDestinations ?? []);
  const onlyDestinations = options.onlyDestinations ? new Set(options.onlyDestinations) : null;

  // Claude Code sources — write to CLAUDE.md
  const claudeCodeSources = sources.filter((s) => s.type === "claude_code");
  for (const source of claudeCodeSources) {
    if (skipDestinations.has("claude_code")) continue;
    if (onlyDestinations && !onlyDestinations.has("claude_code")) continue;
    try {
      const policy = getExchangePolicy(source.config, "claude_code");
      const destinationMemories = filterMemoriesForDestination(memories, policy);
      const config = readConfig(source.config);
      const configuredPath = config.filePath || config.path;
      if (typeof configuredPath === "string") {
        let filePath = configuredPath;
        // If the path is a directory, resolve to CLAUDE.md inside it
        try {
          if (isDirectory(filePath)) {
            filePath = path.join(filePath, "CLAUDE.md");
          }
        } catch {
          // Path doesn't exist yet — assume it's a file path
        }
        await writeClaudeExport(filePath, destinationMemories);
        results.destinations.push({
          type: "claude_code",
          name: source.name,
          success: true,
        });
        await prisma.exportLog.create({
          data: {
            destination: "claude_code",
            status: "success",
            memoriesCount: destinationMemories.length,
            details: JSON.stringify({
              target: source.name,
              policy,
              filteredOut: memories.length - destinationMemories.length,
            }),
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

  // Poke — push via API. Prefer configured Poke sources, fall back to env.
  const pokeSources = sources.filter((s) => s.type === "poke");
  const pokeTargets = pokeSources
    .map((source) => {
      const apiKey = readConfig(source.config).apiKey;
      return typeof apiKey === "string" && apiKey.length > 0
        ? { name: source.name, apiKey, config: source.config }
        : null;
    })
    .filter((target): target is { name: string; apiKey: string; config: string } => target !== null);

  if (pokeTargets.length === 0 && process.env.POKE_API_KEY) {
    pokeTargets.push({ name: "Poke", apiKey: process.env.POKE_API_KEY, config: "{}" });
  }

  for (const target of pokeTargets) {
    if (skipDestinations.has("poke")) continue;
    if (onlyDestinations && !onlyDestinations.has("poke")) continue;
    try {
      const policy = getExchangePolicy(target.config, "poke");
      const destinationMemories = filterMemoriesForDestination(memories, policy);
      const targetCategory = targetedCategory(options);
      if (
        options.pokeMessage &&
        targetCategory &&
        filterMemoriesForDestination([{ category: targetCategory, sensitive: false }], policy).length === 0
      ) {
        results.destinations.push({
          type: "poke",
          name: target.name,
          success: true,
        });
        await prisma.exportLog.create({
          data: {
            destination: "poke",
            status: "success",
            memoriesCount: 0,
            details: JSON.stringify({
              target: target.name,
              policy,
              skipped: true,
              reason: `Category "${targetCategory}" is blocked by exchange policy.`,
            }),
            durationMs: Date.now() - startTime,
          },
        });
        continue;
      }
      const result = await pushToPoke(destinationMemories, target.apiKey, {
        message: options.pokeMessage,
        metadata: options.pokeMetadata,
        runId: options.pokeRunId,
      });
      results.destinations.push({
        type: "poke",
        name: target.name,
        success: result.success,
        error: result.error,
      });
      await prisma.exportLog.create({
        data: {
          destination: "poke",
          status: result.success ? "success" : "failed",
          memoriesCount: destinationMemories.length,
          errorMessage: result.error || null,
          details: JSON.stringify({
            target: target.name,
            policy,
            filteredOut: memories.length - destinationMemories.length,
            endpoint: result.endpoint,
            httpStatus: result.httpStatus,
            responseSnippet: result.responseSnippet,
            keyKind: getPokeKeyKind(target.apiKey),
            note: result.success
              ? "Poke API accepted the request. Delivery/processing is controlled by Poke."
              : undefined,
          }),
          durationMs: Date.now() - startTime,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      results.destinations.push({
        type: "poke",
        name: target.name,
        success: false,
        error: msg,
      });
      await prisma.exportLog.create({
        data: {
          destination: "poke",
          status: "failed",
          memoriesCount: memories.length,
          errorMessage: msg,
          details: JSON.stringify({ target: target.name }),
          durationMs: Date.now() - startTime,
        },
      });
    }
  }

  // ChatGPT — generate text (no write-back API)
  const chatgptSources = sources.filter((s) => s.type === "chatgpt_export");
  if (
    chatgptSources.length > 0 &&
    !skipDestinations.has("chatgpt_export") &&
    (!onlyDestinations || onlyDestinations.has("chatgpt_export"))
  ) {
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
