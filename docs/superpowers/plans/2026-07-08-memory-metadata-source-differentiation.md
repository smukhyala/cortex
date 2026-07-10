# Memory Metadata + Source Differentiation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich memories with dates, project attribution, and folder organization; visually differentiate AI sources with real logos; replace the Cortex brand icon.

**Architecture:** Add `project` field to Memory and new `Folder`/`MemoryFolder` models via Prisma migration. Update the extraction LLM prompt to detect project names. Enrich API responses with conversation dates and folder data. Update memory cards and dashboard to show source logos, dates, project badges, and folder assignment.

**Tech Stack:** Prisma 7 + SQLite, Zod 4, Next.js 16 App Router, React 19, Vitest, Tailwind CSS 4, Lucide React

## Global Constraints

- Prisma v7: requires `PrismaBetterSqlite3` adapter, constructor requires options object
- Zod v4: use `z.toJSONSchema()`, not zod-to-json-schema
- shadcn/ui uses Base UI: use `render` prop, NOT `asChild`
- Tests with Vitest in `__tests__/` directory, mirroring `src/` structure
- Source types: `chatgpt_export | claude_code | claude_desktop | claude_export | granola | manual | poke`
- Path alias: `@/` maps to `src/`

---

### Task 1: Schema migration — add `project` to Memory, add Folder + MemoryFolder models

**Files:**
- Modify: `prisma/schema.prisma:44-77` (Memory model)
- Create: `prisma/schema.prisma` (append Folder + MemoryFolder models)
- Create: migration file via `npx prisma migrate dev`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `Memory.project` (String?), `Folder` model, `MemoryFolder` join table — used by all subsequent tasks

- [ ] **Step 1: Add `project` field and relations to Memory model**

In `prisma/schema.prisma`, add to the `Memory` model (after line 65, before `createdAt`):

```prisma
  project        String?
```

And add the `folders` relation (after `conflictsAsOld` on line 72):

```prisma
  folders        MemoryFolder[]
```

- [ ] **Step 2: Add Folder model to schema**

Append to `prisma/schema.prisma` after the `Category` model:

```prisma
model Folder {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  parentId  String?
  parent    Folder?   @relation("FolderTree", fields: [parentId], references: [id])
  children  Folder[]  @relation("FolderTree")
  icon      String?
  color     String?
  sortOrder Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  memories  MemoryFolder[]
}

model MemoryFolder {
  id        String   @id @default(cuid())
  memoryId  String
  memory    Memory   @relation(fields: [memoryId], references: [id])
  folderId  String
  folder    Folder   @relation(fields: [folderId], references: [id])
  createdAt DateTime @default(now())

  @@unique([memoryId, folderId])
  @@index([memoryId])
  @@index([folderId])
}
```

- [ ] **Step 3: Run the migration**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx prisma migrate dev --name add-project-folders`

Expected: Migration created and applied. Prisma Client regenerated.

- [ ] **Step 4: Verify the migration worked**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx prisma db push --dry-run 2>&1 | head -5`

Expected: "The database is already in sync with the Prisma schema."

- [ ] **Step 5: Commit**

```bash
cd /Users/sanjay/projects/ProjOTW/cortex
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add project field to Memory, add Folder and MemoryFolder models"
```

---

### Task 2: Pipeline — add `project` to extraction schema and LLM prompt

**Files:**
- Modify: `src/contracts/pipeline.ts:32-43` (createExtractedMemorySchema)
- Modify: `src/pipeline/extract.ts:28-119` (extraction prompt)
- Modify: `src/pipeline/commit.ts:84-106` (commit clean memories)
- Create: `src/lib/project-detect.ts` (path-based project detection)
- Test: `__tests__/lib/project-detect.test.ts`
- Modify: `__tests__/pipeline/commit.test.ts`

**Interfaces:**
- Consumes: Prisma schema from Task 1 (`Memory.project` field)
- Produces: `extractProjectFromPath(path: string): string | null`, updated `ExtractedMemory` type with `project?: string`, commit writes `project` to DB

- [ ] **Step 1: Write test for project path detection**

Create `__tests__/lib/project-detect.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { extractProjectFromPath } from "@/lib/project-detect";

describe("extractProjectFromPath", () => {
  it("extracts project name from Claude Code project path", () => {
    expect(
      extractProjectFromPath("/Users/sanjay/.claude/projects/-Users-sanjay-projects-ProjOTW-cortex/memory/")
    ).toBe("Cortex");
  });

  it("extracts project name from direct project directory", () => {
    expect(
      extractProjectFromPath("/Users/sanjay/projects/ProjOTW/cortex")
    ).toBe("Cortex");
  });

  it("handles paths with nested project structure", () => {
    expect(
      extractProjectFromPath("/Users/sanjay/projects/BerkeleyProjects/Research/IanWaudbySmith/coldStartPrompts/")
    ).toBe("Cold Start Prompts");
  });

  it("returns null for non-project paths", () => {
    expect(extractProjectFromPath("/Users/sanjay/.claude/CLAUDE.md")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractProjectFromPath("")).toBeNull();
  });

  it("capitalizes and humanizes the project name", () => {
    expect(
      extractProjectFromPath("/Users/sanjay/projects/ProjOTW/frontier")
    ).toBe("Frontier");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx vitest run __tests__/lib/project-detect.test.ts 2>&1 | tail -10`

Expected: FAIL — module not found

- [ ] **Step 3: Implement project path detection**

Create `src/lib/project-detect.ts`:

```typescript
/**
 * Extract a human-readable project name from a file path.
 * Handles Claude Code project paths and direct project directories.
 */
export function extractProjectFromPath(filePath: string): string | null {
  if (!filePath) return null;

  // Claude Code project path: ~/.claude/projects/-Users-sanjay-projects-ProjOTW-cortex/...
  const claudeProjectMatch = filePath.match(
    /\.claude\/projects\/-[^/]+-([^/]+)\//
  );
  if (claudeProjectMatch) {
    return humanize(claudeProjectMatch[1]);
  }

  // Direct project path: /Users/.../projects/<category>/<name> or /Users/.../projects/<name>
  const projectDirMatch = filePath.match(
    /\/projects\/(?:[^/]+\/)*([^/]+)\/?$/
  );
  if (projectDirMatch) {
    return humanize(projectDirMatch[1]);
  }

  // Also try matching intermediate project directories
  const projectsMatch = filePath.match(
    /\/projects\/(?:[^/]+\/)*([^/]+)\//
  );
  if (projectsMatch) {
    // Take the last meaningful directory name before trailing paths
    const segments = filePath.split("/projects/")[1]?.split("/").filter(Boolean) ?? [];
    const name = segments[segments.length - 1] || segments[0];
    if (name && !name.startsWith(".") && name !== "memory") {
      return humanize(name);
    }
    // Fall back to first segment after /projects/
    if (segments[0] && segments.length > 1) {
      return humanize(segments[segments.length > 2 ? segments.length - 2 : 0]);
    }
  }

  return null;
}

function humanize(slug: string): string {
  // Convert camelCase and PascalCase to spaces
  const spaced = slug
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // Convert kebab-case and snake_case to spaces
    .replace(/[-_]+/g, " ")
    .trim();

  // Capitalize each word
  return spaced
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx vitest run __tests__/lib/project-detect.test.ts 2>&1 | tail -10`

Expected: All 6 tests PASS. If some fail, adjust the regex/logic in `project-detect.ts` to match expected outputs, then re-run.

- [ ] **Step 5: Add `project` to ExtractedMemory schema**

In `src/contracts/pipeline.ts`, add `project` to the schema returned by `createExtractedMemorySchema` (after line 41, before the closing `});`):

```typescript
    project: z.string().optional(),
```

- [ ] **Step 6: Update extraction prompt to detect projects**

In `src/pipeline/extract.ts`, add the following section to `EXTRACTION_SYSTEM_PROMPT_TEMPLATE` after the "## Corrections" section (after line 84):

```typescript
## Project Attribution

If the conversation is clearly about a specific project, product, repository, or codebase that the user is working on, include its short name in the \`project\` field (e.g., "Cortex", "Oasis", "Cold Start Prompts"). Use the name the user uses to refer to it. If the memory is a general personal fact not tied to any project, omit the \`project\` field.
```

- [ ] **Step 7: Update commit to write project field**

In `src/pipeline/commit.ts`, update the `prisma.memory.create` call inside the clean memories loop (around line 92). Add `project` to the data:

```typescript
    const memory = await prisma.memory.create({
      data: {
        content: mem.content,
        subject: mem.subject,
        category: mem.category,
        confidence: mem.confidence,
        verbatimQuote: mem.verbatimQuote,
        temporality: mem.temporality,
        sensitive: mem.sensitive,
        sourceId: params.sourceId,
        ...(conversationId ? { conversationId } : {}),
        ...((mem as MemoryWithOrigin & { project?: string }).project ? { project: (mem as MemoryWithOrigin & { project?: string }).project } : {}),
        status,
        ...(status === "active" ? { approvedAt: new Date() } : {}),
      },
    });
```

Also add a `project` parameter to the `commit` function params type and use `extractProjectFromPath` for Claude Code sources. Add to the params type (around line 38):

```typescript
  sourceType?: string;
  sourcePath?: string;
```

Then at the start of the function body (after line 56), add:

```typescript
  // Auto-detect project from source path for Claude Code sources
  let autoProject: string | null = null;
  if (params.sourceType === "claude_code" && params.sourcePath) {
    const { extractProjectFromPath } = await import("@/lib/project-detect");
    autoProject = extractProjectFromPath(params.sourcePath);
  }
```

Then update the memory create to use autoProject as fallback:

```typescript
        ...(((mem as any).project || autoProject) ? { project: (mem as any).project || autoProject } : {}),
```

Do the same for the conflict memory creation (around line 204).

- [ ] **Step 8: Update commit test to verify project is written**

Add a new test case to `__tests__/pipeline/commit.test.ts`:

```typescript
  it("writes project field from extracted memory", async () => {
    const mem = makeMemory({ content: "User uses Prisma" });
    (mem as any).project = "Cortex";

    await commit({
      sourceId: "src-1",
      clean: [mem],
      conflicts: [],
      conversationMap: new Map(),
      initialStatus: "active",
    });

    expect(mockedPrisma.memory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "User uses Prisma",
          project: "Cortex",
        }),
      })
    );
  });
```

- [ ] **Step 9: Run all affected tests**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx vitest run __tests__/lib/project-detect.test.ts __tests__/pipeline/commit.test.ts 2>&1 | tail -15`

Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
cd /Users/sanjay/projects/ProjOTW/cortex
git add src/lib/project-detect.ts __tests__/lib/project-detect.test.ts src/contracts/pipeline.ts src/pipeline/extract.ts src/pipeline/commit.ts __tests__/pipeline/commit.test.ts
git commit -m "feat: add project detection to extraction pipeline and commit"
```

---

### Task 3: Folders API — CRUD endpoints

**Files:**
- Create: `src/app/api/folders/route.ts`
- Create: `src/app/api/folders/[id]/route.ts`
- Create: `src/app/api/folders/[id]/memories/route.ts`
- Create: `src/lib/slugify.ts`
- Test: `__tests__/app/api/folders/route.test.ts`

**Interfaces:**
- Consumes: `Folder` and `MemoryFolder` models from Task 1
- Produces:
  - `GET /api/folders` → `Array<{ id, name, slug, parentId, icon, color, sortOrder, _count: { memories: number }, children: Folder[] }>`
  - `POST /api/folders` body `{ name, parentId?, icon?, color? }` → created Folder
  - `PATCH /api/folders/[id]` body `{ name?, parentId?, icon?, color?, sortOrder? }` → updated Folder
  - `DELETE /api/folders/[id]` → `{ success: true }`
  - `POST /api/folders/[id]/memories` body `{ memoryIds: string[] }` → `{ added: number }`

- [ ] **Step 1: Write the slugify utility**

Create `src/lib/slugify.ts`:

```typescript
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
```

- [ ] **Step 2: Write tests for folders API**

Create `__tests__/app/api/folders/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const mockPrisma = {
    folder: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    memoryFolder: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from "@/lib/db";
const mockedPrisma = vi.mocked(prisma);

import { slugify } from "@/lib/slugify";

describe("slugify", () => {
  it("converts text to a URL-safe slug", () => {
    expect(slugify("Work Projects")).toBe("work-projects");
  });

  it("handles special characters", () => {
    expect(slugify("My Folder!@#$%")).toBe("my-folder");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });
});

describe("Folders API logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("slugify produces unique slugs from folder names", () => {
    expect(slugify("Personal Notes")).toBe("personal-notes");
    expect(slugify("Work Projects")).toBe("work-projects");
    expect(slugify("AI Research")).toBe("ai-research");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx vitest run __tests__/app/api/folders/route.test.ts 2>&1 | tail -10`

Expected: FAIL — slugify module not found

- [ ] **Step 4: Implement GET/POST /api/folders**

Create `src/app/api/folders/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";

export async function GET() {
  const folders = await prisma.folder.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { memories: true } },
      children: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { memories: true } } },
      },
    },
    where: { parentId: null },
  });

  return NextResponse.json(folders);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name: string = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let slug = slugify(name);
  // Ensure slug uniqueness by appending a counter
  const existing = await prisma.folder.findUnique({ where: { slug } });
  if (existing) {
    let counter = 2;
    while (await prisma.folder.findUnique({ where: { slug: `${slug}-${counter}` } })) {
      counter++;
    }
    slug = `${slug}-${counter}`;
  }

  const folder = await prisma.folder.create({
    data: {
      name,
      slug,
      parentId: body.parentId || null,
      icon: body.icon || null,
      color: body.color || null,
    },
    include: { _count: { select: { memories: true } } },
  });

  return NextResponse.json(folder, { status: 201 });
}
```

- [ ] **Step 5: Implement PATCH/DELETE /api/folders/[id]**

Create `src/app/api/folders/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    data.name = body.name.trim();
    data.slug = slugify(body.name.trim());
  }
  if (body.parentId !== undefined) data.parentId = body.parentId || null;
  if (body.icon !== undefined) data.icon = body.icon || null;
  if (body.color !== undefined) data.color = body.color || null;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

  const folder = await prisma.folder.update({
    where: { id },
    data,
    include: { _count: { select: { memories: true } } },
  });

  return NextResponse.json(folder);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Detach all memories from this folder first
  await prisma.memoryFolder.deleteMany({ where: { folderId: id } });
  // Re-parent children to null
  await prisma.folder.updateMany({
    where: { parentId: id },
    data: { parentId: null },
  });
  await prisma.folder.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 6: Implement POST /api/folders/[id]/memories (bulk assign)**

Create `src/app/api/folders/[id]/memories/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const memoryIds: string[] = body.memoryIds;

  if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
    return NextResponse.json({ error: "memoryIds array is required" }, { status: 400 });
  }

  // Use createMany with skipDuplicates to handle idempotency
  const result = await prisma.memoryFolder.createMany({
    data: memoryIds.map((memoryId) => ({ memoryId, folderId: id })),
    skipDuplicates: true,
  });

  return NextResponse.json({ added: result.count });
}
```

- [ ] **Step 7: Run tests**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx vitest run __tests__/app/api/folders/route.test.ts 2>&1 | tail -10`

Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
cd /Users/sanjay/projects/ProjOTW/cortex
git add src/lib/slugify.ts src/app/api/folders/ __tests__/app/api/folders/
git commit -m "feat: add folders CRUD API with slug generation and bulk memory assignment"
```

---

### Task 4: Enrich memories API — return dates, project, folders; add filters

**Files:**
- Modify: `src/app/api/memories/route.ts:7-53` (GET handler)
- Modify: `src/app/api/memories/[id]/route.ts:26-78` (PATCH handler)

**Interfaces:**
- Consumes: `Memory.project`, `MemoryFolder` join table from Tasks 1-3
- Produces: Enriched GET response with `conversation.sourceDate`, `project`, `folders[]`; PATCH accepts `project` and `folderIds`

- [ ] **Step 1: Update GET /api/memories to return enriched data**

In `src/app/api/memories/route.ts`, update the GET handler:

Add `project` and `folderId` filter support (after line 14):

```typescript
  const project = searchParams.get("project");
  const folderId = searchParams.get("folderId");
  if (project) where.project = project;
  if (folderId) {
    where.folders = { some: { folderId } };
  }
```

Update the `include` block (lines 19-22) to add `sourceDate` and `folders`:

```typescript
    include: {
      source: { select: { name: true, type: true, config: true } },
      conversation: { select: { title: true, externalId: true, sourceDate: true } },
      folders: {
        include: {
          folder: { select: { id: true, name: true, slug: true, color: true } },
        },
      },
    },
```

- [ ] **Step 2: Update PATCH /api/memories/[id] to accept project and folderIds**

In `src/app/api/memories/[id]/route.ts`, update the PATCH handler. Add project support to the update data (after line 40):

```typescript
      ...(body.project !== undefined && { project: body.project || null }),
```

After the `prisma.memory.update` call and before the `notifyMemoryChange`, add folder assignment logic:

```typescript
  // Handle folder assignments
  if (Array.isArray(body.folderIds)) {
    // Remove all existing folder assignments
    await prisma.memoryFolder.deleteMany({ where: { memoryId: id } });
    // Create new assignments
    if (body.folderIds.length > 0) {
      await prisma.memoryFolder.createMany({
        data: body.folderIds.map((folderId: string) => ({ memoryId: id, folderId })),
        skipDuplicates: true,
      });
    }
  }
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx vitest run 2>&1 | tail -20`

Expected: All existing tests still PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/sanjay/projects/ProjOTW/cortex
git add src/app/api/memories/route.ts src/app/api/memories/[id]/route.ts
git commit -m "feat: enrich memories API with dates, project, folders, and new filters"
```

---

### Task 5: Service logos — replace placeholders with real SVGs, add Cortex logo

**Files:**
- Modify: `src/components/features/service-logos.tsx` (replace all logo components)
- Create: `public/icon.svg` (new Cortex logo)
- Modify: `src/components/app-sidebar.tsx:12-13,52-53` (replace Zap import/usage)
- Modify: `src/components/top-nav.tsx:34-35` (logo already uses Image + icon.svg, just needs new SVG)

**Interfaces:**
- Consumes: nothing (standalone visual task)
- Produces: `<ServiceLogo type={sourceType} />` component with real logos, `<CortexLogo />` component, updated `public/icon.svg`

- [ ] **Step 1: Replace service-logos.tsx with real SVG logos**

Overwrite `src/components/features/service-logos.tsx` with updated logos. Keep the existing `ServiceLogo` unified component interface. The ChatGPT logo SVG path is already correct (OpenAI's actual logomark). Update the Claude logo to match Anthropic's official mark more closely. Add a `ManualLogo` using Lucide `PenLine`. Add `claude_desktop` to the config. Add a `CortexLogo` component:

```typescript
import { PenLine } from "lucide-react";

interface LogoProps {
  size?: number;
  className?: string;
}

// Anthropic/Claude logo — official calligraphic mark
export function ClaudeLogo({ size = 20, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label="Claude"
    >
      <path
        d="M16.878 10.414l-4.89 8.457a.497.497 0 01-.37.227.473.473 0 01-.408-.157.551.551 0 01-.124-.436l.749-4.838-3.47-.903a.533.533 0 01-.345-.283.538.538 0 01-.022-.45l4.89-8.456a.497.497 0 01.37-.228.473.473 0 01.408.158.551.551 0 01.124.436l-.749 4.837 3.47.903a.533.533 0 01.345.283.538.538 0 01.022.45z"
        fill="#D97757"
      />
    </svg>
  );
}

// OpenAI/ChatGPT logo — official hexagonal flower
export function ChatGPTLogo({ size = 20, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label="ChatGPT"
    >
      <path
        d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071.005l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071-.005l4.83 2.786a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.657zM20.91 8.587l-.142-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.37 9.089V6.757a.072.072 0 0 1 .033-.062l4.83-2.787a4.495 4.495 0 0 1 6.677 4.679zM8.256 12.86l-2.02-1.164a.08.08 0 0 1-.038-.057V6.056a4.494 4.494 0 0 1 7.375-3.453l-.142.08L8.652 5.44a.795.795 0 0 0-.393.681l-.003 6.739zm1.093-2.368L12 8.953l2.65 1.539v3.016L12 15.047l-2.65-1.539v-3.016z"
        fill="#10a37f"
      />
    </svg>
  );
}

// Poke logo — palm tree on blue
export function PokeLogo({ size = 20, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label="Poke"
    >
      <rect x="2" y="2" width="20" height="20" rx="6" fill="#4a6fa5" />
      <line x1="12" y1="10" x2="12" y2="19" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="9" y1="19" x2="15" y2="19" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12 10 Q8 6 5 5" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 10 Q7 7 4 8" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 10 Q8 9 5 11" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 10 Q16 6 19 5" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 10 Q17 7 20 8" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M12 10 Q16 9 19 11" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// Granola logo — notepad
export function GranolaLogo({ size = 20, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-label="Granola"
    >
      <rect x="4" y="2" width="16" height="20" rx="3" fill="#f59e0b" />
      <line x1="8" y1="7" x2="16" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="11" x2="16" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="15" x2="13" y2="15" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Cortex logo — brain-circuit node motif in cactus green
export function CortexLogo({ size = 20, className = "" }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-label="Cortex"
    >
      {/* Central node */}
      <circle cx="16" cy="16" r="4" fill="#5B7553" />
      {/* Outer nodes */}
      <circle cx="16" cy="5" r="2.5" fill="#5B7553" />
      <circle cx="25.5" cy="10.5" r="2.5" fill="#5B7553" />
      <circle cx="25.5" cy="21.5" r="2.5" fill="#5B7553" />
      <circle cx="16" cy="27" r="2.5" fill="#5B7553" />
      <circle cx="6.5" cy="21.5" r="2.5" fill="#5B7553" />
      <circle cx="6.5" cy="10.5" r="2.5" fill="#5B7553" />
      {/* Connection lines */}
      <line x1="16" y1="12" x2="16" y2="7.5" stroke="#5B7553" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="19.5" y1="13.5" x2="23.5" y2="11.5" stroke="#5B7553" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="19.5" y1="18.5" x2="23.5" y2="20.5" stroke="#5B7553" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="20" x2="16" y2="24.5" stroke="#5B7553" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12.5" y1="18.5" x2="8.5" y2="20.5" stroke="#5B7553" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12.5" y1="13.5" x2="8.5" y2="11.5" stroke="#5B7553" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Manual entry icon
function ManualLogo({ size = 20, className = "" }: LogoProps) {
  return <PenLine size={size} className={`text-muted-foreground ${className}`} />;
}

// Mapping from source type strings to logo components + metadata
const SERVICE_CONFIG: Record<string, {
  Logo: (props: LogoProps) => React.JSX.Element;
  bg: string;
}> = {
  chatgpt_export: { Logo: ChatGPTLogo, bg: "bg-emerald-50" },
  claude_code:    { Logo: ClaudeLogo,   bg: "bg-orange-50" },
  claude_desktop: { Logo: ClaudeLogo,   bg: "bg-orange-50" },
  claude_export:  { Logo: ClaudeLogo,   bg: "bg-violet-50" },
  poke:           { Logo: PokeLogo,     bg: "bg-sky-50" },
  granola:        { Logo: GranolaLogo,  bg: "bg-amber-50" },
  manual:         { Logo: ManualLogo,   bg: "bg-muted" },
};

// Unified component: renders the correct logo for a source type
export function ServiceLogo({
  type,
  size = 20,
  className = "",
  showBackground = true,
}: {
  type: string;
  size?: number;
  className?: string;
  showBackground?: boolean;
}) {
  const config = SERVICE_CONFIG[type];

  if (!config) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-muted text-muted-foreground text-xs font-semibold ${className}`}
        style={{ width: size * 2, height: size * 2 }}
      >
        ??
      </div>
    );
  }

  const { Logo, bg } = config;

  if (!showBackground) {
    return <Logo size={size} className={className} />;
  }

  return (
    <div
      className={`flex items-center justify-center rounded-xl ${bg} ${className}`}
      style={{ width: size * 2, height: size * 2 }}
    >
      <Logo size={size} />
    </div>
  );
}
```

- [ ] **Step 2: Create new Cortex favicon SVG**

Overwrite `public/icon.svg` with the Cortex brain-circuit logo:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
  <circle cx="16" cy="16" r="4" fill="#5B7553"/>
  <circle cx="16" cy="5" r="2.5" fill="#5B7553"/>
  <circle cx="25.5" cy="10.5" r="2.5" fill="#5B7553"/>
  <circle cx="25.5" cy="21.5" r="2.5" fill="#5B7553"/>
  <circle cx="16" cy="27" r="2.5" fill="#5B7553"/>
  <circle cx="6.5" cy="21.5" r="2.5" fill="#5B7553"/>
  <circle cx="6.5" cy="10.5" r="2.5" fill="#5B7553"/>
  <line x1="16" y1="12" x2="16" y2="7.5" stroke="#5B7553" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="19.5" y1="13.5" x2="23.5" y2="11.5" stroke="#5B7553" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="19.5" y1="18.5" x2="23.5" y2="20.5" stroke="#5B7553" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="16" y1="20" x2="16" y2="24.5" stroke="#5B7553" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="12.5" y1="18.5" x2="8.5" y2="20.5" stroke="#5B7553" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="12.5" y1="13.5" x2="8.5" y2="11.5" stroke="#5B7553" stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 3: Replace Zap with CortexLogo in sidebar**

In `src/components/app-sidebar.tsx`:

Replace the import line (line 12):
```typescript
// Remove: Zap,
```

Add import at top:
```typescript
import { CortexLogo } from "@/components/features/service-logos";
```

Replace the Zap usage in the sidebar header (lines 52-53):
```typescript
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime/10">
            <CortexLogo size={18} />
          </div>
```

- [ ] **Step 4: Verify the app builds**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx next build 2>&1 | tail -10`

Expected: Build succeeds without errors

- [ ] **Step 5: Commit**

```bash
cd /Users/sanjay/projects/ProjOTW/cortex
git add src/components/features/service-logos.tsx public/icon.svg src/components/app-sidebar.tsx
git commit -m "feat: add real service logos, Cortex brand icon, replace Zap in sidebar"
```

---

### Task 6: Memory cards UI — show dates, source logos, project badges, folder assignment

**Files:**
- Modify: `src/app/memories/page.tsx` (memory card rendering, sidebar, folder UI)

**Interfaces:**
- Consumes: Enriched API from Task 4 (conversation.sourceDate, project, folders[]), ServiceLogo from Task 5, Folders API from Task 3
- Produces: Updated memory card UI with date, inline source logo, project badge, folder sidebar + assignment popover

- [ ] **Step 1: Update the Memory interface to include new fields**

In `src/app/memories/page.tsx`, update the `Memory` interface (lines 8-25):

```typescript
interface MemoryFolder {
  folder: { id: string; name: string; slug: string; color: string | null };
}

interface Memory {
  id: string;
  content: string;
  subject: string;
  category: string;
  status: string;
  confidence: number;
  temporality: string;
  sensitive: boolean;
  referenceCount: number;
  lastReferencedAt: string;
  manuallyStrong: boolean;
  strength: number;
  createdAt: string;
  project: string | null;
  quality?: { isTechnical: boolean };
  source: { name: string; type: string; config: string };
  conversation: { title: string; externalId: string; sourceDate: string | null } | null;
  folders: MemoryFolder[];
}
```

- [ ] **Step 2: Add folder state and fetcher**

After the existing state declarations (around line 114), add:

```typescript
  const [folders, setFolders] = useState<Array<{ id: string; name: string; slug: string; color: string | null; _count: { memories: number } }>>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderPopoverMemoryId, setFolderPopoverMemoryId] = useState<string | null>(null);
```

Add folder fetch in useEffect (after the categories fetch around line 118):

```typescript
  useEffect(() => {
    fetch("/api/folders").then(r => r.json()).then(setFolders).catch(() => {});
  }, []);
```

Update the `fetchMemories` callback to include folder filter. In the params construction (around line 126), add:

```typescript
    if (selectedFolder) params.set("folderId", selectedFolder);
```

And add `selectedFolder` to the dependency array of `useCallback`.

- [ ] **Step 3: Add date formatting helper**

Add after the `strengthTooltip` function (around line 383):

```typescript
function formatMemoryDate(memory: Memory): string {
  const dateStr = memory.conversation?.sourceDate || memory.createdAt;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
```

- [ ] **Step 4: Update memory card metadata row**

Replace the metadata section inside each memory card (the `<div className="flex items-center gap-2 mt-2.5 flex-wrap">` block, lines 766-805). Replace with:

```tsx
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <ServiceLogo type={memory.source.type} size={8} showBackground={false} />
                      <span className={`maze-tag ${categoryColors[memory.category] || ""}`}>
                        {memory.category.replace("_", " ")}
                      </span>
                      {memory.conversation?.title && (
                        <span className="text-[11px] text-muted-foreground truncate max-w-[200px]" title={memory.conversation.title}>
                          {memory.conversation.title}
                        </span>
                      )}
                      {memory.project && (
                        <button
                          className="maze-tag bg-lime/10 text-lime hover:bg-lime/20 transition-colors cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSearch(memory.project!);
                            setPage(1);
                          }}
                          title={`Filter by project: ${memory.project}`}
                        >
                          {memory.project}
                        </button>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {formatMemoryDate(memory)}
                      </span>
                      {memory.sensitive && (
                        <span className="maze-tag bg-red-50 text-red-600">sensitive</span>
                      )}
                      {memory.quality?.isTechnical && (
                        <span className="maze-tag bg-amber-100 text-amber-700">technical</span>
                      )}
                      {memory.folders.length > 0 && memory.folders.map((mf) => (
                        <span key={mf.folder.id} className="maze-tag bg-muted text-muted-foreground text-[10px]">
                          {mf.folder.name}
                        </span>
                      ))}
                      <span className="text-[11px] text-muted-foreground">
                        {memory.referenceCount} ref{memory.referenceCount === 1 ? "" : "s"}
                      </span>
                    </div>
```

Add `import { ServiceLogo } from "@/components/features/service-logos";` at the top of the file.

- [ ] **Step 5: Add Folders section to sidebar**

After the category sidebar (after the closing `</div>` of the `lg:w-48` sidebar div, around line 709), add a Folders section. Actually, add it inside the sidebar div, below the category buttons:

```tsx
          {/* Folders */}
          <div className="mt-6 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-medium">Folders</span>
            </div>
            {folders.map((folder) => (
              <button
                key={folder.id}
                className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  selectedFolder === folder.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                onClick={() => {
                  setSelectedFolder(selectedFolder === folder.id ? null : folder.id);
                  setPage(1);
                }}
              >
                {folder.name}
                {folder._count.memories > 0 && <span className="float-right text-[11px] text-muted-foreground">{folder._count.memories}</span>}
              </button>
            ))}
            <div className="mt-2 flex gap-1">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && newFolderName.trim()) {
                    const res = await fetch("/api/folders", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ name: newFolderName.trim() }),
                    });
                    if (res.ok) {
                      const folder = await res.json();
                      setFolders((prev) => [...prev, folder]);
                      setNewFolderName("");
                      toast.success(`Folder "${folder.name}" created`);
                    }
                  }
                }}
                placeholder="New folder..."
                className="h-8 text-[12px]"
              />
            </div>
          </div>
```

- [ ] **Step 6: Add folder assignment button to memory card actions**

In the memory card actions area (around line 833, in the non-archive action buttons), add a folder assignment button before the edit button:

```tsx
                        <div className="relative">
                          <button
                            className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg"
                            onClick={() => setFolderPopoverMemoryId(folderPopoverMemoryId === memory.id ? null : memory.id)}
                            title="Assign to folders"
                          >
                            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          {folderPopoverMemoryId === memory.id && (
                            <div className="absolute right-0 top-9 z-50 maze-card w-48 py-2 shadow-lg" onClick={(e) => e.stopPropagation()}>
                              <p className="px-3 py-1 text-[11px] font-medium text-muted-foreground">Assign to folders</p>
                              {folders.map((folder) => {
                                const isAssigned = memory.folders.some((mf) => mf.folder.id === folder.id);
                                return (
                                  <label key={folder.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={isAssigned}
                                      onChange={async () => {
                                        const currentFolderIds = memory.folders.map((mf) => mf.folder.id);
                                        const newFolderIds = isAssigned
                                          ? currentFolderIds.filter((id) => id !== folder.id)
                                          : [...currentFolderIds, folder.id];
                                        await fetch(`/api/memories/${memory.id}`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ folderIds: newFolderIds }),
                                        });
                                        await fetchMemories();
                                        // Refresh folder counts
                                        fetch("/api/folders").then(r => r.json()).then(setFolders).catch(() => {});
                                        setFolderPopoverMemoryId(null);
                                      }}
                                      className="rounded"
                                    />
                                    <span className="text-[12px]">{folder.name}</span>
                                  </label>
                                );
                              })}
                              {folders.length === 0 && (
                                <p className="px-3 py-2 text-[11px] text-muted-foreground">No folders yet</p>
                              )}
                            </div>
                          )}
                        </div>
```

Add `FolderOpen` to the lucide-react imports at the top of the file.

- [ ] **Step 7: Verify the app builds and renders**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx next build 2>&1 | tail -10`

Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
cd /Users/sanjay/projects/ProjOTW/cortex
git add src/app/memories/page.tsx
git commit -m "feat: enrich memory cards with dates, source logos, project badges, folder sidebar and assignment"
```

---

### Task 7: Dashboard — visual source differentiation

**Files:**
- Modify: `src/app/dashboard/page.tsx:218-252` (sources section)

**Interfaces:**
- Consumes: `ServiceLogo` from Task 5, `SOURCE_TYPE_DISPLAY` from `src/contracts/source.ts`
- Produces: Dashboard sources with real logos and clear ChatGPT vs Claude labeling

- [ ] **Step 1: Update dashboard source cards to use inline logos**

The dashboard already uses `<SourceIcon>` which wraps `<ServiceLogo>`. The `SOURCE_TYPE_DISPLAY` map already differentiates types. The main improvement is making the labels more explicit about export size and type.

In `src/app/dashboard/page.tsx`, update the source display text (around line 228) to include the source type more prominently:

Replace:
```tsx
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {displayType}{source.accountLabel ? ` (${source.accountLabel})` : ""}
                      </span>
```

With:
```tsx
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {displayType} Export{source.accountLabel ? ` · ${source.accountLabel}` : ""}
                      </span>
```

But only for export types. Update the display logic:

```tsx
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {displayType}{source.type.endsWith("_export") ? " Export" : ""}{source.accountLabel ? ` · ${source.accountLabel}` : ""}
                      </span>
```

- [ ] **Step 2: Verify the build**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx next build 2>&1 | tail -10`

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
cd /Users/sanjay/projects/ProjOTW/cortex
git add src/app/dashboard/page.tsx
git commit -m "feat: improve dashboard source labels to differentiate ChatGPT vs Claude exports"
```

---

### Task 8: Run all tests and verify

**Files:** (no new files)

**Interfaces:**
- Consumes: all prior tasks
- Produces: green test suite

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx vitest run 2>&1 | tail -30`

Expected: All tests PASS. If any fail, fix the specific failure before proceeding.

- [ ] **Step 2: Run the build**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npx next build 2>&1 | tail -15`

Expected: Build succeeds with no errors.

- [ ] **Step 3: Start the dev server and smoke test**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npm run dev &`

Then verify the memories page loads at http://localhost:3000/memories and the dashboard at http://localhost:3000/dashboard.

- [ ] **Step 4: Start the MCP server**

Run: `cd /Users/sanjay/projects/ProjOTW/cortex && npm run mcp:http &`

Verify it starts on port 3001 with health check.
