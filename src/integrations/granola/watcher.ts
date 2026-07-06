/**
 * Filesystem watcher for Granola call notes directory.
 *
 * Watches a configurable directory for new/modified .md files
 * and triggers a Cortex sync when changes are detected.
 *
 * Usage: npx tsx src/integrations/granola/watcher.ts [path-to-watch]
 *
 * Default paths checked (in order):
 *   1. GRANOLA_NOTES_PATH env var
 *   2. ~/Library/Application Support/Granola/
 *   3. ~/Documents/Granola/
 *   4. ~/Granola/
 *
 * This is a lightweight standalone script, not a background daemon.
 * Run it alongside `npm run dev` in a separate terminal.
 */

import { watch, existsSync, statSync } from "fs";
import { resolve, join } from "path";
import { homedir } from "os";

const DEBOUNCE_MS = 3000;
const API_BASE = process.env.CORTEX_API_URL || "http://localhost:3000";

// ─── Path Resolution ─────────────────────────────────────────────────────────

function resolveNotesPath(): string {
  // CLI argument takes precedence
  if (process.argv[2]) {
    return resolve(process.argv[2]);
  }

  // Env var
  if (process.env.GRANOLA_NOTES_PATH) {
    return resolve(process.env.GRANOLA_NOTES_PATH);
  }

  // Check known locations
  const candidates = [
    join(homedir(), "Library", "Application Support", "Granola"),
    join(homedir(), "Documents", "Granola"),
    join(homedir(), "Granola"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Fall back to ~/Documents/Granola (will be created by user)
  return join(homedir(), "Documents", "Granola");
}

const watchPath = resolveNotesPath();

// ─── Debounce & Sync ─────────────────────────────────────────────────────────

let debounceTimer: NodeJS.Timeout | null = null;
let lastSyncTime = 0;

async function triggerSync() {
  const now = Date.now();
  if (now - lastSyncTime < DEBOUNCE_MS) return;
  lastSyncTime = now;

  console.log(`[granola-watcher] Change detected, triggering sync...`);

  try {
    // Ensure a source exists for this path
    const sourcesRes = await fetch(`${API_BASE}/api/sources`);
    const sources = await sourcesRes.json();

    let source = sources.find(
      (s: { type: string; config: string }) => {
        if (s.type !== "granola") return false;
        try {
          const config = JSON.parse(s.config);
          return config.path === watchPath;
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
          type: "granola",
          name: `Granola Notes (${watchPath})`,
          config: { path: watchPath },
        }),
      });
      source = await createRes.json();
      console.log(`[granola-watcher] Created source: ${source.id}`);
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
        `[granola-watcher] Sync complete: ${result.memoriesExtracted} memories extracted, ${result.reviewItemsCreated} for review`
      );
    } else {
      console.error(`[granola-watcher] Sync failed:`, result.error);
    }
  } catch (error) {
    console.error(`[granola-watcher] Error:`, error);
  }
}

// ─── Watcher ─────────────────────────────────────────────────────────────────

function startWatching() {
  if (!existsSync(watchPath)) {
    console.error(`[granola-watcher] Path does not exist: ${watchPath}`);
    console.error(
      `[granola-watcher] Create the directory or set GRANOLA_NOTES_PATH to point to your Granola notes folder.`
    );
    process.exit(1);
  }

  try {
    const s = statSync(watchPath);
    if (!s.isDirectory()) {
      console.error(
        `[granola-watcher] Path is not a directory: ${watchPath}`
      );
      process.exit(1);
    }
  } catch {
    console.error(`[granola-watcher] Cannot access: ${watchPath}`);
    process.exit(1);
  }

  console.log(`[granola-watcher] Watching ${watchPath} for .md changes`);
  console.log(`[granola-watcher] API: ${API_BASE}`);
  console.log(`[granola-watcher] Debounce: ${DEBOUNCE_MS}ms`);

  watch(watchPath, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    // Only react to markdown files
    const isMarkdown =
      filename.endsWith(".md") || filename.endsWith(".markdown");
    if (!isMarkdown) return;

    // Skip hidden files and temp files
    if (filename.startsWith(".") || filename.includes("/.")) return;
    if (filename.endsWith(".tmp") || filename.endsWith("~")) return;

    console.log(`[granola-watcher] ${eventType}: ${filename}`);

    // Debounce
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerSync, DEBOUNCE_MS);
  });
}

startWatching();
