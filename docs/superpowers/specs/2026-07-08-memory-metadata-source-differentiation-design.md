# Memory Metadata + Source Differentiation

**Date:** 2026-07-08
**Status:** Approved
**Sub-project:** 1 of 4 (Memory metadata → Folders → UI overhaul → E2E tests)

## Summary

Enrich memory cards with dates, source conversation context, project attribution, and visual source differentiation. Add a folder model for user-organized memory collections. Replace placeholder service icons with real logos.

## Schema Changes

### New field on `Memory`

```prisma
project  String?  // auto-detected or user-assigned, e.g. "Cortex", "Oasis"
```

### New model `Folder`

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
```

### New join table `MemoryFolder`

```prisma
model MemoryFolder {
  id        String   @id @default(cuid())
  memoryId  String
  memory    Memory   @relation(fields: [memoryId], references: [id])
  folderId  String
  folder    Folder   @relation(fields: [folderId], references: [id])
  createdAt DateTime @default(now())

  @@unique([memoryId, folderId])
}
```

### Memory model additions

Add to the existing `Memory` model:

```prisma
project       String?
folders       MemoryFolder[]
```

## Project Auto-Detection

| Source | Detection method |
|--------|-----------------|
| Claude Code | Parse project name from `source.config.path` (e.g. `.../ProjOTW/cortex/` -> `"Cortex"`) |
| ChatGPT export | LLM detects project references during extraction pipeline |
| Claude.ai export | LLM detects project references during extraction pipeline |
| Poke | LLM detects project references during extraction pipeline |
| Manual / MCP | Optionally passed in via API field |

### Pipeline changes

- Add `project?: string` to `ExtractedMemory` Zod schema in `src/contracts/pipeline.ts`
- Update extraction prompt in `src/pipeline/extract.ts` to include: "If this memory relates to a specific project, repo, or product the user is working on, include its short name in the `project` field. Otherwise omit it."
- In `src/pipeline/commit.ts`, auto-detect project from Claude Code source paths before writing to DB

## API Changes

### `GET /api/memories` — enriched response

Add to the response per memory:
- `conversation.sourceDate` (already joined, just not returned)
- `project` (new field)
- `folders` — array of `{ id, name, slug, color }` via join table

New query params:
- `?project=Cortex` — filter by project name
- `?folderId=xxx` — filter by folder

### `PATCH /api/memories/[id]` — new fields

Accept:
- `project: string | null` — set or clear project attribution
- `folderIds: string[]` — replace folder assignments for this memory

### New route: `/api/folders`

- `GET` — list all folders with memory counts, ordered by `sortOrder`
- `POST` — create folder `{ name, parentId?, icon?, color? }`
- `PATCH /api/folders/[id]` — rename, reorder, reparent
- `DELETE /api/folders/[id]` — delete folder, detach memories (does not delete memories)

### New route: `/api/folders/[id]/memories`

- `POST { memoryIds: string[] }` — bulk assign memories to a folder

## UI Changes

### Memory card metadata row

Replace current `via {source.name} · {truncated title} · {path}` with:

```
[16px source logo] "Exploring Cortex architecture" · Cortex · Jul 3, 2026
```

- **Source logo:** Inline SVG (ChatGPT, Claude, Poke, Granola, Manual)
- **Conversation title:** Full title, `text-ellipsis` with tooltip for overflow
- **Project badge:** Clickable pill/tag that filters by project
- **Date:** `conversation.sourceDate` if available, else `memory.createdAt`. Relative format for < 7 days ("3d ago"), absolute for older ("Jul 3, 2026")

### Memories page sidebar — Folders section

Below the existing category filter list:

- "Folders" heading with a "+" button
- List of user-created folders with memory counts
- Click to filter; active folder highlighted
- Nested folders shown with indentation
- Inline rename on double-click
- Delete with confirmation

### Memory card actions — folder assignment

Add a folder icon button to the action row. Opens a popover with checkboxes for each folder (many-to-many).

### Dashboard source differentiation

On the dashboard sources section, show real service logo next to each source. Label exports clearly: "ChatGPT Export (196 MB)" vs "Claude.ai Export" vs "Claude Code".

## Service Logos

Replace placeholder icons in `src/components/features/service-logos.tsx`:

| Service | Logo | Notes |
|---------|------|-------|
| ChatGPT | OpenAI hexagonal flower logomark | Green-on-white or monochrome |
| Claude | Anthropic starburst logomark | Orange/tan or monochrome |
| Poke | Poke by Interaction logomark | Purple or monochrome |
| Granola | Granola logomark | Brown or monochrome |
| Manual | Lucide `PenLine` icon | Muted foreground color |
| Cortex | Custom brain-circuit node SVG | Cactus green, replaces current Zap icon |

### Cortex logo

Replace the Lucide `Zap` icon with a custom SVG: minimal brain-circuit node motif in cactus green (#5B7553). Used in:
- Top nav
- Sidebar header
- Landing page hero
- Favicon (`public/icon.svg`)

## Files to modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `project` to Memory, add Folder + MemoryFolder models |
| `src/contracts/pipeline.ts` | Add `project` to ExtractedMemory schema |
| `src/pipeline/extract.ts` | Update LLM prompt to detect project names |
| `src/pipeline/commit.ts` | Auto-detect project from Claude Code paths |
| `src/app/api/memories/route.ts` | Return enriched metadata, add project/folder filters |
| `src/app/api/memories/[id]/route.ts` | Accept project and folderIds in PATCH |
| `src/app/api/folders/route.ts` | New: CRUD for folders |
| `src/app/api/folders/[id]/route.ts` | New: update/delete single folder |
| `src/app/api/folders/[id]/memories/route.ts` | New: bulk assign memories |
| `src/app/memories/page.tsx` | Add dates, logos, project badges, folder sidebar, folder assignment |
| `src/app/dashboard/page.tsx` | Add logos, differentiate source labels |
| `src/components/features/service-logos.tsx` | Replace with real SVG logos |
| `src/components/top-nav.tsx` | Replace Zap with Cortex logo |
| `src/components/app-sidebar.tsx` | Replace Zap with Cortex logo |
| `src/app/landing/page.tsx` | Replace Zap with Cortex logo |
| `public/icon.svg` | Replace with Cortex logo SVG |

## Out of scope

- Full UI overhaul (sub-project 3)
- Playwright E2E tests (sub-project 4)
- Drag-and-drop folder assignment (stretch goal for sub-project 2)
- Vector embeddings for semantic folder auto-assignment
