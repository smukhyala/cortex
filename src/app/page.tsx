"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";

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

export default function DashboardPage() {
  const [totalMemories, setTotalMemories] = useState<number | null>(null);
  const [pendingReviews, setPendingReviews] = useState<number | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    try {
      const [memRes, revRes, srcRes, actRes] = await Promise.all([
        fetch("/api/memories?status=active"),
        fetch("/api/review"),
        fetch("/api/sources").catch(() => new Response("[]")),
        fetch("/api/activity").catch(() => new Response("[]")),
      ]);

      const memories = await memRes.json();
      const reviews = await revRes.json();
      setTotalMemories(Array.isArray(memories) ? memories.length : 0);
      setPendingReviews(Array.isArray(reviews) ? reviews.length : 0);

      try { setSources(await srcRes.json()); } catch { setSources([]); }
      try { setActivity((await actRes.json()).slice(0, 8)); } catch { setActivity([]); }
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={<Brain className="h-5 w-5 text-primary" />}
          iconBg="bg-primary/10"
          value={totalMemories}
          label="Active Memories"
        />
        <StatCard
          icon={<Inbox className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-100"
          value={pendingReviews}
          label="Pending Reviews"
        />
        <StatCard
          icon={<Link2 className="h-5 w-5 text-green-600" />}
          iconBg="bg-green-100"
          value={sources.length}
          label="Sources"
        />
      </div>

      {/* Sources */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Connected Sources</CardTitle>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sources yet. Upload a ChatGPT or Claude export above, or add a Claude Code directory in Settings.
            </p>
          ) : (
            <div className="space-y-3">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <SourceIcon type={source.type} />
                    <div>
                      <p className="text-sm font-medium">{source.name}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {source._count.memories} memories
                        </Badge>
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
                    onClick={() => handleSync(source.id)}
                    disabled={syncing === source.id}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${syncing === source.id ? "animate-spin" : ""}`} />
                    {syncing === source.id ? "Syncing..." : "Sync"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload */}
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

      {/* Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {activity.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-sm py-2 border-b last:border-0">
                  <Activity className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p>{entry.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  iconBg,
  value,
  label,
}: {
  icon: React.ReactNode;
  iconBg: string;
  value: number | null;
  label: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold">{value ?? "..."}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceIcon({ type }: { type: string }) {
  const labels: Record<string, string> = {
    chatgpt_export: "GP",
    claude_code: "CC",
    claude_export: "CL",
    poke: "PK",
  };
  return (
    <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-xs font-bold">
      {labels[type] || "??"}
    </div>
  );
}
