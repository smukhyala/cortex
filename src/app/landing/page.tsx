"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Brain, CheckCircle, Database, GitMerge, Inbox, Lock, Network, RefreshCw, Send, Sparkles, Star, Zap } from "lucide-react";

interface StatusStats {
  memories: number;
  pending?: number;
  sources: number;
  lastSync: string | null;
}

interface StatusConnections {
  [key: string]: { connected: boolean; label: string };
}

function formatLastSync(lastSync: string | null): string {
  if (!lastSync) return "Never";
  return new Date(lastSync).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const activeMemories = stats?.memories ?? 0;
  const pending = stats?.pending ?? 0;

  return (
    <main className="min-h-screen overflow-hidden bg-[#080a0d] text-white">
      <style>{`
        @keyframes landing-gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes landing-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        .landing-gradient {
          background:
            linear-gradient(120deg, rgba(8,10,13,0.95) 0%, rgba(17,24,39,0.82) 34%, rgba(42,88,65,0.72) 62%, rgba(214,146,64,0.74) 100%),
            linear-gradient(45deg, #080a0d, #12211a, #2b5f49, #d69240);
          background-size: 220% 220%;
          animation: landing-gradient-shift 14s ease-in-out infinite;
        }

        .landing-grid {
          background-image:
            linear-gradient(rgba(255,255,255,0.065) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.065) 1px, transparent 1px);
          background-size: 72px 72px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,0.85), transparent 78%);
        }

        .landing-float {
          animation: landing-float 4.5s ease-in-out infinite;
        }
      `}</style>

      <section className="landing-gradient relative min-h-screen px-6">
        <div className="landing-grid absolute inset-0" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/40 to-transparent" />

        <nav className="relative z-10 mx-auto flex h-20 max-w-6xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/icon.svg" alt="Cortex" width={36} height={36} className="h-9 w-9 rounded-lg" />
            <span className="text-sm font-semibold tracking-wide text-white/90">Cortex</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/review" className="hidden text-sm text-white/70 transition hover:text-white sm:inline">
              Review
            </Link>
            <Link href="/memories" className="hidden text-sm text-white/70 transition hover:text-white sm:inline">
              Memories
            </Link>
            <Link href="/dashboard" className="maze-btn maze-btn-lime h-10 px-4 text-[13px]">
              Dashboard
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>

        <div className="relative z-10 mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col items-center justify-center py-14 text-center sm:py-20">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white/75 shadow-2xl backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-lime" />
            Memory sync for Claude, Poke, and every AI you actually use
          </div>

          <h1
            className="max-w-5xl font-bold leading-[0.98] tracking-normal text-white"
            style={{
              fontSize: "clamp(3rem, 8vw, 7.75rem)",
              fontFamily: "var(--font-jakarta), system-ui, sans-serif",
            }}
          >
            One memory for all your AI tools.
          </h1>

          <p className="mt-7 max-w-3xl text-base leading-8 text-white/72 sm:text-xl">
            Cortex keeps your personal context current, reconciled, and ready wherever you work. New facts flow in,
            risky changes wait for review, and trusted memories sync back out.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/dashboard" className="maze-btn maze-btn-lime h-12 px-7 text-[15px] font-medium">
              Open Cortex
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/review"
              className="maze-btn h-12 border border-white/15 bg-white/10 px-7 text-[15px] text-white backdrop-blur-md hover:bg-white/15"
            >
              <Inbox className="h-4 w-4" />
              Review Queue
            </Link>
          </div>

          <div className="mt-12 grid w-full max-w-5xl gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:text-left">
            <div className="rounded-2xl border border-white/14 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-white/70">
                  <Network className="h-4 w-4 text-lime" />
                  Live Memory Map
                </div>
                <span className="rounded-full bg-lime/15 px-2.5 py-1 text-[11px] font-medium text-lime">synced</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { name: "Claude", detail: "new facts", tone: "border-sky-300/40 bg-sky-300/10 text-sky-100" },
                  { name: "Cortex", detail: "reconcile", tone: "border-lime/50 bg-lime/15 text-lime" },
                  { name: "Poke", detail: "writeback", tone: "border-amber-300/50 bg-amber-300/15 text-amber-100" },
                ].map((item) => (
                  <div key={item.name} className={`rounded-2xl border px-4 py-4 ${item.tone}`}>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wide opacity-75">{item.detail}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                {[
                  { text: "User is graduating in 2100.", width: "92%", tag: "manual strong" },
                  { text: "User no longer works at Astera.", width: "76%", tag: "updated" },
                  { text: "Logo path in packages/frontend/...", width: "24%", tag: "cleanup" },
                ].map((memory) => (
                  <div key={memory.text} className="rounded-2xl border border-white/12 bg-black/18 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm text-white/86">{memory.text}</p>
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">{memory.tag}</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-lime" style={{ width: memory.width }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              {[
                { icon: Brain, label: "Active memories", value: activeMemories || "0", body: "clean context ready for agents" },
                { icon: Zap, label: "Connected tools", value: connectedCount || "0", body: "sources that can read or write memory" },
                { icon: Inbox, label: "Pending review", value: pending || "0", body: "contradictions waiting for judgment" },
              ].map(({ label, value, body, icon: Icon }, index) => (
                <div
                  key={label}
                  className="landing-float rounded-2xl border border-white/12 bg-white/10 px-5 py-4 shadow-2xl backdrop-blur-md"
                  style={{ animationDelay: `${index * 0.25}s` }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-white/50">{label}</p>
                      <p className="mt-1 text-sm text-white/64">{body}</p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/10">
                      <Icon className="h-5 w-5 text-lime" />
                    </div>
                  </div>
                  <p className="mt-4 text-3xl font-semibold tracking-normal text-white">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-background px-6 py-16 text-foreground sm:py-20">
        <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[0.85fr_1.15fr] md:items-center">
          <div className="text-center md:text-left">
            <p className="maze-eyebrow text-lime">How Cortex Decides</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">Trusted memories move fast. Risky ones pause.</h2>
            <p className="maze-body mt-4">
              Frequency, recency, and stable profile facts determine memory strength, while high-jeopardy or contradicting
              additions from Claude and Poke land in review before they become active context.
            </p>
          </div>

          <div className="grid gap-3">
            {[
              { icon: RefreshCw, title: "Strength with judgment", body: "Repeated facts rise naturally, while objective profile facts like school, major, and name start strong." },
              { icon: Lock, title: "Review sensitive changes", body: "High-jeopardy memories wait for an explicit human decision." },
              { icon: Star, title: "Manual strong marks", body: "Important memories can be pinned into the strong set when you know they matter." },
              { icon: CheckCircle, title: "Auto-approve low-risk facts", body: "Straightforward new memories become active and show their approval path." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="maze-card-static grid grid-cols-[2.5rem_1fr] gap-4 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-lime/10">
                  <Icon className="h-4 w-4 text-lime" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-normal">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-5xl">
          <div className="text-center">
            <p className="maze-eyebrow text-lime">The Loop</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">From scattered chats to one clean memory layer.</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              { icon: Database, title: "Collect", body: "Imports from Claude, Poke, exports, and local sources." },
              { icon: GitMerge, title: "Resolve", body: "Deduplicates repeated facts and catches contradictions." },
              { icon: Star, title: "Rank", body: "Scores by frequency, recency, objective facts, and manual strength." },
              { icon: Send, title: "Propagate", body: "Writes approved changes back to connected platforms." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-border bg-background p-5">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-lime/10">
                  <Icon className="h-4 w-4 text-lime" />
                </div>
                <h3 className="text-sm font-semibold tracking-normal">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>

        {stats && (
          <p className="mx-auto mt-12 max-w-5xl text-center text-xs text-muted-foreground md:text-left">
            Last sync: {formatLastSync(stats.lastSync)}
          </p>
        )}
      </section>
    </main>
  );
}
