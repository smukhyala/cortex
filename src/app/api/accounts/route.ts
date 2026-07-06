import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { existsSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

interface Account {
  id: string | null;
  name: string;
  type: string;
  path: string;
  exists: boolean;
  registered: boolean;
  sourceId: string | null;
  memoryCount: number;
}

function safeExists(path: string): boolean {
  return existsSync(/* turbopackIgnore: true */ path);
}

function safeResolve(path: string): string {
  return resolve(/* turbopackIgnore: true */ path);
}

function readConfig(config: string): Record<string, unknown> {
  try {
    return JSON.parse(config || "{}");
  } catch {
    return {};
  }
}

/**
 * Scan for detected Claude Code profiles:
 * 1. Default ~/.claude/ directory
 * 2. Any CLAUDE_PROFILE_*_PATH env vars
 * 3. Any already-registered sources in the database
 */
export async function GET() {
  const accounts: Account[] = [];
  const seenPaths = new Set<string>();

  // 1. Default ~/.claude/
  const defaultClaudeDir = resolve(homedir(), ".claude");
  seenPaths.add(defaultClaudeDir);

  const defaultExists = safeExists(defaultClaudeDir);
  const defaultSource = await prisma.source.findFirst({
    where: { type: "claude_code", config: { contains: defaultClaudeDir } },
    include: { _count: { select: { memories: true } } },
  });

  accounts.push({
    id: defaultSource?.id ?? null,
    name: defaultSource?.name ?? "Claude Code (default)",
    type: "claude_code",
    path: defaultClaudeDir,
    exists: defaultExists,
    registered: !!defaultSource,
    sourceId: defaultSource?.id ?? null,
    memoryCount: defaultSource?._count.memories ?? 0,
  });

  // 2. Scan CLAUDE_PROFILE_*_PATH env vars
  for (const [key, value] of Object.entries(process.env)) {
    if (/^CLAUDE_PROFILE_\d+_PATH$/.test(key) && value) {
      const profilePath = safeResolve(value);
      if (seenPaths.has(profilePath)) continue;
      seenPaths.add(profilePath);

      const profileNum = key.match(/CLAUDE_PROFILE_(\d+)_PATH/)?.[1] ?? "?";
      const profileExists = safeExists(profilePath);
      const profileSource = await prisma.source.findFirst({
        where: { type: "claude_code", config: { contains: profilePath } },
        include: { _count: { select: { memories: true } } },
      });

      accounts.push({
        id: profileSource?.id ?? null,
        name: profileSource?.name ?? `Claude Profile ${profileNum}`,
        type: "claude_code",
        path: profilePath,
        exists: profileExists,
        registered: !!profileSource,
        sourceId: profileSource?.id ?? null,
        memoryCount: profileSource?._count.memories ?? 0,
      });
    }
  }

  // 3. Include any registered sources not yet in our list
  const allSources = await prisma.source.findMany({
    include: { _count: { select: { memories: true } } },
  });

  for (const source of allSources) {
    const config = readConfig(source.config);
    const sourcePathValue = config.path || config.filePath || "";
    const sourcePath = typeof sourcePathValue === "string" ? sourcePathValue : "";
    if (sourcePath && seenPaths.has(safeResolve(sourcePath))) continue;
    if (sourcePath) seenPaths.add(safeResolve(sourcePath));

    accounts.push({
      id: source.id,
      name: source.name,
      type: source.type,
      path: sourcePath,
      exists: sourcePath ? safeExists(sourcePath) : false,
      registered: true,
      sourceId: source.id,
      memoryCount: source._count.memories,
    });
  }

  return NextResponse.json(accounts);
}

/**
 * Register a new account/profile.
 * Accepts: { name, type, path } or { name, type, key }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, path, key } = body as {
      name?: string;
      type?: string;
      path?: string;
      key?: string;
    };

    if (!name || !type) {
      return NextResponse.json(
        { error: "name and type are required" },
        { status: 400 }
      );
    }

    if (type === "claude_code" && !path) {
      return NextResponse.json(
        { error: "path is required for claude_code accounts" },
        { status: 400 }
      );
    }

    // Check path exists for filesystem-based sources
    if (path && !safeExists(path)) {
      return NextResponse.json(
        { error: `Directory not found: ${path}` },
        { status: 400 }
      );
    }

    // Check for duplicate registration
    if (path) {
      const existing = await prisma.source.findFirst({
        where: { type, config: { contains: path } },
      });
      if (existing) {
        return NextResponse.json(
          { error: `This path is already registered as "${existing.name}"` },
          { status: 409 }
        );
      }
    }

    const config: Record<string, string> = {};
    if (path) config.path = path;
    if (key) config.apiKey = key;

    const source = await prisma.source.create({
      data: {
        type,
        name,
        config: JSON.stringify(config),
      },
    });

    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
