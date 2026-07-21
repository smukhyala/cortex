"use client";

import { useState, useEffect, useCallback } from "react";
import { PipelineExplainer } from "@/components/j-space/pipeline-explainer";
import { OrbitalView } from "@/components/j-space/orbital-view";
import { DetailDrawer } from "@/components/j-space/detail-drawer";
import type {
  WorkspaceState,
  WorkspaceCandidate,
  IgnitionCluster,
} from "@/contracts/workspace";
import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";

/* ── Category dot colors (matches detail-drawer) ─────────────────────── */

const CATEGORY_DOT_COLORS: Record<string, string> = {
  identity: "bg-blue-500",
  education_career: "bg-purple-500",
  projects: "bg-emerald-500",
  research: "bg-yellow-500",
  preferences: "bg-orange-500",
  goals: "bg-pink-500",
  relationships: "bg-indigo-500",
  writing_voice: "bg-cyan-500",
  workflows: "bg-teal-500",
  temporary: "bg-neutral-400",
};

/* SVG fill colors matching the Tailwind classes above (for the SlotRing) */
const CATEGORY_SVG_COLORS: Record<string, string> = {
  identity: "#3b82f6",
  education_career: "#a855f7",
  projects: "#10b981",
  research: "#eab308",
  preferences: "#f97316",
  goals: "#ec4899",
  relationships: "#6366f1",
  writing_voice: "#06b6d4",
  workflows: "#14b8a6",
  temporary: "#a3a3a3",
};

/* ── Slot ring — circular workspace visualization ────────────────────── */

function SlotRing({
  active,
  capacity,
  ignitionCluster,
  onSelectMemory,
}: {
  active: WorkspaceCandidate[];
  capacity: number;
  ignitionCluster: IgnitionCluster | null;
  onSelectMemory: (m: WorkspaceCandidate) => void;
}) {
  const slots = Array.from({ length: capacity }, (_, i) => active[i] ?? null);
  const ignitionIds = new Set(ignitionCluster?.members ?? []);
  const radius = 140;
  const center = 170;

  return (
    <svg
      viewBox="0 0 340 340"
      className="w-full max-w-[340px] mx-auto"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {/* Orbit ring */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
        strokeDasharray="4 4"
      />

      {/* Center label */}
      <text
        x={center}
        y={center - 8}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize="10"
        fontWeight="600"
        letterSpacing="0.08em"
      >
        WORKSPACE
      </text>
      <text
        x={center}
        y={center + 8}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize="9"
      >
        {active.length}/{capacity}
      </text>

      {/* Slots */}
      {slots.map((mem, i) => {
        const angle = (2 * Math.PI * i) / capacity - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        const isIgnited = mem && ignitionIds.has(mem.memoryId);

        if (!mem) {
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={4}
              fill="var(--muted)"
              stroke="var(--border)"
              strokeWidth="1"
            />
          );
        }

        const loading = Math.min(1, Math.max(0, mem.totalScore / 10));
        const nodeRadius = 6 + loading * 8;
        const catColor = CATEGORY_SVG_COLORS[mem.category] ?? "#a3a3a3";

        return (
          <g
            key={mem.memoryId}
            onClick={() => onSelectMemory(mem)}
            className="cursor-pointer"
          >
            {/* Glow for ignition members */}
            {isIgnited && (
              <circle
                cx={x}
                cy={y}
                r={nodeRadius + 6}
                fill="none"
                stroke="var(--lime)"
                strokeWidth="1.5"
                opacity="0.4"
              >
                <animate
                  attributeName="r"
                  values={`${nodeRadius + 4};${nodeRadius + 10};${nodeRadius + 4}`}
                  dur="2.5s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.4;0.15;0.4"
                  dur="2.5s"
                  repeatCount="indefinite"
                />
              </circle>
            )}

            {/* Node — colored by category */}
            <circle
              cx={x}
              cy={y}
              r={nodeRadius}
              fill={isIgnited ? "var(--lime)" : catColor}
              fillOpacity={isIgnited ? 1 : 0.85}
              stroke={isIgnited ? "var(--lime)" : catColor}
              strokeWidth="1.5"
              strokeOpacity={isIgnited ? 1 : 0.4}
              className="transition-all duration-200 hover:stroke-lime"
            />

            {/* Pin indicator */}
            {mem.pinned && (
              <circle
                cx={x}
                cy={y - nodeRadius - 3}
                r={2}
                fill="var(--lime)"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function JSpacePage() {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<WorkspaceCandidate | null>(null);
  const [clusterMembers, setClusterMembers] = useState<WorkspaceCandidate[] | undefined>(undefined);

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace?include=candidates");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data: WorkspaceState = await res.json();
      setWorkspace(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  /* Intersection observer for scroll animations */
  useEffect(() => {
    const els = document.querySelectorAll("[data-animate]");
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("maze-visible");
          }
        }
      },
      { threshold: 0.1 }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [workspace]);

  const handleClusterSelect = (clusterId: string) => {
    if (!workspace) return;
    const allCandidates = workspace.candidates ?? workspace.active;
    const members = allCandidates.filter((c) => c.clusterId === clusterId);
    setSelectedMemory(null);
    setClusterMembers(members.length > 0 ? members : undefined);
  };

  const handleMemorySelect = (mem: WorkspaceCandidate) => {
    setClusterMembers(undefined);
    setSelectedMemory(mem);
  };

  const handleClose = () => {
    setSelectedMemory(null);
    setClusterMembers(undefined);
  };

  const handleHold = async (concept: string) => {
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hold", concept }),
    });
    handleClose();
    fetchWorkspace();
  };

  const handleSuppress = async (concept: string) => {
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suppress", concept }),
    });
    handleClose();
    fetchWorkspace();
  };

  const handleRelease = async (concept: string) => {
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", concept }),
    });
    handleClose();
    fetchWorkspace();
  };

  /* ── Loading / error states ─────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-lime animate-pulse" />
          <span className="text-sm">Loading workspace...</span>
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">{error ?? "No workspace data"}</p>
          <button onClick={fetchWorkspace} className="maze-btn-outline maze-btn text-[12px]">
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* ── Cluster summary ────────────────────────────────────────────────── */

  const clusterMap = new Map<string, WorkspaceCandidate[]>();
  for (const mem of workspace.active) {
    if (mem.clusterId) {
      const list = clusterMap.get(mem.clusterId) ?? [];
      list.push(mem);
      clusterMap.set(mem.clusterId, list);
    }
  }

  const backgroundCount = workspace.candidates?.length ?? 0;
  const ignitionMembers = new Set(workspace.ignitionCluster?.members ?? []);
  const activeIgnited = workspace.active.filter((m) => ignitionMembers.has(m.memoryId));

  return (
    <div className="space-y-12">
      {/* ── Header ── */}
      <section data-animate>
        <div className="maze-block relative overflow-hidden">
          <div className="max-w-2xl py-4">
            <p className="maze-eyebrow mb-3 text-lime">J-Space</p>
            <h1>Your AI&rsquo;s working memory</h1>
            <p className="maze-body mt-3 max-w-xl">
              Anthropic&rsquo;s 2026 paper{" "}
              <em>&ldquo;Verbalizable Representations Form a Global Workspace in Language Models&rdquo;</em>{" "}
              found that LLMs maintain a privileged subspace &mdash; the <strong>J-space</strong> (Jacobian
              space) &mdash; where only ~25 concepts are meaningfully active at a time, despite the
              model&rsquo;s vast capacity. Cortex applies this principle: out of {workspace.totalCandidates} stored
              memories, only {workspace.capacity} occupy the workspace at once &mdash; selected, scored, and
              kept loaded for your AI assistants to use.
            </p>
          </div>
        </div>
      </section>

      {/* ── The Pipeline: How It Works ── */}
      <section>
        <p className="maze-eyebrow mb-2" data-animate>How it works</p>
        <p className="text-[13px] text-muted-foreground mb-5 max-w-xl" data-animate>
          Every time you chat with an AI, sync a source, or query your memories, Cortex runs
          this pipeline to keep your workspace current.
        </p>
        <PipelineExplainer />
      </section>

      {/* ── Three-Region Architecture ── */}
      <section>
        <p className="maze-eyebrow mb-2" data-animate>Architecture</p>
        <p className="text-[13px] text-muted-foreground mb-5 max-w-xl" data-animate>
          The paper identifies three functional regions in an LLM &mdash; sensory (input parsing),
          workspace (abstract reasoning), and motor (output generation). Cortex mirrors
          this with three tiers for your personal memories:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-animate="1">
          <div className="maze-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-3 w-3 rounded-full bg-stone-400" />
              <p className="text-sm font-medium">Sensory (ingestion)</p>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Raw conversations arrive from ChatGPT, Claude, and Poke. The pipeline
              parses and extracts atomic facts &mdash; like an LLM&rsquo;s early layers parsing tokens.
            </p>
          </div>
          <div className="maze-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-3 w-3 rounded-full bg-lime" />
              <p className="text-sm font-medium">Workspace (active)</p>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {workspace.active.length} of your {workspace.capacity} slots are filled. These are the
              memories your AI assistants see right now &mdash; scored, ranked, and available
              for report and reasoning, just as the paper&rsquo;s workspace holds the concepts
              available for flexible inference.
            </p>
          </div>
          <div className="maze-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-3 w-3 rounded-full bg-stone-300" />
              <p className="text-sm font-medium">Background (long-term)</p>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {workspace.totalCandidates - workspace.active.length} memories sit in background storage.
              When a signal matches them, they get scored and can be promoted into the workspace.
            </p>
          </div>
        </div>
      </section>

      {/* ── Orbital Visualization ── */}
      <section>
        <p className="maze-eyebrow mb-2" data-animate>Live workspace</p>
        <p className="text-[13px] text-muted-foreground mb-4 max-w-xl" data-animate>
          The inner dots are your {workspace.active.length} active memories &mdash; closer to center means higher score.
          {backgroundCount > 0
            ? ` The ${backgroundCount} outer dots are background candidates waiting to be promoted.`
            : ""}
          {" "}Lines connect memories that belong to the same coherence cluster. Click any dot to inspect it.
        </p>
        <div className="maze-card-static p-0 overflow-hidden relative" data-animate="1">
          <OrbitalView
            active={workspace.active}
            candidates={workspace.candidates}
            ignitionCluster={workspace.ignitionCluster}
            capacity={workspace.capacity}
            onSelectMemory={handleMemorySelect}
            onSelectCluster={handleClusterSelect}
          />
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 mt-3 text-[11px] text-muted-foreground" data-animate="2">
          <span>{workspace.active.length}/{workspace.capacity} active slots</span>
          <span>{workspace.totalCandidates} total memories</span>
        </div>
      </section>

      {/* ── Scoring Breakdown ── */}
      <section>
        <p className="maze-eyebrow mb-2" data-animate>How memories are scored</p>
        <p className="text-[13px] text-muted-foreground mb-5 max-w-xl" data-animate>
          In the paper, <strong>workspace loading</strong> is measured as cosine similarity between an
          activation and a concept&rsquo;s lens vector &mdash; it predicts how successfully a concept
          can be manipulated. Cortex adapts this with three scoring dimensions. The colored bar
          next to each memory shows the balance. Click any memory to see the full breakdown.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6" data-animate="1">
          <div className="maze-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.68 0.16 132)" }} />
              <p className="text-[12px] font-medium">Relevance</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Analogous to the paper&rsquo;s loading signal: does this memory align with
              recent activity? Scored by keyword overlap with recent conversations,
              category match, and recency of reference.
            </p>
          </div>
          <div className="maze-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.58 0.18 260)" }} />
              <p className="text-[12px] font-medium">Strength</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              How durable and well-supported is this fact? Based on how many times it&rsquo;s been
              referenced across conversations and how recently it was confirmed.
            </p>
          </div>
          <div className="maze-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: "oklch(0.55 0.17 300)" }} />
              <p className="text-[12px] font-medium">Coherence</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Does this memory fit with other active memories? The paper shows workspace
              representations are &ldquo;flexibly generalizable&rdquo; &mdash; concepts that co-occur
              across many contexts get a coherence boost.
            </p>
          </div>
        </div>
      </section>

      {/* ── Clusters & Ignition ── */}
      <section>
        <p className="maze-eyebrow mb-2" data-animate>Clusters &amp; ignition</p>
        <p className="text-[13px] text-muted-foreground mb-5 max-w-xl" data-animate>
          The paper describes <strong>ignition</strong> as an all-or-none amplification &mdash; when
          evidence for a concept crosses a threshold, the workspace commits to it sharply rather
          than gradually, with bimodal outcomes. Cortex implements this as <strong>cluster ignition</strong>:
          when related memories form a group with 3+ members and high combined scores, the cluster
          ignites &mdash; boosting those memories and suppressing unrelated ones, focusing the workspace
          on a single topic.
        </p>

        {workspace.ignitionCluster ? (
          <div className="maze-card p-5 border-lime/30" data-animate="1">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 rounded-full bg-lime animate-pulse" />
              <p className="text-sm font-medium text-lime">Ignition active</p>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              The <strong>{workspace.ignitionCluster.label}</strong> cluster has ignited with{" "}
              {workspace.ignitionCluster.members.length} memories. These memories are being boosted
              and non-members are suppressed. This means your AI assistants will strongly
              emphasize this topic when answering questions.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {activeIgnited.map((mem) => (
                <button
                  key={mem.memoryId}
                  onClick={() => handleMemorySelect(mem)}
                  className="maze-tag bg-lime-muted text-lime border border-lime/20 cursor-pointer"
                >
                  {mem.content.slice(0, 50)}{mem.content.length > 50 ? "..." : ""}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="maze-card-static p-5" data-animate="1">
            <p className="text-[12px] text-muted-foreground">
              No cluster has ignited right now. This means your workspace is balanced across topics.
              Ignition typically fires when you&rsquo;re deeply focused on a single subject across
              multiple recent conversations.
            </p>
          </div>
        )}

        {clusterMap.size > 0 && (
          <div className="mt-4" data-animate="2">
            <p className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
              Active clusters
            </p>
            <div className="flex flex-wrap gap-2">
              {Array.from(clusterMap.entries()).map(([cid, members]) => {
                const isIgnition = workspace.ignitionCluster?.id === cid;
                return (
                  <button
                    key={cid}
                    onClick={() => handleClusterSelect(cid)}
                    className={[
                      "maze-tag cursor-pointer transition-colors",
                      isIgnition
                        ? "bg-lime-muted text-lime border border-lime/20"
                        : "bg-muted text-muted-foreground hover:bg-muted/80",
                    ].join(" ")}
                  >
                    {isIgnition && (
                      <span className="h-1.5 w-1.5 rounded-full bg-lime animate-pulse" />
                    )}
                    {cid} ({members.length} memories)
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── Decay & Modulation ── */}
      <section>
        <p className="maze-eyebrow mb-2" data-animate>Decay &amp; modulation</p>
        <p className="text-[13px] text-muted-foreground mb-5 max-w-xl" data-animate>
          The paper shows that workspace contents are selective &mdash; only a small subset of
          representations occupy the workspace at any time. Cortex enforces this with
          <strong> temporal decay</strong>: each unpinned memory&rsquo;s loading drops exponentially
          (7-day half-life). If nothing reinforces it, loading falls below 15% and it gets
          evicted back to background storage. You can override this:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-animate="1">
          <div className="maze-card p-4">
            <p className="text-[12px] font-medium mb-1">Hold in mind</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Pins a memory to the workspace. It won&rsquo;t decay or be evicted until you release it.
              Use this for facts you always want your AI to know.
            </p>
          </div>
          <div className="maze-card p-4">
            <p className="text-[12px] font-medium mb-1">Suppress</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Temporarily removes a memory from the workspace for 24 hours. It goes back to
              background and won&rsquo;t be promoted until the suppression expires.
            </p>
          </div>
          <div className="maze-card p-4">
            <p className="text-[12px] font-medium mb-1">Release</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Unpins a pinned memory, allowing it to decay naturally again. It stays in the
              workspace but will eventually be evicted if not reinforced by activity.
            </p>
          </div>
        </div>
      </section>

      {/* ── Active Memories ── */}
      <section>
        <p className="maze-eyebrow mb-2" data-animate>Active memories</p>
        <p className="text-[13px] text-muted-foreground mb-4 max-w-xl" data-animate>
          These {workspace.active.length} memories are what your AI assistants see right now.
          The tri-color bar shows the scoring balance: <span style={{ color: "oklch(0.68 0.16 132)" }}>relevance</span>,{" "}
          <span style={{ color: "oklch(0.58 0.18 260)" }}>strength</span>,{" "}
          <span style={{ color: "oklch(0.55 0.17 300)" }}>coherence</span>. Click to inspect or modulate.
        </p>

        {/* Category color key */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-[11px] text-muted-foreground" data-animate>
          {Object.entries(CATEGORY_DOT_COLORS).map(([cat, colorClass]) => (
            <span key={cat} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${colorClass} shrink-0`} />
              {(CATEGORY_LABELS[cat as MemoryCategory] ?? cat).replace(/_/g, " ")}
            </span>
          ))}
        </div>
        <div className="grid gap-2" data-animate="1">
          {workspace.active.map((mem) => {
            const dotColor = CATEGORY_DOT_COLORS[mem.category] ?? "bg-neutral-400";
            const isIgnited = ignitionMembers.has(mem.memoryId);
            const scoreSum = mem.relevanceScore + mem.strengthScore + mem.coherenceScore;

            return (
              <button
                key={mem.memoryId}
                onClick={() => handleMemorySelect(mem)}
                className="maze-card p-4 text-left w-full"
              >
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                    <span className={`h-2.5 w-2.5 rounded-full ${dotColor}`} />
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {mem.totalScore.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-relaxed line-clamp-2">{mem.content}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                      <span>
                        {(CATEGORY_LABELS[mem.category as MemoryCategory] ?? mem.category).replace(/_/g, " ")}
                      </span>
                      {mem.pinned && (
                        <>
                          <span className="text-muted-foreground/30">|</span>
                          <span className="text-lime">pinned</span>
                        </>
                      )}
                      {isIgnited && (
                        <>
                          <span className="text-muted-foreground/30">|</span>
                          <span className="text-lime">ignition</span>
                        </>
                      )}
                      {mem.clusterId && (
                        <>
                          <span className="text-muted-foreground/30">|</span>
                          <span className="font-mono">{mem.clusterId}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 w-16 flex flex-col gap-0.5 pt-1">
                    <div className="h-1 rounded-full overflow-hidden bg-muted flex">
                      <div className="h-full" style={{ width: `${scoreSum > 0 ? (mem.relevanceScore / scoreSum) * 100 : 0}%`, background: "oklch(0.68 0.16 132)" }} />
                      <div className="h-full" style={{ width: `${scoreSum > 0 ? (mem.strengthScore / scoreSum) * 100 : 0}%`, background: "oklch(0.58 0.18 260)" }} />
                      <div className="h-full" style={{ width: `${scoreSum > 0 ? (mem.coherenceScore / scoreSum) * 100 : 0}%`, background: "oklch(0.55 0.17 300)" }} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {workspace.active.length === 0 && (
            <div className="maze-card-static p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No active workspace memories. Trigger a sync or add memories to populate the workspace.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Detail Drawer */}
      <DetailDrawer
        selectedMemory={selectedMemory}
        clusterMembers={clusterMembers}
        ignitionCluster={workspace.ignitionCluster}
        onClose={handleClose}
        onHold={handleHold}
        onSuppress={handleSuppress}
        onRelease={handleRelease}
      />
    </div>
  );
}
