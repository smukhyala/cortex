import { createHash } from "crypto";
import { readFile, readdir, stat } from "fs/promises";
import { join, basename } from "path";
import type { NormalizedConversation, NormalizedMessage } from "@/contracts/conversation";

interface JsonlMessage {
  type: string;
  parentUuid?: string | null;
  isSidechain?: boolean;
  isMeta?: boolean;
  customTitle?: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string; thinking?: string; [key: string]: unknown }>;
  };
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
}

/**
 * Parse Claude Code session .jsonl files into normalized conversations.
 * These files contain the actual conversation logs from Claude Code sessions.
 *
 * Handles the on-disk layout:
 *   ~/.claude/projects/<project>/           — top-level session .jsonl files
 *   ~/.claude/projects/<project>/<uuid>/subagents/  — subagent .jsonl files (skipped)
 */
export async function parseClaudeCodeSessions(
  claudeDir: string
): Promise<NormalizedConversation[]> {
  const projectsDir = join(claudeDir, "projects");
  const results: NormalizedConversation[] = [];

  try {
    const projectDirs = await readdir(projectsDir);

    for (const projDir of projectDirs) {
      const projPath = join(projectsDir, projDir);
      const projStat = await stat(projPath);
      if (!projStat.isDirectory()) continue;

      // Find all .jsonl files directly in this project directory
      // (These are the main session files; subagent files in subdirs are skipped
      // because they are tool-focused and rarely contain extractable user context.)
      const entries = await readdir(projPath);
      const jsonlFiles = entries.filter((f) => f.endsWith(".jsonl"));

      for (const jsonlFile of jsonlFiles) {
        const filePath = join(projPath, jsonlFile);
        try {
          const conv = await parseSessionFile(filePath, projDir);
          if (conv && conv.messages.length >= 2) {
            results.push(conv);
          }
        } catch {
          // Skip unparseable files
        }
      }
    }
  } catch {
    // No projects directory — not an error, just no sessions to parse
  }

  return results;
}

async function parseSessionFile(
  filePath: string,
  projectName: string
): Promise<NormalizedConversation | null> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.trim().split("\n");

  if (lines.length < 3) return null;

  const messages: NormalizedMessage[] = [];
  let sessionTitle: string | null = null;
  let earliestTimestamp: string | null = null;

  for (const line of lines) {
    let obj: JsonlMessage;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    // Grab custom title if available (format: {"type":"custom-title","customTitle":"..."})
    if (obj.type === "custom-title" && obj.customTitle) {
      sessionTitle = obj.customTitle;
    }

    // Only process main-thread user and assistant messages
    if (obj.type !== "user" && obj.type !== "assistant") continue;
    if (obj.isSidechain) continue;
    if (obj.isMeta) continue;

    const msg = obj.message;
    if (!msg) continue;

    // Extract text content
    let textContent = "";
    if (typeof msg.content === "string") {
      textContent = msg.content;
    } else if (Array.isArray(msg.content)) {
      textContent = msg.content
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text!)
        .join("\n");
    }

    // Skip empty, command, or system-generated messages
    if (!textContent.trim()) continue;
    if (textContent.startsWith("<local-command")) continue;
    if (textContent.startsWith("<command-name>")) continue;
    if (textContent.startsWith("<available-deferred-tools>")) continue;
    if (textContent.trim() === "[Request interrupted by user]") continue;

    // Strip XML tags from user messages (system reminders, tool artifacts, etc.)
    textContent = textContent.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").trim();
    textContent = textContent.replace(/<task-notification>[\s\S]*?<\/task-notification>/g, "").trim();
    textContent = textContent.replace(/<available-deferred-tools>[\s\S]*?<\/available-deferred-tools>/g, "").trim();

    if (!textContent || textContent.length < 10) continue;

    // Track timestamp
    if (obj.timestamp && !earliestTimestamp) {
      earliestTimestamp = obj.timestamp;
    }

    messages.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: textContent.slice(0, 8000),
      timestamp: obj.timestamp ? new Date(obj.timestamp) : null,
    });
  }

  if (messages.length < 2) return null;

  const sessionId = basename(filePath, ".jsonl");
  const contentHash = createHash("sha256").update(content).digest("hex");
  const friendlyProject = projectName.replace(/-/g, "/").replace(/^\/Users\//, "~/");

  return {
    externalId: `claude-session:${sessionId.slice(0, 12)}`,
    title: sessionTitle || `Claude Code Session (${friendlyProject})`,
    messages: messages.slice(0, 50), // Limit messages to avoid huge LLM calls
    contentHash,
    sourceDate: earliestTimestamp ? new Date(earliestTimestamp) : null,
  };
}
