"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Search, Download, Archive, Brain, Pencil, Sparkles, GitMerge, X, Zap, ChevronLeft, ChevronRight, Filter, Star, Trash2, RotateCcw, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ServiceLogo } from "@/components/features/service-logos";

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

type DisplayMemory = Memory & {
  duplicateIds: string[];
  duplicateGroupIds: string[];
  duplicateCopies: number;
};

interface CategoryDef {
  slug: string;
  label: string;
  color: string;
}

interface DedupGroup {
  canonical: string;
  duplicateIds: string[];
  reasoning: string;
}

interface PropagationDestination {
  success: boolean;
}

type MemoryFilter = "all" | "strong" | "recent" | "cleanup";
type MemorySort = "strength" | "recent" | "references" | "category";
type MemoryScope = "active" | "archive";

const PAGE_SIZE_OPTIONS = [12, 24, 48];

function normalizeDuplicateKey(memory: Memory): string {
  return `${memory.category}:${memory.content
    .toLowerCase()
    .replace(/[`"'’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;
}

function strongerMemory(a: Memory, b: Memory): Memory {
  if (b.manuallyStrong !== a.manuallyStrong) return b.manuallyStrong ? b : a;
  if (b.strength !== a.strength) return b.strength > a.strength ? b : a;
  if (b.referenceCount !== a.referenceCount) return b.referenceCount > a.referenceCount ? b : a;
  return new Date(b.lastReferencedAt) > new Date(a.lastReferencedAt) ? b : a;
}

function collapseDuplicateMemories(memories: Memory[]): DisplayMemory[] {
  const groups = new Map<string, Memory[]>();
  for (const memory of memories) {
    const key = normalizeDuplicateKey(memory);
    groups.set(key, [...(groups.get(key) ?? []), memory]);
  }

  return Array.from(groups.values()).map((group) => {
    const representative = group.reduce(strongerMemory);
    const duplicateIds = group
      .filter((memory) => memory.id !== representative.id)
      .map((memory) => memory.id);
    return {
      ...representative,
      duplicateIds,
      duplicateGroupIds: group.map((memory) => memory.id),
      duplicateCopies: group.length,
      referenceCount: group.reduce((sum, memory) => sum + memory.referenceCount, 0),
      manuallyStrong: group.some((memory) => memory.manuallyStrong),
      lastReferencedAt: group.reduce(
        (latest, memory) => new Date(memory.lastReferencedAt) > new Date(latest) ? memory.lastReferencedAt : latest,
        representative.lastReferencedAt
      ),
    };
  });
}

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editDialog, setEditDialog] = useState<{ memory: Memory; content: string } | null>(null);
  const [dedupResult, setDedupResult] = useState<{ groups: DedupGroup[]; uniqueCount: number; duplicateCount: number } | null>(null);
  const [dedupRunning, setDedupRunning] = useState(false);
  const [quickStatement, setQuickStatement] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [pushingPoke, setPushingPoke] = useState(false);
  const [scope, setScope] = useState<MemoryScope>("active");
  const [filter, setFilter] = useState<MemoryFilter>("all");
  const [sort, setSort] = useState<MemorySort>("strength");
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(1);
  const [bulkArchiving, setBulkArchiving] = useState(false);
  const [recentReferenceCutoff] = useState(() => Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [totalMemories, setTotalMemories] = useState(0);
  const [folders, setFolders] = useState<Array<{ id: string; name: string; slug: string; color: string | null; _count: { memories: number } }>>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderPopoverMemoryId, setFolderPopoverMemoryId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/categories").then(r => r.json()).then(setCategories);
  }, []);

  useEffect(() => {
    fetch("/api/folders").then(r => r.json()).then(setFolders).catch(() => {});
  }, []);

  const categoryColors: Record<string, string> = Object.fromEntries(categories.map(c => [c.slug, c.color]));

  const fetchMemories = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: scope === "archive" ? "archived" : "active" });
    if (selectedCategory) params.set("category", selectedCategory);
    if (search) params.set("q", search);
    if (selectedFolder) params.set("folderId", selectedFolder);
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    try {
      const res = await fetch(`/api/memories?${params}`);
      const data = await res.json();
      if (data && Array.isArray(data.items)) {
        setMemories(data.items);
        setTotalMemories(data.total);
      } else if (Array.isArray(data)) {
        setMemories(data);
        setTotalMemories(data.length);
      }
    } catch {
      toast.error("Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, [scope, selectedCategory, search, selectedFolder, page, pageSize]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchMemories();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchMemories]);

  async function handleArchive(id: string) {
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "archived",
          reason: "Archived by user",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setMemories((prev) => prev.filter((m) => m.id !== id));
      toast.success("Memory archived");
    } catch {
      toast.error("Failed to archive memory");
    }
  }

  async function handleRestore(id: string) {
    try {
      const res = await fetch(`/api/memories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error("Failed");
      setMemories((prev) => prev.filter((m) => m.id !== id));
      toast.success("Memory restored");
    } catch {
      toast.error("Failed to restore memory");
    }
  }

  async function handleDeleteFromArchive(id: string) {
    try {
      const res = await fetch(`/api/memories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setMemories((prev) => prev.filter((m) => m.id !== id));
      toast.success("Memory deleted");
    } catch {
      toast.error("Failed to delete memory");
    }
  }

  async function handleArchiveTechnical(ids: string[]) {
    if (ids.length === 0) return;
    setBulkArchiving(true);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/memories/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "archived",
              reason: "Archived as technical implementation detail",
            }),
          })
        )
      );
      setMemories((prev) => prev.filter((m) => !ids.includes(m.id)));
      toast.success(`Archived ${ids.length} technical memor${ids.length === 1 ? "y" : "ies"}`);
    } catch {
      toast.error("Failed to archive technical memories");
    } finally {
      setBulkArchiving(false);
    }
  }

  async function handleMergeDuplicates(memory: DisplayMemory) {
    if (memory.duplicateGroupIds.length < 2) return;
    try {
      const res = await fetch("/api/deduplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groups: [{
            canonical: memory.content,
            duplicateIds: memory.duplicateGroupIds,
          }],
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(`Merged ${data.merged} group, archived ${data.archived} duplicate${data.archived === 1 ? "" : "s"}`);
      await fetchMemories();
    } catch {
      toast.error("Failed to merge duplicates");
    }
  }

  async function handleEdit(memory: Memory, newContent: string) {
    try {
      await fetch(`/api/memories/${memory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      setMemories((prev) => prev.map((m) => (m.id === memory.id ? { ...m, content: newContent } : m)));
      setEditDialog(null);
      toast.success("Memory updated");
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleToggleStrong(memory: DisplayMemory) {
    const nextValue = !memory.manuallyStrong;
    try {
      const res = await fetch(`/api/memories/${memory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manuallyStrong: nextValue }),
      });
      if (!res.ok) throw new Error("Failed");
      await fetchMemories();
      toast.success(nextValue ? "Marked as strong" : "Removed manual strong mark");
    } catch {
      toast.error("Failed to update memory strength");
    }
  }

  async function handleExport(format: string) {
    try {
      const res = await fetch(`/api/export/${format}`);
      if (format === "json") {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        downloadBlob(blob, "cortex-memories.json");
      } else {
        const text = await res.text();
        const ext = format === "claude" ? "md" : "txt";
        const blob = new Blob([text], { type: "text/plain" });
        downloadBlob(blob, `cortex-${format}.${ext}`);
      }
      toast.success(`Exported as ${format} format`);
    } catch {
      toast.error("Export failed");
    }
  }

  async function handlePushToPoke() {
    setPushingPoke(true);
    try {
      const res = await fetch("/api/export/poke");
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Pushed ${memories.length} memories to Poke`);
      } else {
        toast.error(data.error || "Poke push failed");
      }
    } catch {
      toast.error("Poke push failed");
    } finally {
      setPushingPoke(false);
    }
  }

  async function handleDedupScan() {
    setDedupRunning(true);
    try {
      const res = await fetch("/api/deduplicate");
      const data = await res.json();
      setDedupResult(data);
      if (data.duplicateCount === 0) {
        toast.success("No duplicates found");
      } else {
        toast.info(`Found ${data.duplicateCount} duplicates in ${data.groups.length} groups`);
      }
    } catch {
      toast.error("Dedup scan failed");
    } finally {
      setDedupRunning(false);
    }
  }

  async function handleDedupApply() {
    if (!dedupResult?.groups.length) return;
    try {
      const res = await fetch("/api/deduplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: dedupResult.groups }),
      });
      const data = await res.json();
      toast.success(`Merged ${data.merged} groups, archived ${data.archived} duplicates`);
      setDedupResult(null);
      fetchMemories();
    } catch {
      toast.error("Failed to apply dedup");
    }
  }

  async function handleQuickStatement() {
    if (!quickStatement.trim()) return;
    setQuickLoading(true);
    try {
      const res = await fetch("/api/memories/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement: quickStatement }),
      });
      const data = await res.json();
      if (res.ok) {
        const destinations = (data.propagation?.destinations ?? []) as PropagationDestination[];
        const destCount = destinations.filter((d) => d.success).length;
        toast.success(data.message || `${data.action === "create" ? "Created" : data.action === "update" ? "Updated" : "Deleted"}: ${data.content}. Propagated to ${destCount} platform(s).`);
        setQuickStatement("");
        fetchMemories();
      } else {
        toast.error(data.error || "Failed to process statement");
      }
    } catch {
      toast.error("Failed to process statement");
    } finally {
      setQuickLoading(false);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function strengthBarColor(strength: number): string {
    if (strength >= 0.8) return "bg-amber-400";
    if (strength >= 0.4) return "bg-lime";
    return "bg-muted-foreground/20";
  }

  function strengthTooltip(memory: Memory): string {
    const date = new Date(memory.lastReferencedAt);
    const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return `${memory.manuallyStrong ? "Manually marked strong · " : ""}Referenced ${memory.referenceCount}x · Last seen ${dateStr} · Strength ${memory.strength.toFixed(2)}`;
  }

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

  const uniqueMemories = collapseDuplicateMemories(memories);
  const hiddenDuplicateCount = memories.length - uniqueMemories.length;
  const categoryCounts = new Map<string, number>();
  for (const m of uniqueMemories) {
    categoryCounts.set(m.category, (categoryCounts.get(m.category) || 0) + 1);
  }

  const isArchiveScope = scope === "archive";
  const cleanupCount = uniqueMemories.filter((m) => m.quality?.isTechnical).length;
  const strongCount = uniqueMemories.filter((m) => m.strength >= 0.45).length;
  const recentCount = uniqueMemories.filter((m) => new Date(m.lastReferencedAt).getTime() >= recentReferenceCutoff).length;

  const filtered = uniqueMemories
    .filter((m) => !selectedCategory || m.category === selectedCategory)
    .filter((m) => {
      if (filter === "strong") return m.strength >= 0.45;
      if (filter === "recent") return new Date(m.lastReferencedAt).getTime() >= recentReferenceCutoff;
      if (filter === "cleanup") return Boolean(m.quality?.isTechnical);
      return true;
    })
    .sort((a, b) => {
      if (sort === "recent") return new Date(b.lastReferencedAt).getTime() - new Date(a.lastReferencedAt).getTime();
      if (sort === "references") return b.referenceCount - a.referenceCount || b.strength - a.strength;
      if (sort === "category") return a.category.localeCompare(b.category) || b.strength - a.strength;
      return b.strength - a.strength || b.referenceCount - a.referenceCount;
    });
  const totalPages = Math.max(1, Math.ceil(totalMemories / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = filtered;
  const visibleTechnicalIds = pageItems.filter((m) => m.quality?.isTechnical).map((m) => m.id);
  const visibleDuplicateGroups = pageItems.filter((m) => m.duplicateCopies > 1);

  function getCategoryAccentColor(category: string): string {
    const colors: Record<string, string> = {
      identity: '#3b82f6',
      education_career: '#8b5cf6',
      projects: '#10b981',
      research: '#eab308',
      preferences: '#f97316',
      goals: '#ec4899',
      relationships: '#6366f1',
      writing_voice: '#06b6d4',
      workflows: '#14b8a6',
      temporary: '#6b7280',
    };
    return colors[category] || '#6b7280';
  }

  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" data-animate>
        <div>
          <p className="maze-eyebrow mb-4">Library</p>
          <h1>{isArchiveScope ? "Archive" : "Memories"}</h1>
          <p className="maze-body mt-3">
            {totalMemories} {isArchiveScope ? "archived" : "unique"} memor{totalMemories !== 1 ? "ies" : "y"}
            {!isArchiveScope && hiddenDuplicateCount > 0 && (
              <> · {hiddenDuplicateCount} duplicate cop{hiddenDuplicateCount === 1 ? "y" : "ies"} hidden</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
            <button
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${scope === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => {
                setScope("active");
                setFilter("all");
                setPage(1);
              }}
            >
              <Brain className="h-3.5 w-3.5" />
              Active
            </button>
            <button
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${scope === "archive" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => {
                setScope("archive");
                setFilter("all");
                setPage(1);
              }}
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </button>
          </div>
          {!isArchiveScope && (
            <>
              <button
                className="maze-btn maze-btn-outline gap-1.5 text-[13px]"
                onClick={handlePushToPoke}
                disabled={pushingPoke}
              >
                <Zap className={`h-3.5 w-3.5 ${pushingPoke ? "animate-spin" : ""}`} />
                {pushingPoke ? "Syncing..." : "Sync Poke"}
              </button>
              <button
                className="maze-btn maze-btn-outline gap-1.5 text-[13px]"
                onClick={handleDedupScan}
                disabled={dedupRunning}
              >
                <Sparkles className={`h-3.5 w-3.5 ${dedupRunning ? "animate-spin" : ""}`} />
                {dedupRunning ? "Scanning..." : "Deduplicate"}
              </button>
              <div className="relative">
                <button className="maze-btn gap-1.5 text-[13px]" onClick={() => {
                  const el = document.getElementById("export-menu");
                  if (el) el.classList.toggle("hidden");
                }}>
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
                <div id="export-menu" className="hidden absolute right-0 mt-2 w-56 maze-card py-1 z-50">
                  {[
                    { key: "chatgpt", label: "ChatGPT (Custom Instructions)" },
                    { key: "claude", label: "Claude (CLAUDE.md)" },
                    { key: "json", label: "JSON (full export)" },
                    { key: "poke", label: "Push to Poke" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-muted transition-colors"
                      onClick={() => {
                        if (key === "poke") {
                          handlePushToPoke();
                        } else {
                          handleExport(key);
                        }
                        document.getElementById("export-menu")?.classList.add("hidden");
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dedup Results Panel */}
      {!isArchiveScope && dedupResult && dedupResult.groups.length > 0 && (
        <div className="maze-block space-y-4" data-animate>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitMerge className="h-4 w-4 text-lime" />
              <h3 className="text-base">Duplicate Scan Results</h3>
            </div>
            <div className="flex items-center gap-2">
              <button className="maze-btn maze-btn-lime text-[12px] h-8" onClick={handleDedupApply}>
                Merge All ({dedupResult.duplicateCount} duplicates)
              </button>
              <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0" onClick={() => setDedupResult(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {dedupResult.groups.map((group, i) => (
              <div key={i} className="maze-card-static p-4">
                <p className="text-[11px] text-muted-foreground mb-2">{group.reasoning}</p>
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="maze-eyebrow text-lime mb-1">Keep</p>
                    <p className="text-[13px] font-medium">{group.canonical}</p>
                  </div>
                  <div className="flex-1">
                    <p className="maze-eyebrow text-red-400 mb-1">Archive ({group.duplicateIds.length - 1})</p>
                    {group.duplicateIds.slice(1).map((id) => {
                      const mem = memories.find((m) => m.id === id);
                      return mem && <p key={id} className="text-[12px] text-muted-foreground line-through">{mem.content}</p>;
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Statement */}
      {!isArchiveScope && (
      <div className="bg-lime-50/50 border border-lime-200 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={16} className="text-lime-600" />
          <span className="text-sm font-medium text-lime-800">Quick Statement</span>
        </div>
        <p className="text-xs text-lime-600 mb-3">Type a fact about yourself. It will be saved and propagated to all connected platforms.</p>
        <div className="flex gap-2">
          <Input
            value={quickStatement}
            onChange={(e) => setQuickStatement(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleQuickStatement()}
            placeholder='e.g., "My age is 25" or "I now work at Acme Corp"'
            disabled={quickLoading}
            className="flex-1"
          />
          <button
            onClick={handleQuickStatement}
            disabled={quickLoading || !quickStatement.trim()}
            className="px-4 py-2 bg-lime-600 text-white rounded-md hover:bg-lime-700 disabled:opacity-50 text-sm font-medium"
          >
            {quickLoading ? "Processing..." : "Apply"}
          </button>
        </div>
      </div>
      )}

      {/* Search */}
      <div className="maze-block space-y-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search memories..."
              className="pl-10 h-10 rounded-lg border-border shadow-sm"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              onKeyDown={(e) => e.key === "Enter" && fetchMemories()}
            />
          </div>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as MemorySort);
              setPage(1);
            }}
            className="h-10 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground"
            aria-label="Sort memories"
          >
            <option value="strength">Strongest first</option>
            <option value="recent">Recently referenced</option>
            <option value="references">Most referenced</option>
            <option value="category">Category</option>
          </select>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="h-10 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground"
            aria-label="Memories per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size} per page</option>
            ))}
          </select>
        </div>

        {!isArchiveScope && (
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "all", label: "All", count: uniqueMemories.length },
            { key: "strong", label: "Strong", count: strongCount },
            { key: "recent", label: "Recent", count: recentCount },
            { key: "cleanup", label: "Cleanup", count: cleanupCount },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setFilter(item.key as MemoryFilter);
                setPage(1);
              }}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                filter === item.key ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.key === "cleanup" && <Filter className="h-3.5 w-3.5" />}
              {item.label}
              <span className={filter === item.key ? "text-background/70" : "text-muted-foreground/70"}>
                {item.count}
              </span>
            </button>
          ))}
          {visibleTechnicalIds.length > 0 && (
            <button
              className="maze-btn maze-btn-outline ml-auto h-9 text-[12px]"
              onClick={() => handleArchiveTechnical(visibleTechnicalIds)}
              disabled={bulkArchiving}
            >
              <Archive className="h-3.5 w-3.5" />
              {bulkArchiving ? "Archiving..." : `Archive visible technical (${visibleTechnicalIds.length})`}
            </button>
          )}
          {visibleDuplicateGroups.length > 0 && (
            <button
              className="maze-btn maze-btn-outline h-9 text-[12px]"
              onClick={async () => {
                for (const memory of visibleDuplicateGroups) {
                  await handleMergeDuplicates(memory);
                }
              }}
            >
              <GitMerge className="h-3.5 w-3.5" />
              Merge visible duplicate groups ({visibleDuplicateGroups.length})
            </button>
          )}
        </div>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Category sidebar */}
        <div className="shrink-0 space-y-0.5 lg:w-48">
          <button
            className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              selectedCategory === null ? "bg-lime/10 text-foreground border-l-2 border-lime" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            onClick={() => {
              setSelectedCategory(null);
              setPage(1);
            }}
          >
            All
            <span className="float-right text-[11px] text-muted-foreground">{uniqueMemories.length}</span>
          </button>
          {categories.map((cat) => {
            const count = categoryCounts.get(cat.slug) || 0;
            return (
              <button
                key={cat.slug}
                className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  selectedCategory === cat.slug ? "bg-lime/10 text-foreground border-l-2 border-lime" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                onClick={() => {
                  setSelectedCategory(cat.slug);
                  setPage(1);
                }}
              >
                {cat.label}
                {count > 0 && <span className="float-right text-[11px] text-muted-foreground">{count}</span>}
              </button>
            );
          })}
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
        </div>

        {/* Memory list */}
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted-foreground">
              Showing {totalMemories === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + pageSize, totalMemories)} of {totalMemories}
            </p>
            <div className="flex items-center gap-2">
              <button
                className="maze-btn maze-btn-outline h-8 w-8 min-h-0 p-0"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage <= 1}
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-[12px] text-muted-foreground">
                Page {currentPage} / {totalPages}
              </span>
              <button
                className="maze-btn maze-btn-outline h-8 w-8 min-h-0 p-0"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="maze-card h-20 animate-pulse" />)}
            </div>
          ) : pageItems.length === 0 ? (
            <div className="maze-card flex flex-col items-center justify-center py-14 text-center">
              <div className="h-14 w-14 rounded-2xl bg-lime/10 flex items-center justify-center mb-5">
                <Brain className="h-6 w-6 text-lime" />
              </div>
              <h3 className="text-base font-semibold">{isArchiveScope ? "Archive is empty" : "No memories yet"}</h3>
              <p className="text-sm text-muted-foreground mt-1.5">
                {isArchiveScope ? "Archived memories will appear here" : "Upload a conversation export to get started"}
              </p>
            </div>
          ) : (
            pageItems.map((memory) => (
              <div
                key={memory.id}
                className={`maze-card group relative overflow-hidden ${
                  memory.strength < 0.1 ? "opacity-60" : ""
                } ${memory.strength > 0.7 ? "border-lime/30" : ""} ${memory.manuallyStrong ? "ring-1 ring-amber-300/70" : ""} ${memory.quality?.isTechnical ? "border-amber-300/70 bg-amber-50/30" : ""}`}
                style={{ '--accent-color': getCategoryAccentColor(memory.category) } as React.CSSProperties}
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r" style={{ background: getCategoryAccentColor(memory.category) }} />
                <div className="flex items-start justify-between p-6 pl-5">
                  <div className="min-w-0 flex-1">
                    <p className={`text-[15px] leading-relaxed ${memory.strength > 0.7 ? "font-medium" : ""}`}>
                      {memory.content}
                    </p>
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
                  </div>
                  <div className="flex gap-0.5 opacity-100 transition-opacity shrink-0 ml-4">
                    {isArchiveScope ? (
                      <>
                        <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => handleRestore(memory.id)} title="Restore">
                          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => handleDeleteFromArchive(memory.id)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={`maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg ${memory.manuallyStrong ? "text-amber-500" : "text-muted-foreground"}`}
                          onClick={() => handleToggleStrong(memory)}
                          title={memory.manuallyStrong ? "Remove manual strong mark" : "Mark as strong"}
                          aria-label={memory.manuallyStrong ? "Remove manual strong mark" : "Mark as strong"}
                        >
                          <Star className={`h-3.5 w-3.5 ${memory.manuallyStrong ? "fill-current" : ""}`} />
                        </button>
                        {memory.duplicateCopies > 1 && (
                          <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => handleMergeDuplicates(memory)} title="Merge duplicate copies">
                            <GitMerge className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
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
                        <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => setEditDialog({ memory, content: memory.content })} title="Edit">
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => handleArchive(memory.id)} title="Archive">
                          <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {/* Heat bar */}
                <div
                  className="absolute bottom-0 left-0 h-1 transition-all duration-500 maze-strength-gradient"
                  style={{ width: `${(memory.strength * 100).toFixed(1)}%` }}
                  title={strengthTooltip(memory)}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditDialog(null)}>
          <div className="maze-card w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">Edit Memory</h3>
            <Textarea
              value={editDialog.content}
              onChange={(e) => setEditDialog((prev) => prev ? { ...prev, content: e.target.value } : null)}
              rows={4}
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <button className="maze-btn maze-btn-ghost h-9 text-[13px]" onClick={() => setEditDialog(null)}>Cancel</button>
              <button className="maze-btn h-9 text-[13px]" onClick={() => handleEdit(editDialog.memory, editDialog.content)}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
