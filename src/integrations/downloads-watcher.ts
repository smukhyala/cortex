/**
 * Downloads folder watcher for auto-importing ChatGPT and Claude exports.
 *
 * Watches ~/Downloads/ for new files matching known export patterns:
 *   - *.zip (ChatGPT exports come as ZIP)
 *   - *conversations*.json (Claude.ai exports)
 *   - *chatgpt*.json or *openai*.json
 *   - data-*.json
 *
 * When a matching file appears, it auto-detects the format via content
 * inspection, copies it to data/uploads/ for archival, and POSTs to
 * /api/upload to trigger the full pipeline.
 *
 * Usage: npx tsx src/integrations/downloads-watcher.ts [path-to-watch]
 * Default: watches ~/Downloads/
 *
 * This is a lightweight standalone script, not a background daemon.
 * Run it alongside `npm run dev` in a separate terminal.
 */

import { watch, existsSync, statSync, readFileSync, copyFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve, join, basename, extname } from "path";
import { homedir } from "os";
import { createHash } from "crypto";

const DEBOUNCE_MS = 3000;
const API_BASE = process.env.CORTEX_API_URL || "http://localhost:3000";
const UPLOAD_DIR = resolve(process.cwd(), "data/uploads");
const STATE_FILE = resolve(process.cwd(), "data/.downloads-watcher-state.json");

// ─── Path Resolution ─────────────────────────────────────────────────────────

function resolveWatchPath(): string {
  if (process.argv[2]) {
    return resolve(process.argv[2]);
  }

  if (process.env.DOWNLOADS_WATCH_PATH) {
    return resolve(process.env.DOWNLOADS_WATCH_PATH);
  }

  return join(homedir(), "Downloads");
}

const watchPath = resolveWatchPath();

// ─── File Pattern Matching ───────────────────────────────────────────────────

/**
 * Check if a filename matches known ChatGPT/Claude export patterns.
 * Only matches files in the top-level directory (not subdirectories).
 */
function isExportFile(filename: string): boolean {
  // Only handle top-level files, skip subdirectory contents
  if (filename.includes("/") || filename.includes("\\")) return false;

  // Skip hidden files, temp files, partial downloads
  if (filename.startsWith(".")) return false;
  if (filename.endsWith(".tmp") || filename.endsWith("~")) return false;
  if (filename.endsWith(".crdownload") || filename.endsWith(".part")) return false;

  const lower = filename.toLowerCase();

  // ZIP files (ChatGPT exports come as ZIP)
  if (lower.endsWith(".zip")) return true;

  // JSON files with conversation-related names
  if (lower.endsWith(".json")) {
    if (lower.includes("conversations")) return true;
    if (lower.includes("chatgpt")) return true;
    if (lower.includes("openai")) return true;
    if (lower.startsWith("data-")) return true;
  }

  return false;
}

// ─── Content-Based Format Detection ──────────────────────────────────────────

type DetectedFormat = "chatgpt_export" | "claude_export" | null;

/**
 * Detect whether a file is a ChatGPT or Claude export by inspecting content.
 * Returns null if the file does not match any known format.
 */
function detectFormat(filePath: string): DetectedFormat {
  try {
    const buffer = readFileSync(filePath);

    // ZIP magic bytes -> ChatGPT export
    if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
      return "chatgpt_export";
    }

    // Try parsing as JSON
    const text = buffer.toString("utf-8");
    const parsed = JSON.parse(text);

    const sample = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!sample || typeof sample !== "object") return null;

    // Claude.ai export: has uuid + chat_messages
    if ("uuid" in sample && "chat_messages" in sample) {
      return "claude_export";
    }

    // ChatGPT export: has mapping + current_node (tree structure)
    if ("mapping" in sample && "current_node" in sample) {
      return "chatgpt_export";
    }

    // ChatGPT export: has title + mapping (alternate structure)
    if ("title" in sample && "mapping" in sample) {
      return "chatgpt_export";
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Processed Files State ───────────────────────────────────────────────────

interface WatcherState {
  processedHashes: string[];
}

function loadState(): WatcherState {
  try {
    if (existsSync(STATE_FILE)) {
      const data = readFileSync(STATE_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch {
    // Corrupt state file, start fresh
  }
  return { processedHashes: [] };
}

function saveState(state: WatcherState): void {
  try {
    mkdirSync(resolve(STATE_FILE, ".."), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error("[downloads-watcher] Failed to save state:", error);
  }
}

function fileHash(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

const state = loadState();

// ─── Upload to Cortex ────────────────────────────────────────────────────────

/**
 * Copy the file to data/uploads/ and POST to /api/upload.
 */
async function processFile(filePath: string, format: DetectedFormat): Promise<void> {
  const name = basename(filePath);

  // Check if already processed via content hash
  const hash = fileHash(filePath);
  if (state.processedHashes.includes(hash)) {
    console.log(`[downloads-watcher] Already processed (same content): ${name}`);
    return;
  }

  console.log(`[downloads-watcher] Detected ${format} export: ${name}`);

  try {
    // Copy to data/uploads/ for archival
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const archiveName = `${format}-${Date.now()}${extname(name)}`;
    const archivePath = join(UPLOAD_DIR, archiveName);
    copyFileSync(filePath, archivePath);
    console.log(`[downloads-watcher] Archived to ${archivePath}`);

    // POST to /api/upload as multipart form data
    const fileBuffer = readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: "application/octet-stream" });
    const formData = new FormData();
    formData.append("file", blob, name);
    formData.append("sourceType", format!);
    formData.append("sourceName", `${format} (auto-imported)`);

    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      body: formData,
    });

    const result = await res.json();

    if (res.ok) {
      if (result.skipped) {
        console.log(`[downloads-watcher] Server says already processed: ${name}`);
      } else {
        console.log(
          `[downloads-watcher] Pipeline complete: ${result.memoriesExtracted ?? 0} memories extracted, ${result.reviewItemsCreated ?? 0} for review`
        );
      }

      // Mark as processed
      state.processedHashes.push(hash);
      // Keep state file reasonable (last 500 hashes)
      if (state.processedHashes.length > 500) {
        state.processedHashes = state.processedHashes.slice(-500);
      }
      saveState(state);
    } else {
      console.error(`[downloads-watcher] Upload failed:`, result.error || result);
    }
  } catch (error) {
    console.error(`[downloads-watcher] Error processing ${name}:`, error);
  }
}

// ─── Per-File Debounce ───────────────────────────────────────────────────────

const pendingFiles = new Map<string, NodeJS.Timeout>();

/**
 * Schedule processing of a file after DEBOUNCE_MS.
 * Downloads may still be in progress, so we wait before reading.
 */
function scheduleProcessing(filename: string): void {
  const filePath = join(watchPath, filename);

  // Clear any existing timer for this file
  const existing = pendingFiles.get(filename);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingFiles.delete(filename);

    // Verify file still exists (may have been moved/deleted)
    if (!existsSync(filePath)) {
      console.log(`[downloads-watcher] File no longer exists: ${filename}`);
      return;
    }

    // Verify file is not still being written (check size stability)
    try {
      const size1 = statSync(filePath).size;
      await new Promise((r) => setTimeout(r, 500));
      if (!existsSync(filePath)) return;
      const size2 = statSync(filePath).size;
      if (size1 !== size2) {
        // File still changing, reschedule
        console.log(`[downloads-watcher] File still downloading: ${filename}, rescheduling...`);
        scheduleProcessing(filename);
        return;
      }
    } catch {
      return;
    }

    // Detect format via content inspection
    const format = detectFormat(filePath);
    if (!format) {
      // File matched name pattern but content is not a known export format
      return;
    }

    await processFile(filePath, format);
  }, DEBOUNCE_MS);

  pendingFiles.set(filename, timer);
}

// ─── Watcher ─────────────────────────────────────────────────────────────────

function startWatching(): void {
  if (!existsSync(watchPath)) {
    console.error(`[downloads-watcher] Path does not exist: ${watchPath}`);
    console.error(
      `[downloads-watcher] Set DOWNLOADS_WATCH_PATH or pass a path as argument.`
    );
    process.exit(1);
  }

  try {
    const s = statSync(watchPath);
    if (!s.isDirectory()) {
      console.error(`[downloads-watcher] Path is not a directory: ${watchPath}`);
      process.exit(1);
    }
  } catch {
    console.error(`[downloads-watcher] Cannot access: ${watchPath}`);
    process.exit(1);
  }

  console.log(`[downloads-watcher] Watching ${watchPath} for ChatGPT/Claude exports`);
  console.log(`[downloads-watcher] Patterns: *.zip, *conversations*.json, *chatgpt*.json, *openai*.json, data-*.json`);
  console.log(`[downloads-watcher] API: ${API_BASE}`);
  console.log(`[downloads-watcher] Debounce: ${DEBOUNCE_MS}ms (waits for download to finish)`);
  console.log(`[downloads-watcher] Tip: Also run 'npm run watch:claude' for Claude Code auto-sync`);
  console.log();

  watch(watchPath, { recursive: false }, (eventType, filename) => {
    if (!filename) return;
    if (eventType !== "rename" && eventType !== "change") return;

    if (!isExportFile(filename)) return;

    console.log(`[downloads-watcher] ${eventType}: ${filename}`);
    scheduleProcessing(filename);
  });
}

startWatching();
