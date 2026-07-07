"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Brain, RefreshCw, CheckCircle, Share2 } from "lucide-react";

interface StatusStats {
  memories: number;
  sources: number;
  lastSync: string | null;
}

interface StatusConnections {
  [key: string]: { connected: boolean; label: string };
}

export default function HomePage() {
  const [stats, setStats] = useState<StatusStats | null>(null);
  const [connections, setConnections] = useState<StatusConnections>({});

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats ?? null);
        setConnections(data.connections ?? {});
      })
      .catch(() => {});
  }, []);

  const connectedCount = Object.values(connections).filter((c) => c.connected).length;

  function formatLastSync(lastSync: string | null): string {
    if (!lastSync) return "Never";
    const date = new Date(lastSync);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-20 max-w-3xl">

      {/* Hero */}
      <div className="space-y-6 pt-8" data-animate>
        <p className="maze-eyebrow">Cortex</p>
        <h1 className="text-4xl font-semibold tracking-tight leading-tight">
          Your AI tools don&apos;t talk to each other.
          <br />
          <span className="text-lime">Cortex fixes that.</span>
        </h1>
        <p className="maze-body text-lg max-w-xl">
          Every conversation you have with Claude or Poke starts from scratch. Cortex syncs your context across tools — automatically.
        </p>
        <Link
          href="/dashboard"
          className="maze-btn inline-flex items-center gap-2 h-11 px-6 text-[14px]"
        >
          Open Dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Problem */}
      <div data-animate="1">
        <p className="maze-eyebrow mb-6">The Problem</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              title: "Context doesn't transfer",
              body: "You told Claude your dog's name is Brian. Poke has no idea. Every tool starts with a blank slate.",
            },
            {
              title: "You repeat yourself",
              body: "Every new session, you re-explain who you are, what you're working on, what you care about.",
            },
            {
              title: "Facts drift out of sync",
              body: "The same information lives in 3 different tools, maintained separately, slowly diverging.",
            },
          ].map((item) => (
            <div key={item.title} className="maze-card p-5 space-y-2">
              <p className="text-[13px] font-medium tracking-tight">{item.title}</p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div data-animate="2">
        <p className="maze-eyebrow mb-6">How It Works</p>
        <div className="space-y-3">
          {[
            {
              step: "01",
              icon: Brain,
              title: "Ingest",
              body: "Cortex reads from Claude Code memory files, Claude.ai conversation exports, and Poke. Upload once and it watches for changes automatically.",
            },
            {
              step: "02",
              icon: CheckCircle,
              title: "Curate",
              body: "Review extracted facts before they're committed. Resolve conflicts when two tools disagree. Control exactly what gets remembered.",
            },
            {
              step: "03",
              icon: Share2,
              title: "Sync",
              body: "Push approved memories to all connected platforms. Set per-destination policies to control which categories each tool receives.",
            },
          ].map(({ step, icon: Icon, title, body }) => (
            <div key={step} className="maze-card p-5 flex items-start gap-5">
              <div className="h-10 w-10 rounded-xl bg-lime/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-lime" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="maze-eyebrow">{step}</p>
                  <p className="text-[13px] font-medium tracking-tight">{title}</p>
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Memory strength callout */}
      <div data-animate="3" className="maze-card p-6 border-lime/20 bg-lime/5 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-lime" />
          <p className="text-[13px] font-medium tracking-tight">Memories get stronger over time</p>
        </div>
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Facts you mention once are stored. Facts you mention repeatedly, across time and across tools, earn a higher strength score — and surface first when your AI tools pull context from Cortex.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-[30%] bg-muted-foreground/30 rounded-full" />
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">mentioned once</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-[72%] bg-lime rounded-full" />
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">mentioned often, recently</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full w-[95%] bg-amber-400 rounded-full" />
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">core fact, always referenced</span>
        </div>
      </div>

      {/* Live stats strip */}
      {stats && (
        <div data-animate="4" className="grid grid-cols-3 gap-4">
          <div className="maze-card p-4 text-center">
            <p className="text-2xl font-semibold tracking-tight">{stats.memories}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Active memories</p>
          </div>
          <div className="maze-card p-4 text-center">
            <p className="text-2xl font-semibold tracking-tight">{connectedCount}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Connected tools</p>
          </div>
          <div className="maze-card p-4 text-center">
            <p className="text-[13px] font-medium tracking-tight truncate">{formatLastSync(stats.lastSync)}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Last sync</p>
          </div>
        </div>
      )}

    </div>
  );
}
