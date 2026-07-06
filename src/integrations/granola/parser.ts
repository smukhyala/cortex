import { createHash } from "crypto";
import { readFile, readdir, stat } from "fs/promises";
import { join, basename } from "path";
import type {
  NormalizedConversation,
  NormalizedMessage,
} from "@/contracts/conversation";

// ─── Granola Note Format ─────────────────────────────────────────────────────
//
// Granola stores meeting/call notes as markdown files. Each note typically has:
//   - A title (first # heading or filename)
//   - Meeting metadata (date, attendees, duration) in YAML front matter or inline
//   - Structured sections: Summary, Key Points, Action Items, Transcript, etc.
//
// This parser handles:
//   1. Individual .md files
//   2. A directory of .md files (scans recursively)
//   3. Optional YAML front matter for metadata extraction
//

// ─── Types ───────────────────────────────────────────────────────────────────

interface GranolaNoteMetadata {
  title: string | null;
  date: Date | null;
  attendees: string[];
  duration: string | null;
}

interface ParsedGranolaNote {
  metadata: GranolaNoteMetadata;
  sections: { heading: string; content: string }[];
  rawContent: string;
  filePath: string;
}

// ─── Front Matter Parsing ────────────────────────────────────────────────────

function parseFrontMatter(content: string): {
  frontMatter: Record<string, string>;
  body: string;
} {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) {
    return { frontMatter: {}, body: content };
  }

  const frontMatter: Record<string, string> = {};
  const fmLines = fmMatch[1].split("\n");

  for (const line of fmLines) {
    const kvMatch = line.match(/^(\w[\w\s]*?):\s*(.+)$/);
    if (kvMatch) {
      frontMatter[kvMatch[1].trim().toLowerCase()] = kvMatch[2].trim();
    }
  }

  return { frontMatter, body: fmMatch[2] };
}

// ─── Date Extraction ─────────────────────────────────────────────────────────

function extractDate(
  frontMatter: Record<string, string>,
  body: string,
  filePath: string
): Date | null {
  // Try front matter fields
  for (const key of ["date", "created", "timestamp", "meeting_date"]) {
    if (frontMatter[key]) {
      const d = new Date(frontMatter[key]);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // Try to extract date from filename (e.g., "2024-03-15-standup.md")
  const fnameMatch = basename(filePath).match(
    /(\d{4}[-_]\d{2}[-_]\d{2})/
  );
  if (fnameMatch) {
    const d = new Date(fnameMatch[1].replace(/_/g, "-"));
    if (!isNaN(d.getTime())) return d;
  }

  // Try to extract date from first few lines of body
  const headerLines = body.split("\n").slice(0, 10).join("\n");
  const datePatterns = [
    // ISO: 2024-03-15
    /(\d{4}-\d{2}-\d{2})/,
    // US: March 15, 2024
    /(\w+ \d{1,2},?\s*\d{4})/,
    // UK: 15 March 2024
    /(\d{1,2}\s+\w+\s+\d{4})/,
  ];

  for (const pattern of datePatterns) {
    const match = headerLines.match(pattern);
    if (match) {
      const d = new Date(match[1]);
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

// ─── Attendee Extraction ─────────────────────────────────────────────────────

function extractAttendees(
  frontMatter: Record<string, string>,
  body: string
): string[] {
  // Try front matter
  for (const key of ["attendees", "participants", "people"]) {
    if (frontMatter[key]) {
      return frontMatter[key]
        .split(/[,;]/)
        .map((a) => a.trim())
        .filter(Boolean);
    }
  }

  // Try to find an "Attendees:" or "Participants:" line in the body
  const attendeesMatch = body.match(
    /(?:attendees|participants|people|with):\s*(.+)/i
  );
  if (attendeesMatch) {
    return attendeesMatch[1]
      .split(/[,;]/)
      .map((a) => a.trim())
      .filter(Boolean);
  }

  return [];
}

// ─── Section Parsing ─────────────────────────────────────────────────────────

function parseSections(
  body: string
): { heading: string; content: string }[] {
  const lines = body.split("\n");
  const sections: { heading: string; content: string }[] = [];
  let currentHeading = "Notes";
  let currentLines: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentLines.push(line);
      continue;
    }
    if (inCodeBlock) {
      currentLines.push(line);
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      // Flush current section
      const content = currentLines.join("\n").trim();
      if (content) {
        sections.push({ heading: currentHeading, content });
      }
      currentHeading = headingMatch[2].trim();
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  // Flush final section
  const content = currentLines.join("\n").trim();
  if (content) {
    sections.push({ heading: currentHeading, content });
  }

  return sections;
}

// ─── Single Note Parser ──────────────────────────────────────────────────────

function parseGranolaNote(
  content: string,
  filePath: string
): ParsedGranolaNote {
  const { frontMatter, body } = parseFrontMatter(content);

  // Extract title: front matter > first heading > filename
  let title: string | null = frontMatter["title"] || null;
  if (!title) {
    const headingMatch = body.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      title = headingMatch[1].trim();
    }
  }
  if (!title) {
    title = basename(filePath, ".md").replace(/[-_]/g, " ");
  }

  const date = extractDate(frontMatter, body, filePath);
  const attendees = extractAttendees(frontMatter, body);
  const duration = frontMatter["duration"] || null;
  const sections = parseSections(body);

  return {
    metadata: { title, date, attendees, duration },
    sections,
    rawContent: content,
    filePath,
  };
}

// ─── Note to Conversation ────────────────────────────────────────────────────

function noteToConversation(
  note: ParsedGranolaNote
): NormalizedConversation | null {
  const messages: NormalizedMessage[] = [];

  // Build a context message with metadata
  const metaParts: string[] = [];
  if (note.metadata.attendees.length > 0) {
    metaParts.push(`Attendees: ${note.metadata.attendees.join(", ")}`);
  }
  if (note.metadata.duration) {
    metaParts.push(`Duration: ${note.metadata.duration}`);
  }
  if (note.metadata.date) {
    metaParts.push(`Date: ${note.metadata.date.toISOString().split("T")[0]}`);
  }

  if (metaParts.length > 0) {
    messages.push({
      role: "system",
      content: `Meeting: ${note.metadata.title || "Untitled"}\n${metaParts.join("\n")}`,
      timestamp: note.metadata.date,
    });
  }

  // Convert each section into a user message (the meeting notes are "input"
  // that the extraction pipeline will mine for memories)
  for (const section of note.sections) {
    if (!section.content.trim()) continue;

    const sectionText =
      section.heading !== "Notes"
        ? `[${section.heading}]\n${section.content}`
        : section.content;

    messages.push({
      role: "user",
      content: sectionText.slice(0, 8000),
      timestamp: note.metadata.date,
    });
  }

  if (messages.length === 0) return null;

  const contentHash = createHash("sha256")
    .update(note.rawContent)
    .digest("hex");

  const externalId = `granola:${createHash("sha256")
    .update(note.filePath)
    .digest("hex")
    .slice(0, 12)}`;

  return {
    externalId,
    title: note.metadata.title
      ? `Granola: ${note.metadata.title}`
      : `Granola Note (${basename(note.filePath)})`,
    messages,
    contentHash,
    sourceDate: note.metadata.date,
  };
}

// ─── Directory Scanner ───────────────────────────────────────────────────────

async function findMarkdownFiles(dirPath: string): Promise<string[]> {
  const results: string[] = [];

  async function scan(dir: string, depth: number) {
    if (depth > 5) return; // Prevent infinite recursion

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      // Skip hidden directories and common non-note dirs
      if (entry.startsWith(".") || entry === "node_modules") continue;

      const fullPath = join(dir, entry);
      let entryStat;
      try {
        entryStat = await stat(fullPath);
      } catch {
        continue;
      }

      if (entryStat.isDirectory()) {
        await scan(fullPath, depth + 1);
      } else if (entry.endsWith(".md") || entry.endsWith(".markdown")) {
        results.push(fullPath);
      }
    }
  }

  await scan(dirPath, 0);
  return results;
}

// ─── Main Parser (exported) ──────────────────────────────────────────────────

/**
 * Parse Granola call notes from a directory or single file.
 *
 * Accepts:
 * - A directory path: scans recursively for .md files
 * - A single .md file path: parses that file
 *
 * Returns NormalizedConversation[] suitable for the Cortex ingest pipeline.
 */
export async function parseGranolaNotes(
  filePath: string
): Promise<NormalizedConversation[]> {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    console.warn(`[granola] Path not accessible: ${filePath}`);
    return [];
  }

  let mdFiles: string[];

  if (fileStat.isDirectory()) {
    mdFiles = await findMarkdownFiles(filePath);
  } else if (
    filePath.endsWith(".md") ||
    filePath.endsWith(".markdown")
  ) {
    mdFiles = [filePath];
  } else {
    console.warn(`[granola] Unsupported file type: ${filePath}`);
    return [];
  }

  const results: NormalizedConversation[] = [];

  for (const mdFile of mdFiles) {
    try {
      const content = await readFile(mdFile, "utf-8");
      if (!content.trim()) continue;

      const note = parseGranolaNote(content, mdFile);
      const conv = noteToConversation(note);
      if (conv) {
        results.push(conv);
      }
    } catch (err) {
      console.warn(`[granola] Failed to parse ${mdFile}:`, err);
    }
  }

  return results;
}
