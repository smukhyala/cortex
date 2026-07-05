"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileUpload } from "@/components/features/file-upload";
import Link from "next/link";
import {
  Brain,
  Inbox,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  ArrowUpRight,
  CircleDot,
  Server,
  Upload,
} from "lucide-react";
import { ServiceLogo } from "@/components/features/service-logos";

interface Source {
  id: string;
  type: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
  _count: { memories: number };
}

interface ActivityEntry {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
}

interface StatusData {
  connections: Record<string, { connected: boolean; label: string; description: string }>;
  stats: { memories: number; pending: number; sources: number; lastSync: string | null };
}

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [statusRes, srcRes, actRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/sources").catch(() => new Response("[]")),
        fetch("/api/activity").catch(() => new Response("[]")),
      ]);
      setStatus(await statusRes.json());
      try { setSources(await srcRes.json()); } catch { setSources([]); }
      try { setActivity((await actRes.json()).slice(0, 6)); } catch { setActivity([]); }
    } catch {
      toast.error("Failed to load dashboard");
    }
  }

  async function handleSync(sourceId: string) {
    setSyncing(sourceId);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Sync complete: ${data.memoriesExtracted} memories, ${data.reviewItemsCreated} for review`);
        fetchAll();
      } else {
        toast.error(data.error || "Sync failed");
      }
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(null);
    }
  }

  async function handleAutoSetup() {
    setSettingUp(true);
    try {
      const res = await fetch("/api/auto-setup", { method: "POST" });
      const data = await res.json();
      if (data.created?.length > 0) {
        toast.success(data.message);
        await fetchAll();
        for (const src of data.created) {
          await handleSync(src.id);
        }
      } else {
        toast.info(data.message);
      }
    } catch {
      toast.error("Auto-setup failed");
    } finally {
      setSettingUp(false);
    }
  }

  const stats = status?.stats;
  const connections = status?.connections;

  return (
    <div className="space-y-10">

      {/* ── Hero ── */}
      <section data-animate>
        <div className="maze-block relative overflow-hidden">
          <div className="absolute top-4 right-6 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-lime maze-pulse" />
            <span className="maze-eyebrow text-[10px]">System Active</span>
          </div>
          <div className="max-w-2xl py-4">
            <p className="maze-eyebrow mb-3 text-lime">Cortex</p>
            <h1>
              Everything your AI<br />
              tools know about you.
            </h1>
            <p className="maze-body mt-3 max-w-lg">
              Cortex extracts durable facts from your conversations, deduplicates them, and syncs
              your personal context across ChatGPT, Claude, and Poke.
              {stats && stats.memories > 0
                ? ` Currently managing ${stats.memories} memor${stats.memories !== 1 ? "ies" : "y"} across ${stats.sources} source${stats.sources !== 1 ? "s" : ""}.`
                : ""}
            </p>
            {sources.length === 0 && status && (
              <button onClick={handleAutoSetup} disabled={settingUp} className="maze-btn maze-btn-lime mt-8">
                <Zap className={`h-4 w-4 ${settingUp ? "animate-spin" : ""}`} />
                {settingUp ? "Setting up..." : "Auto-detect & sync sources"}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Stats + Connections ── */}
      <section>
        <p className="maze-eyebrow mb-6" data-animate>Overview</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Connections */}
          {connections && Object.entries(connections).map(([key, conn], i) => (
            <div key={key} className="maze-card p-6 relative overflow-hidden" data-animate={i + 1}>
              <div className="flex items-center justify-between mb-4">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${conn.connected ? "bg-lime/10" : "bg-muted"}`}>
                  {key === "anthropic" ? (
                    <Zap className={`h-[18px] w-[18px] ${conn.connected ? "text-lime" : "text-muted-foreground"}`} />
                  ) : (
                    <Server className={`h-[18px] w-[18px] ${conn.connected ? "text-lime" : "text-muted-foreground"}`} />
                  )}
                </div>
                {conn.connected ? (
                  <CheckCircle className="h-4 w-4 text-lime" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/30" />
                )}
              </div>
              <p className="text-sm font-medium tracking-tight">{conn.label}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{conn.description}</p>
              {conn.connected && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-lime/80 to-lime/20" />
              )}
            </div>
          ))}

          {/* Stat: Memories */}
          <Link href="/memories" className="maze-card p-6 group" data-animate="3">
            <div className="flex items-center justify-between mb-4">
              <div className="h-10 w-10 rounded-xl bg-lime/10 flex items-center justify-center">
                <Brain className="h-[18px] w-[18px] text-lime" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
            </div>
            <p className="text-3xl font-light tracking-tight">{stats?.memories ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Active Memories</p>
          </Link>

          {/* Stat: Pending */}
          <Link href={stats?.pending ? "/review" : "#"} className="maze-card p-6 group" data-animate="4">
            <div className="flex items-center justify-between mb-4">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <Inbox className="h-[18px] w-[18px] text-muted-foreground" />
              </div>
              {(stats?.pending ?? 0) > 0 && (
                <span className="h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full bg-lime text-[10px] font-bold text-lime-foreground">
                  {stats!.pending}
                </span>
              )}
            </div>
            <p className="text-3xl font-light tracking-tight">{stats?.pending ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">Pending Review</p>
          </Link>
        </div>
      </section>

      {/* ── Sources ── */}
      {sources.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-6" data-animate>
            <p className="maze-eyebrow">Sources</p>
            <Link href="/settings" className="text-xs font-medium text-muted-foreground hover:text-foreground">
              Manage &rarr;
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sources.map((source, i) => (
              <div key={source.id} className="maze-card p-5 flex items-center justify-between" data-animate={i + 1}>
                <div className="flex items-center gap-3.5 min-w-0">
                  <SourceIcon type={source.type} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium tracking-tight truncate">{source.name}</p>
                    <div className="flex items-center gap-2.5 mt-1">
                      <span className="text-[11px] text-muted-foreground font-medium">{source._count.memories} memories</span>
                      {source.lastSyncAt && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(source.lastSyncAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  className="maze-btn text-[12px] h-8 px-3"
                  onClick={() => handleSync(source.id)}
                  disabled={syncing === source.id}
                >
                  <RefreshCw className={`h-3 w-3 ${syncing === source.id ? "animate-spin" : ""}`} />
                  {syncing === source.id ? "Syncing" : "Sync"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Import ── */}
      <section>
        <p className="maze-eyebrow mb-6" data-animate>Import Conversations</p>
        <div className="maze-block" data-animate="1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            <div className="flex items-start gap-3">
              <ServiceLogo type="chatgpt_export" size={18} className="shrink-0" />
              <div>
                <p className="text-sm font-medium tracking-tight">ChatGPT</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  Export from Settings &rarr; Data Controls &rarr; Export data. Upload the .zip below.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ServiceLogo type="claude_export" size={18} className="shrink-0" />
              <div>
                <p className="text-sm font-medium tracking-tight">Claude.ai</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  Export your conversations from Claude.ai settings. Upload the .json file below.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ServiceLogo type="poke" size={18} className="shrink-0" />
              <div>
                <p className="text-sm font-medium tracking-tight">Poke</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  Your API key pushes memories <em>to</em> Poke. Export from the Memories page.
                </p>
              </div>
            </div>
          </div>
          <FileUpload
            onUploadComplete={(result) => {
              if (result.success) {
                toast.success("Upload processed successfully");
                fetchAll();
              } else {
                toast.error(result.error || "Upload failed");
              }
            }}
          />
        </div>
      </section>

      {/* ── Activity ── */}
      {activity.length > 0 && (
        <section>
          <p className="maze-eyebrow mb-6" data-animate>Recent Activity</p>
          <div className="maze-card-static overflow-hidden" data-animate="1">
            {activity.map((entry, i) => (
              <div
                key={entry.id}
                className={`flex items-start gap-3 px-6 py-4 ${i !== activity.length - 1 ? "border-b border-border" : ""} hover:bg-muted/30 transition-colors`}
              >
                <CircleDot className="h-3.5 w-3.5 text-lime mt-1 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-relaxed font-medium">{entry.summary}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SourceIcon({ type }: { type: string }) {
  return <ServiceLogo type={type} size={18} />;
}
