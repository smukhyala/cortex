"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FileUpload } from "@/components/file-upload";
import {
  Brain,
  Inbox,
  Link2,
  RefreshCw,
  Clock,
  Activity,
  Zap,
  ArrowRight,
  CheckCircle,
  CircleDot,
} from "lucide-react";
import Link from "next/link";

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

  useEffect(() => {
    fetchAll();
  }, []);

  const [settingUp, setSettingUp] = useState(false);

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

  async function handleAutoSetup() {
    setSettingUp(true);
    try {
      const res = await fetch("/api/auto-setup", { method: "POST" });
      const data = await res.json();
      if (data.created?.length > 0) {
        toast.success(data.message);
        await fetchAll();
        // Auto-sync the first created source
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
        toast.success(
          `Sync complete: ${data.memoriesExtracted} memories, ${data.reviewItemsCreated} for review`
        );
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

  const stats = status?.stats;
  const connections = status?.connections;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-2 w-2 rounded-full bg-lime animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Active</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Your AI Memory Layer
        </h1>
        <p className="text-muted-foreground text-[15px] max-w-lg">
          Cortex extracts and syncs what AI tools know about you.
          {stats && stats.memories > 0
            ? ` Currently managing ${stats.memories} memor${stats.memories !== 1 ? "ies" : "y"} across ${stats.sources} source${stats.sources !== 1 ? "s" : ""}.`
            : " Upload a conversation export or sync a source to get started."}
        </p>
        {sources.length === 0 && status && (
          <Button
            onClick={handleAutoSetup}
            disabled={settingUp}
            className="mt-3 bg-lime text-lime-foreground hover:bg-lime/90 h-9 text-sm"
          >
            <Zap className={`h-4 w-4 mr-2 ${settingUp ? "animate-spin" : ""}`} />
            {settingUp ? "Setting up..." : "Auto-detect & sync sources"}
          </Button>
        )}
      </div>

      {/* Connection + Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Connections */}
        {connections && Object.entries(connections).map(([key, conn]) => (
          <Card key={key} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{conn.label}</span>
                {conn.connected ? (
                  <Badge className="bg-lime/15 text-lime-foreground border-lime/30 text-[10px] font-semibold gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Not configured
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{conn.description}</p>
              {conn.connected && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-lime" />
              )}
            </CardContent>
          </Card>
        ))}

        {/* Stats */}
        <StatCard
          icon={<Brain className="h-4 w-4" />}
          value={stats?.memories ?? null}
          label="Active Memories"
          accent
        />
        <StatCard
          icon={<Inbox className="h-4 w-4" />}
          value={stats?.pending ?? null}
          label="Pending Review"
          href={stats?.pending ? "/review" : undefined}
        />
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Sources</h2>
            <Link href="/settings" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              Manage
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sources.map((source) => (
              <Card key={source.id} className="group transition-shadow hover:shadow-sm">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <SourceIcon type={source.type} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{source.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {source._count.memories} memories
                        </span>
                        {source.lastSyncAt && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(source.lastSyncAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => handleSync(source.id)}
                    disabled={syncing === source.id}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${syncing === source.id ? "animate-spin" : ""}`} />
                    {syncing === source.id ? "Syncing" : "Sync"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Upload */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight">Import</h2>
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

      {/* Activity */}
      {activity.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">Recent Activity</h2>
          <Card>
            <CardContent className="p-0">
              {activity.map((entry, i) => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 px-5 py-3.5 text-sm ${
                    i !== activity.length - 1 ? "border-b" : ""
                  }`}
                >
                  <CircleDot className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-foreground">{entry.summary}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  accent,
  href,
}: {
  icon: React.ReactNode;
  value: number | null;
  label: string;
  accent?: boolean;
  href?: string;
}) {
  const inner = (
    <CardContent className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent ? "bg-lime/15 text-lime-foreground" : "bg-muted text-muted-foreground"}`}>
          {icon}
        </div>
        {href && (
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight">{value ?? "—"}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </CardContent>
  );

  if (href) {
    return (
      <Link href={href}>
        <Card className="group cursor-pointer transition-shadow hover:shadow-sm">
          {inner}
        </Card>
      </Link>
    );
  }

  return <Card>{inner}</Card>;
}

function SourceIcon({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    chatgpt_export: { label: "GP", color: "bg-emerald-100 text-emerald-700" },
    claude_code: { label: "CC", color: "bg-orange-100 text-orange-700" },
    claude_export: { label: "CL", color: "bg-violet-100 text-violet-700" },
    poke: { label: "PK", color: "bg-sky-100 text-sky-700" },
  };
  const c = config[type] || { label: "??", color: "bg-muted text-muted-foreground" };
  return (
    <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold ${c.color}`}>
      {c.label}
    </div>
  );
}
