import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { existsSync } from "fs";
import { resolve, join } from "path";
import { homedir } from "os";

/**
 * Auto-detect available sources and create them if not already registered.
 * Currently detects:
 * - Claude Code: ~/.claude/ directory with CLAUDE.md or project memory files
 * - Granola: call notes directory at known macOS locations
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

  // Detect additional Claude Code profiles from CLAUDE_PROFILE_*_PATH env vars
  for (const [key, value] of Object.entries(process.env)) {
    if (/^CLAUDE_PROFILE_\d+_PATH$/.test(key) && value) {
      const profilePath = resolve(value);
      const profileExists = existsSync(profilePath);
      if (!profileExists) continue;

      const profileNum = key.match(/CLAUDE_PROFILE_(\d+)_PATH/)?.[1] ?? "?";
      const existingProfile = await prisma.source.findFirst({
        where: { type: "claude_code", config: { contains: profilePath } },
      });

      if (existingProfile) {
        skipped.push(`Claude Profile ${profileNum} (already registered as "${existingProfile.name}")`);
      } else {
        const source = await prisma.source.create({
          data: {
            type: "claude_code",
            name: `Claude Profile ${profileNum}`,
            config: JSON.stringify({ path: profilePath }),
          },
        });
        created.push({ name: source.name, type: source.type, id: source.id });
      }
    }
  }

  // Detect Granola call notes directory
  const granolaCandidates = [
    process.env.GRANOLA_NOTES_PATH
      ? resolve(process.env.GRANOLA_NOTES_PATH)
      : null,
    join(homedir(), "Library", "Application Support", "Granola"),
    join(homedir(), "Documents", "Granola"),
    join(homedir(), "Granola"),
  ].filter((p): p is string => p !== null);

  for (const granolaDir of granolaCandidates) {
    if (!existsSync(granolaDir)) continue;

    const existingGranola = await prisma.source.findFirst({
      where: { type: "granola", config: { contains: granolaDir } },
    });

    if (existingGranola) {
      skipped.push(
        `Granola Notes (already registered as "${existingGranola.name}")`
      );
    } else {
      const source = await prisma.source.create({
        data: {
          type: "granola",
          name: "Granola Notes",
          config: JSON.stringify({ path: granolaDir }),
        },
      });
      created.push({ name: source.name, type: source.type, id: source.id });
    }
    // Only register the first found directory
    break;
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
