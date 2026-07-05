"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, FolderOpen, CheckCircle, XCircle, Zap, Server } from "lucide-react";

interface Source {
  id: string;
  type: string;
  name: string;
  status: string;
  config: string;
  lastSyncAt: string | null;
  _count: { memories: number };
}

interface StatusData {
  connections: Record<string, { connected: boolean; label: string; description: string }>;
  stats: { memories: number; pending: number; sources: number; lastSync: string | null };
}

export default function SettingsPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [addDialog, setAddDialog] = useState(false);
  const [newSource, setNewSource] = useState({ type: "claude_code", name: "", path: "" });

  useEffect(() => {
    fetchSources();
    fetchStatus();
  }, []);

  async function fetchSources() {
    try {
      const res = await fetch("/api/sources");
      setSources(await res.json());
    } catch {
      toast.error("Failed to load sources");
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch("/api/status");
      setStatus(await res.json());
    } catch {}
  }

  async function handleAddSource() {
    if (!newSource.name || !newSource.path) {
      toast.error("Name and path are required");
      return;
    }
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newSource.type, name: newSource.name, config: { path: newSource.path } }),
      });
      if (res.ok) {
        toast.success("Source added");
        setAddDialog(false);
        setNewSource({ type: "claude_code", name: "", path: "" });
        fetchSources();
      }
    } catch {
      toast.error("Failed to add source");
    }
  }

  async function handleDeleteSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
    toast.success("Source removed");
  }

  async function handleWriteBack(filePath: string) {
    try {
      const res = await fetch("/api/writeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: filePath + "/CLAUDE.md" }),
      });
      const data = await res.json();
      if (res.ok) toast.success(`Wrote ${data.memoriesWritten} memories to CLAUDE.md`);
      else toast.error(data.error || "Write-back failed");
    } catch {
      toast.error("Write-back failed");
    }
  }

  const connections = status?.connections;

  return (
    <div className="space-y-8 max-w-4xl">
      <div data-animate>
        <p className="maze-eyebrow mb-4">Configuration</p>
        <h1>Settings</h1>
        <p className="maze-body mt-3">Manage connections, sources, and preferences.</p>
      </div>

      {/* ── Connections ── */}
      <section data-animate="1">
        <p className="maze-eyebrow mb-4">Connections</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {connections && Object.entries(connections).map(([key, conn]) => (
            <div key={key} className="maze-card p-5 relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${conn.connected ? "bg-lime/10" : "bg-muted"}`}>
                    {key === "anthropic" ? (
                      <Zap className={`h-4 w-4 ${conn.connected ? "text-lime" : "text-muted-foreground"}`} />
                    ) : (
                      <Server className={`h-4 w-4 ${conn.connected ? "text-lime" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium tracking-tight">{conn.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{conn.description}</p>
                  </div>
                </div>
                {conn.connected ? (
                  <CheckCircle className="h-4 w-4 text-lime shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
              </div>
              {conn.connected && (
                <>
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-lime maze-pulse" />
                    <span className="text-[11px] text-muted-foreground">Configured via .env</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-lime" />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Sources ── */}
      <section data-animate="2">
        <p className="maze-eyebrow mb-4">Sources</p>
        <div className="maze-card divide-y divide-border">
          {sources.map((source) => {
            const config = JSON.parse(source.config || "{}");
            return (
              <div key={source.id} className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm font-medium tracking-tight">{source.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {source.type.replace("_", " ")}
                    {config.path ? ` — ${config.path}` : ""}
                    {config.filePath ? ` — ${config.filePath}` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {source.type === "claude_code" && config.path && (
                    <button className="maze-btn h-8 text-xs" onClick={() => handleWriteBack(config.path)}>
                      Write Back
                    </button>
                  )}
                  <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => handleDeleteSource(source.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="p-5">
            <button className="maze-btn maze-btn-ghost w-full border border-dashed border-border h-10 text-[13px] text-muted-foreground" onClick={() => setAddDialog(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Source
            </button>
          </div>
        </div>
      </section>

      {/* ── Preferences ── */}
      <section>
        <p className="maze-eyebrow mb-4">Preferences</p>
        <div className="maze-card divide-y divide-border">
          <label className="flex items-start gap-3 p-5 cursor-pointer">
            <input type="radio" name="mode" defaultChecked className="mt-1 accent-[var(--lime)]" />
            <div>
              <p className="text-sm font-medium tracking-tight">Review Queue</p>
              <p className="text-xs text-muted-foreground mt-0.5">All proposed memories require manual approval.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 p-5 cursor-pointer">
            <input type="radio" name="mode" className="mt-1 accent-[var(--lime)]" />
            <div>
              <p className="text-sm font-medium tracking-tight">Auto-Approve</p>
              <p className="text-xs text-muted-foreground mt-0.5">Refinements of approved memories are auto-merged. New facts still require review.</p>
            </div>
          </label>
        </div>
      </section>

      {/* ── MCP Server ── */}
      <section>
        <p className="maze-eyebrow mb-4">MCP Server</p>
        <div className="maze-card p-5 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Cortex exposes an MCP server that AI tools can connect to. Poke and Claude can call{" "}
            <code className="text-[12px] bg-muted px-1.5 py-0.5 rounded font-mono">cortex_get_memories()</code>{" "}
            to pull your latest context.
          </p>
          <div className="p-3 rounded-lg bg-muted text-sm font-mono">
            <p className="maze-eyebrow mb-1">Connection</p>
            <p className="text-[13px]">stdio transport via <code>npm run mcp</code></p>
          </div>
        </div>
      </section>

      {/* ── Danger ── */}
      <section>
        <p className="maze-eyebrow mb-4 text-red-500">Danger Zone</p>
        <div className="maze-card p-5 border-l-[3px] border-l-red-400">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium tracking-tight">Reset All Memories</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently delete all memories, reviews, and conflicts. Sources are preserved.
              </p>
            </div>
            <button className="maze-btn bg-red-500 text-white h-8 text-xs" onClick={() => toast.info("Reset functionality coming soon")}>
              Reset
            </button>
          </div>
        </div>
      </section>

      {/* ── Add Source Dialog ── */}
      {addDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAddDialog(false)}>
          <div className="maze-card w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-5">Add Source</h3>
            <div className="space-y-4">
              <div>
                <p className="maze-eyebrow mb-2">Source Type</p>
                <div className="space-y-2">
                  {[
                    { value: "claude_code", label: "Claude Code (filesystem)" },
                    { value: "chatgpt_export", label: "ChatGPT Export" },
                    { value: "claude_export", label: "Claude.ai Export" },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="sourceType"
                        value={opt.value}
                        checked={newSource.type === opt.value}
                        onChange={() => setNewSource((p) => ({ ...p, type: opt.value }))}
                        className="accent-[var(--lime)]"
                      />
                      <span className="text-[13px]">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="maze-eyebrow mb-2">Name</p>
                <Input
                  placeholder="My Claude Code"
                  value={newSource.name}
                  onChange={(e) => setNewSource((p) => ({ ...p, name: e.target.value }))}
                  className="h-10"
                />
              </div>
              <div>
                <p className="maze-eyebrow mb-2">{newSource.type === "claude_code" ? "Directory Path" : "File Path"}</p>
                <Input
                  placeholder={newSource.type === "claude_code" ? "/Users/you/.claude" : "/path/to/export.json"}
                  value={newSource.path}
                  onChange={(e) => setNewSource((p) => ({ ...p, path: e.target.value }))}
                  className="h-10"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className="maze-btn maze-btn-ghost h-9 text-[13px]" onClick={() => setAddDialog(false)}>Cancel</button>
              <button className="maze-btn h-9 text-[13px]" onClick={handleAddSource}>Add Source</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
