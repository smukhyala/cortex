"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Search, Download, Archive, Brain, Pencil, Sparkles, GitMerge, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
interface Memory {
  id: string;
  content: string;
  subject: string;
  category: string;
  confidence: number;
  temporality: string;
  sensitive: boolean;
  createdAt: string;
  source: { name: string; type: string; config: string };
  conversation: { title: string; externalId: string } | null;
}

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

  useEffect(() => {
    fetch("/api/categories").then(r => r.json()).then(setCategories);
  }, []);

  const categoryColors: Record<string, string> = Object.fromEntries(categories.map(c => [c.slug, c.color]));

  const fetchMemories = useCallback(async () => {
    const params = new URLSearchParams({ status: "active" });
    if (selectedCategory) params.set("category", selectedCategory);
    if (search) params.set("q", search);
    try {
      const res = await fetch(`/api/memories?${params}`);
      setMemories(await res.json());
    } catch {
      toast.error("Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchMemories();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchMemories]);

  async function handleArchive(id: string) {
    try {
      await fetch(`/api/memories/${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
      toast.success("Memory archived");
    } catch {
      toast.error("Failed to archive");
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
        toast.success(`${data.action === "create" ? "Created" : data.action === "update" ? "Updated" : "Deleted"}: ${data.content}. Propagated to ${destCount} platform(s).`);
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

  const categoryCounts = new Map<string, number>();
  for (const m of memories) {
    categoryCounts.set(m.category, (categoryCounts.get(m.category) || 0) + 1);
  }

  const filtered = memories.filter((m) => !selectedCategory || m.category === selectedCategory);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between" data-animate>
        <div>
          <p className="maze-eyebrow mb-4">Library</p>
          <h1>Memories</h1>
          <p className="maze-body mt-3">
            {memories.length} active memor{memories.length !== 1 ? "ies" : "y"}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                  handleExport(key);
                  document.getElementById("export-menu")?.classList.add("hidden");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          </div>
        </div>
      </div>

      {/* Dedup Results Panel */}
      {dedupResult && dedupResult.groups.length > 0 && (
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search memories..."
          className="pl-10 h-10 rounded-lg border-border shadow-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchMemories()}
        />
      </div>

      <div className="flex gap-8">
        {/* Category sidebar */}
        <div className="w-48 shrink-0 space-y-0.5">
          <button
            className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
              selectedCategory === null ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            onClick={() => setSelectedCategory(null)}
          >
            All
            <span className="float-right text-[11px] text-muted-foreground">{memories.length}</span>
          </button>
          {categories.map((cat) => {
            const count = categoryCounts.get(cat.slug) || 0;
            return (
              <button
                key={cat.slug}
                className={`w-full text-left px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                  selectedCategory === cat.slug ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                onClick={() => setSelectedCategory(cat.slug)}
              >
                {cat.label}
                {count > 0 && <span className="float-right text-[11px] text-muted-foreground">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Memory list */}
        <div className="flex-1 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="maze-card h-20 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="maze-card flex flex-col items-center justify-center py-14 text-center">
              <div className="h-14 w-14 rounded-2xl bg-lime/10 flex items-center justify-center mb-5">
                <Brain className="h-6 w-6 text-lime" />
              </div>
              <h3 className="text-base font-semibold">No memories yet</h3>
              <p className="text-sm text-muted-foreground mt-1.5">
                Upload a conversation export to get started
              </p>
            </div>
          ) : (
            filtered.map((memory) => (
              <div key={memory.id} className="maze-card group">
                <div className="flex items-start justify-between p-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-relaxed">{memory.content}</p>
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <span className={`maze-tag ${categoryColors[memory.category] || ""}`}>
                        {memory.category.replace("_", " ")}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        via {memory.source.name}
                        {memory.conversation?.title && (
                          <> &middot; {memory.conversation.title.length > 40 ? memory.conversation.title.slice(0, 40) + "..." : memory.conversation.title}</>
                        )}
                        {(() => {
                          try {
                            const config = JSON.parse(memory.source.config || "{}");
                            if (config.path) {
                              const short = config.path.replace(/.*\/\.claude\//, "~/.claude/").replace(/\/Users\/\w+\//, "~/");
                              return <> &middot; <span className="font-mono text-[10px]">{short}</span></>;
                            }
                          } catch { /* ignore */ }
                          return null;
                        })()}
                      </span>
                      {memory.sensitive && (
                        <span className="maze-tag bg-red-50 text-red-600">sensitive</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-4">
                    <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => setEditDialog({ memory, content: memory.content })} title="Edit">
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => handleArchive(memory.id)} title="Archive">
                      <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
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
