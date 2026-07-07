import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { homedir } from "os";
import { formatMemoryToolCatalog } from "@/contracts/memory-routing";

export const CORTEX_BOOTSTRAP_BEGIN = "<!-- cortex:bootstrap:begin -->";
export const CORTEX_BOOTSTRAP_END = "<!-- cortex:bootstrap:end -->";

export function formatBootstrapInstructions(): string {
  return [
    CORTEX_BOOTSTRAP_BEGIN,
    "## Cortex Default Context",
    "",
    "- At the start of a new conversation or coding session, call `cortex_get_context` to load the user's latest Cortex context.",
    "- Before answering any memory-sensitive question about the user, call `cortex_get_relevant_memories` with the user's exact question.",
    "- Before answering any personal question about what the user would choose, name, prefer, like, dislike, remember, build, study, write, or do, call `cortex_answer_personal_question` first.",
    "- If you are unsure what kind of context Cortex has for the user, call `cortex_get_memory_map`, then call the matching category tool.",
    "- For focused lookups, call `cortex_search_memories` or one of these category tools:",
    formatMemoryToolCatalog(),
    "- When the user states a durable fact about themselves, call `cortex_log_context` or `cortex_save_conversation` so Cortex can update every connected assistant.",
    "- Treat Cortex as the authoritative memory layer and prefer Cortex facts over older local recollections.",
    CORTEX_BOOTSTRAP_END,
  ].join("\n");
}

export function stripBootstrapBlocks(content: string): string {
  let next = content;
  while (true) {
    const begin = next.indexOf(CORTEX_BOOTSTRAP_BEGIN);
    const end = next.indexOf(CORTEX_BOOTSTRAP_END);
    if (begin === -1 || end === -1 || end < begin) return next;
    next = `${next.slice(0, begin)}${next.slice(end + CORTEX_BOOTSTRAP_END.length)}`;
  }
}

export async function writeClaudeBootstrap(filePath: string): Promise<void> {
  let existing = "";
  try {
    existing = await readFile(/* turbopackIgnore: true */ filePath, "utf-8");
  } catch {
    // Missing file is fine; create it below.
  }

  const bootstrap = formatBootstrapInstructions();
  const stripped = stripBootstrapBlocks(existing).trimEnd();
  const content = stripped ? `${stripped}\n\n${bootstrap}\n` : `${bootstrap}\n`;

  await mkdir(/* turbopackIgnore: true */ path.dirname(filePath), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ filePath, content, "utf-8");
}

async function readClaudeDesktopUserFilesPath(homeDir = homedir()): Promise<string | null> {
  const configPath = path.join(
    homeDir,
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json"
  );

  try {
    const raw = await readFile(/* turbopackIgnore: true */ configPath, "utf-8");
    const parsed = JSON.parse(raw) as { coworkUserFilesPath?: unknown };
    return typeof parsed.coworkUserFilesPath === "string"
      ? parsed.coworkUserFilesPath
      : null;
  } catch {
    return null;
  }
}

export async function getClaudeBootstrapPaths(homeDir = homedir()): Promise<string[]> {
  const paths = new Set<string>();
  paths.add(path.join(homeDir, ".claude", "CLAUDE.md"));

  const desktopUserFilesPath = await readClaudeDesktopUserFilesPath(homeDir);
  if (desktopUserFilesPath) {
    paths.add(path.join(desktopUserFilesPath, "CLAUDE.md"));
  }

  return Array.from(paths);
}

export async function writeAllClaudeBootstraps(homeDir = homedir()): Promise<Array<{
  path: string;
  installed: boolean;
  error?: string;
}>> {
  const paths = await getClaudeBootstrapPaths(homeDir);
  const results: Array<{ path: string; installed: boolean; error?: string }> = [];

  for (const filePath of paths) {
    try {
      await writeClaudeBootstrap(filePath);
      results.push({ path: filePath, installed: true });
    } catch (error) {
      results.push({
        path: filePath,
        installed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
