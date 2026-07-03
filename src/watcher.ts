/**
 * Filesystem watcher for Claude Code directories.
 *
 * Watches CLAUDE.md and MEMORY.md files for changes and triggers
 * a sync via the local API when they change.
 *
 * Usage: npx tsx src/watcher.ts [path-to-watch]
 * Default: watches ~/.claude/
 *
 * This is a lightweight standalone script, not a background daemon.
 * Run it alongside `npm run dev` in a separate terminal.
 */

import { watch, stat } from "fs";
import { resolve, join } from "path";
import { homedir } from "os";

const DEBOUNCE_MS = 2000;
const API_BASE = process.env.CORTEX_API_URL || "http://localhost:3000";

const watchPath = process.argv[2] || join(homedir(), ".claude");
const resolvedPath = resolve(watchPath);

const WATCH_FILES = ["CLAUDE.md", "MEMORY.md"];

let debounceTimer: NodeJS.Timeout | null = null;
let lastSyncTime = 0;

async function triggerSync() {
  const now = Date.now();
  if (now - lastSyncTime < DEBOUNCE_MS) return;
  lastSyncTime = now;

  console.log(`[watcher] Change detected, triggering sync...`);

  try {
    // First, ensure a source exists for this path
    const sourcesRes = await fetch(`${API_BASE}/api/sources`);
    const sources = await sourcesRes.json();

    let source = sources.find(
      (s: { type: string; config: string }) => {
        if (s.type !== "claude_code") return false;
        try {
          const config = JSON.parse(s.config);
          return config.path === resolvedPath;
        } catch {
          return false;
        }
      }
    );

    if (!source) {
      // Create the source
      const createRes = await fetch(`${API_BASE}/api/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "claude_code",
          name: `Claude Code (${resolvedPath})`,
          config: { path: resolvedPath },
        }),
      });
      source = await createRes.json();
      console.log(`[watcher] Created source: ${source.id}`);
    }

    // Trigger sync
    const syncRes = await fetch(`${API_BASE}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: source.id }),
    });

    const result = await syncRes.json();
    if (syncRes.ok) {
      console.log(
        `[watcher] Sync complete: ${result.memoriesExtracted} memories extracted, ${result.reviewItemsCreated} for review`
      );
    } else {
      console.error(`[watcher] Sync failed:`, result.error);
    }
  } catch (error) {
    console.error(`[watcher] Error:`, error);
  }
}

function startWatching() {
  try {
    stat(resolvedPath, (err) => {
      if (err) {
        console.error(`[watcher] Path does not exist: ${resolvedPath}`);
        process.exit(1);
      }
    });
  } catch {
    console.error(`[watcher] Cannot access: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`[watcher] Watching ${resolvedPath} for changes to CLAUDE.md / MEMORY.md`);
  console.log(`[watcher] API: ${API_BASE}`);
  console.log(`[watcher] Debounce: ${DEBOUNCE_MS}ms`);

  watch(resolvedPath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    // Only react to memory files
    const isMemoryFile = WATCH_FILES.some(
      (f) => filename === f || filename.endsWith(`/${f}`)
    );
    if (!isMemoryFile) return;

    console.log(`[watcher] ${eventType}: ${filename}`);

    // Debounce
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerSync, DEBOUNCE_MS);
  });
}

startWatching();
