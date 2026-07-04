import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

/**
 * Auto-detect available sources and create them if not already registered.
 * Currently detects:
 * - Claude Code: ~/.claude/ directory with CLAUDE.md or project memory files
 */
export async function POST() {
  const created: { name: string; type: string; id: string }[] = [];
  const skipped: string[] = [];

  // Detect Claude Code at ~/.claude/
  const claudeDir = resolve(homedir(), ".claude");
  const claudeExists = existsSync(claudeDir);

  if (claudeExists) {
    const existing = await prisma.source.findFirst({
      where: { type: "claude_code", config: { contains: claudeDir } },
    });

    if (existing) {
      skipped.push(`Claude Code (already registered as "${existing.name}")`);
    } else {
      const source = await prisma.source.create({
        data: {
          type: "claude_code",
          name: "Claude Code",
          config: JSON.stringify({ path: claudeDir }),
        },
      });
      created.push({ name: source.name, type: source.type, id: source.id });
    }
  }

  // Check for project-specific Claude Code directories
  const projectsDir = resolve(claudeDir, "projects");
  if (existsSync(projectsDir)) {
    // The global ~/.claude is already covered - project memories are under projects/
    // The claude-code parser handles this by scanning the projects subdirectory
  }

  return NextResponse.json({
    created,
    skipped,
    message: created.length > 0
      ? `Created ${created.length} source${created.length > 1 ? "s" : ""}. You can now sync to extract memories.`
      : skipped.length > 0
        ? "All detected sources are already registered."
        : "No auto-detectable sources found. Upload a ChatGPT or Claude export to get started.",
  });
}
