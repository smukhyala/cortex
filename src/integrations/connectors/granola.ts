import { createHash } from "crypto";
import { readdir, readFile, stat } from "fs/promises";
import { join, extname, basename } from "path";
import type { Connector, ConnectorDefinition, ConfigField, ScanResult, ScannedItem } from "./types";

// ─── Granola Connector ──────────────────────────────────────────────────────
//
// Scans Granola meeting notes stored as markdown files in a local directory.
// Granola (granola.ai) records meetings and produces structured notes with
// transcripts, summaries, and action items.
//
// This connector reads the markdown files directly from disk — no API needed.
// Each .md file is treated as one "conversation" (meeting) for the extraction
// pipeline to process.
//
// Expected file structure:
//   ~/Documents/Granola/
//     2024-06-15 - Product Sync.md
//     2024-06-14 - Investor Call.md
//     ...
//
// The connector parses these markdown files and extracts:
//   - Meeting title (from filename or first heading)
//   - Date (from filename or file mtime)
//   - Full text content for memory extraction

export const GRANOLA_CONFIG_FIELDS: ConfigField[] = [
  {
    key: "directoryPath",
    label: "Notes Directory",
    type: "path",
    placeholder: "~/Documents/Granola",
    required: true,
    helpText:
      "Path to the directory where Granola saves meeting notes as markdown files.",
  },
  {
    key: "filePattern",
    label: "File Pattern",
    type: "text",
    placeholder: "*.md",
    required: false,
    helpText: "Glob pattern for files to scan. Default: *.md",
  },
  {
    key: "lookbackDays",
    label: "Lookback Period (days)",
    type: "number",
    placeholder: "30",
    required: false,
    helpText: "Only scan files modified within this window. Default: 30 days.",
  },
];

const definition: ConnectorDefinition = {
  id: "granola",
  name: "Granola",
  type: "granola",
  sourceService: "standalone",
  description:
    "Scan Granola meeting notes (markdown files) for context from meetings, calls, and discussions.",
  configSchema: Object.fromEntries(
    GRANOLA_CONFIG_FIELDS.map((f) => [f.key, { type: f.type, required: f.required }])
  ),
};

// ─── Markdown Parsing ───────────────────────────────────────────────────────

/**
 * Extract a title from a markdown file.
 * Tries the first H1 heading, then falls back to the filename.
 */
function extractTitle(content: string, filename: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // Strip extension and clean up date prefixes like "2024-06-15 - "
  const name = basename(filename, extname(filename));
  const cleaned = name.replace(/^\d{4}-\d{2}-\d{2}\s*[-—]\s*/, "");
  return cleaned || name;
}

/**
 * Try to extract a date from the filename (e.g., "2024-06-15 - Meeting.md").
 * Returns null if no date pattern is found.
 */
function extractDateFromFilename(filename: string): Date | null {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;

  const parsed = new Date(match[1] + "T00:00:00");
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Parse a Granola markdown note into sections.
 * Granola notes typically have: Summary, Notes, Action Items, Transcript.
 */
function parseGranolaSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let currentSection = "preamble";
  const lines = content.split("\n");

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim().toLowerCase();
      sections[currentSection] = "";
    } else {
      sections[currentSection] = (sections[currentSection] || "") + line + "\n";
    }
  }

  // Trim all section content
  for (const key of Object.keys(sections)) {
    sections[key] = sections[key].trim();
  }

  return sections;
}

// ─── Connector Implementation ───────────────────────────────────────────────

export const granolaConnector: Connector = {
  definition,

  validateConfig(config) {
    const dir = config.directoryPath as string | undefined;
    if (!dir) {
      return "A directory path is required.";
    }
    // Expand ~ to home directory
    if (dir.startsWith("~") && !dir.startsWith("~/")) {
      return 'Use ~/ for home directory paths (e.g., "~/Documents/Granola").';
    }
    return null;
  },

  async testConnection(config) {
    const dir = expandHome(config.directoryPath as string);
    try {
      const info = await stat(dir);
      if (!info.isDirectory()) return false;

      // Check that there's at least one .md file
      const entries = await readdir(dir);
      return entries.some((e) => e.endsWith(".md"));
    } catch {
      return false;
    }
  },

  async scan(config): Promise<ScanResult> {
    const dir = expandHome(config.directoryPath as string);
    const lookbackDays = (config.lookbackDays as number) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    const items: ScannedItem[] = [];
    const errors: string[] = [];

    try {
      const entries = await readdir(dir);
      const mdFiles = entries.filter((e) => e.endsWith(".md"));

      for (const filename of mdFiles) {
        try {
          const filePath = join(dir, filename);
          const fileStat = await stat(filePath);

          // Skip files outside the lookback window
          if (fileStat.mtime < cutoffDate) continue;

          const content = await readFile(filePath, "utf-8");
          if (!content.trim()) continue;

          const title = extractTitle(content, filename);
          const sourceDate = extractDateFromFilename(filename) || fileStat.mtime;
          const contentHash = createHash("sha256").update(content).digest("hex");
          const sections = parseGranolaSections(content);

          items.push({
            externalId: `granola:${contentHash.slice(0, 16)}`,
            title,
            content,
            contentHash,
            sourceDate,
            metadata: {
              filename,
              sections: Object.keys(sections),
              hasTranscript: "transcript" in sections,
              hasActionItems: "action items" in sections,
            },
          });
        } catch (err) {
          errors.push(`Failed to read ${filename}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`Failed to read directory ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      connectorId: "granola",
      items,
      scannedAt: new Date(),
      itemsScanned: items.length,
      errors,
    };
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function expandHome(filepath: string): string {
  if (filepath.startsWith("~/")) {
    const home = process.env.HOME || process.env.USERPROFILE || "/";
    return join(home, filepath.slice(2));
  }
  return filepath;
}

export { parseGranolaSections, extractTitle, extractDateFromFilename };
