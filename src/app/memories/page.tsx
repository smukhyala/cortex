"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Search, Download, Archive, Brain, Pencil } from "lucide-react";
import { CATEGORY_LABELS, MEMORY_CATEGORIES } from "@/contracts/memory";

interface Memory {
  id: string;
  content: string;
  subject: string;
  category: string;
  confidence: number;
  temporality: string;
  sensitive: boolean;
  createdAt: string;
  source: { name: string; type: string };
}

const CATEGORY_COLORS: Record<string, string> = {
  identity: "bg-blue-50 text-blue-700 border-blue-200",
  education_career: "bg-purple-50 text-purple-700 border-purple-200",
  projects: "bg-emerald-50 text-emerald-700 border-emerald-200",
  research: "bg-yellow-50 text-yellow-700 border-yellow-200",
  preferences: "bg-orange-50 text-orange-700 border-orange-200",
  goals: "bg-pink-50 text-pink-700 border-pink-200",
  relationships: "bg-indigo-50 text-indigo-700 border-indigo-200",
  writing_voice: "bg-cyan-50 text-cyan-700 border-cyan-200",
  workflows: "bg-teal-50 text-teal-700 border-teal-200",
  temporary: "bg-gray-50 text-gray-600 border-gray-200",
};

export default function MemoriesPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editDialog, setEditDialog] = useState<{ memory: Memory; content: string } | null>(null);

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
    fetchMemories();
  }, [fetchMemories]);

  async function handleArchive(id: string) {
    try {
      await fetch(`/api/memories/${id}`, {
        method: "DELETE",
      });
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
      setMemories((prev) =>
        prev.map((m) => (m.id === memory.id ? { ...m, content: newContent } : m))
      );
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Memories</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {memories.length} active memor{memories.length !== 1 ? "ies" : "y"}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleExport("chatgpt")}>
              ChatGPT (Custom Instructions)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("claude")}>
              Claude (CLAUDE.md)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("json")}>
              JSON (full export)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("poke")}>
              Push to Poke
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search memories..."
          className="pl-9 h-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchMemories()}
        />
      </div>

      <div className="flex gap-6">
        {/* Category sidebar */}
        <ScrollArea className="w-52 shrink-0">
          <div className="space-y-0.5">
            <Button
              variant={selectedCategory === null ? "secondary" : "ghost"}
              className="w-full justify-start text-[13px] h-8"
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              All Categories
              <Badge variant="outline" className="ml-auto text-[10px]">
                {memories.length}
              </Badge>
            </Button>
            {MEMORY_CATEGORIES.map((cat) => {
              const count = categoryCounts.get(cat) || 0;
              return (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "secondary" : "ghost"}
                  className="w-full justify-start text-[13px] h-8"
                  size="sm"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {CATEGORY_LABELS[cat]}
                  {count > 0 && (
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {count}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Memory list */}
        <div className="flex-1 space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="h-16 p-4" />
                </Card>
              ))}
            </div>
          ) : memories.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime/10 mb-5">
                  <Brain className="h-6 w-6 text-lime-foreground" />
                </div>
                <h3 className="font-semibold">No memories yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload a conversation export to get started
                </p>
              </CardContent>
            </Card>
          ) : (
            memories
              .filter((m) => !selectedCategory || m.category === selectedCategory)
              .map((memory) => (
                <Card key={memory.id} className="group transition-shadow hover:shadow-sm">
                  <CardContent className="flex items-start justify-between p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-relaxed">{memory.content}</p>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <Badge
                          className={`${CATEGORY_COLORS[memory.category] || ""} text-[10px] font-medium`}
                          variant="outline"
                        >
                          {memory.category.replace("_", " ")}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          via {memory.source.name}
                        </span>
                        {memory.sensitive && (
                          <Badge variant="destructive" className="text-[10px]">
                            Sensitive
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() =>
                          setEditDialog({ memory, content: memory.content })
                        }
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => handleArchive(memory.id)}
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
          )}
        </div>
      </div>

      {editDialog && (
        <Dialog open onOpenChange={() => setEditDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Memory</DialogTitle>
            </DialogHeader>
            <Textarea
              value={editDialog.content}
              onChange={(e) =>
                setEditDialog((prev) =>
                  prev ? { ...prev, content: e.target.value } : null
                )
              }
              rows={4}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => handleEdit(editDialog.memory, editDialog.content)}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
