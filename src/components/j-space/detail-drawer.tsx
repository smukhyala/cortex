"use client";

import { useEffect, useRef } from "react";
import {
  X,
  Pin,
  Hand,
  EyeOff,
  Unlock,
  BarChart3,
  Zap,
  Layers,
} from "lucide-react";
import type { WorkspaceCandidate, IgnitionCluster } from "@/contracts/workspace";
import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";

/* ── Category dot colors ──────────────────────────────────────────────── */

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

const CATEGORY_TAG_COLORS: Record<string, string> = {
  identity: "bg-blue-50 text-blue-700",
  education_career: "bg-purple-50 text-purple-700",
  projects: "bg-emerald-50 text-emerald-700",
  research: "bg-yellow-50 text-yellow-700",
  preferences: "bg-orange-50 text-orange-700",
  goals: "bg-pink-50 text-pink-700",
  relationships: "bg-indigo-50 text-indigo-700",
  writing_voice: "bg-cyan-50 text-cyan-700",
  workflows: "bg-teal-50 text-teal-700",
  temporary: "bg-neutral-100 text-neutral-600",
};

/* ── Props ────────────────────────────────────────────────────────────── */

interface DetailDrawerProps {
  selectedMemory: WorkspaceCandidate | null;
  clusterMembers?: WorkspaceCandidate[];
  ignitionCluster: IgnitionCluster | null;
  onClose: () => void;
  onHold?: (concept: string) => void;
  onSuppress?: (concept: string) => void;
  onRelease?: (concept: string) => void;
}

/* ── Score bar segment ────────────────────────────────────────────────── */

function ScoreSegment({
  label,
  value,
  color,
  total,
}: {
  label: string;
  value: number;
  color: string;
  total: number;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  if (pct < 2) return null;

  return (
    <div
      className="relative h-7 flex items-center justify-center overflow-hidden first:rounded-l-md last:rounded-r-md"
      style={{ width: `${pct}%`, background: color, minWidth: 28 }}
      title={`${label}: ${value.toFixed(2)}`}
    >
      <span className="text-[9px] font-semibold text-white/90 uppercase tracking-wide truncate px-1">
        {label}
      </span>
    </div>
  );
}

/* ── Component ────────────────────────────────────────────────────────── */

export function DetailDrawer({
  selectedMemory,
  clusterMembers,
  ignitionCluster,
  onClose,
  onHold,
  onSuppress,
  onRelease,
}: DetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const isOpen = selectedMemory !== null || (clusterMembers && clusterMembers.length > 0);
  const isClusterView = clusterMembers && clusterMembers.length > 0 && !selectedMemory;

  /* Close on Escape */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  /* ── Cluster view ───────────────────────────────────────────────────── */

  if (isClusterView && clusterMembers) {
    const clusterLabel = ignitionCluster?.label ?? "Cluster";
    const isIgnition =
      ignitionCluster !== null &&
      clusterMembers.every((m) =>
        ignitionCluster.members.includes(m.memoryId)
      );
    const totalScore = clusterMembers.reduce((s, m) => s + m.totalScore, 0);

    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-40 bg-black/10 transition-opacity duration-300"
          style={{ opacity: 1 }}
          onClick={onClose}
        />

        {/* Drawer */}
        <div
          ref={drawerRef}
          className="fixed top-0 right-0 z-50 h-full w-[380px] bg-card border-l border-border overflow-y-auto transition-transform duration-300 ease-out"
          style={{
            transform: "translateX(0)",
            boxShadow: "-8px 0 30px rgba(0,0,0,0.08)",
          }}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-lime" />
              <p className="maze-eyebrow text-lime">Cluster</p>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
            >
              <X size={16} className="text-muted-foreground" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Cluster info */}
            <div>
              <h3 className="text-base font-medium">{clusterLabel}</h3>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                <span>{clusterMembers.length} members</span>
                <span className="text-muted-foreground/30">|</span>
                <span>Score: {totalScore.toFixed(2)}</span>
              </div>
            </div>

            {/* Ignition badge */}
            {isIgnition && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-lime-muted border border-lime/20">
                <Zap size={14} className="text-lime" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-lime">
                  Ignition Cluster
                </span>
              </div>
            )}

            {/* Member list */}
            <div>
              <p className="maze-eyebrow mb-3">Members</p>
              <div className="space-y-2">
                {clusterMembers.map((mem) => {
                  const dotColor = CATEGORY_DOT_COLORS[mem.category] ?? "bg-neutral-400";
                  return (
                    <div
                      key={mem.memoryId}
                      className="p-3 rounded-xl bg-muted/50 border border-border/50"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`h-2 w-2 rounded-full ${dotColor} shrink-0`} />
                        <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                          {(CATEGORY_LABELS[mem.category as MemoryCategory] ?? mem.category).replace(/_/g, " ")}
                        </span>
                        {mem.pinned && <Pin size={10} className="text-lime ml-auto" />}
                      </div>
                      <p className="text-[13px] leading-relaxed line-clamp-2">
                        {mem.content}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                        <span>{mem.totalScore.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ── Memory view ────────────────────────────────────────────────────── */

  if (!selectedMemory) return null;

  const mem = selectedMemory;
  const dotColor = CATEGORY_DOT_COLORS[mem.category] ?? "bg-neutral-400";
  const tagColor = CATEGORY_TAG_COLORS[mem.category] ?? "bg-neutral-100 text-neutral-600";
  const total = mem.relevanceScore + mem.strengthScore + mem.coherenceScore;
  const isInIgnition =
    ignitionCluster !== null && ignitionCluster.members.includes(mem.memoryId);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/10 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 z-50 h-full w-[380px] bg-card border-l border-border overflow-y-auto transition-transform duration-300 ease-out"
        style={{
          transform: "translateX(0)",
          boxShadow: "-8px 0 30px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-lime" />
            <p className="maze-eyebrow text-lime">Memory Detail</p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Category + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`maze-tag ${tagColor}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
              {(CATEGORY_LABELS[mem.category as MemoryCategory] ?? mem.category).replace(/_/g, " ")}
            </span>
            {mem.pinned && (
              <span className="maze-tag bg-lime-muted text-lime">
                <Pin size={10} />
                Pinned
              </span>
            )}
            {isInIgnition && (
              <span className="maze-tag bg-lime-muted text-lime">
                <Zap size={10} />
                Ignition
              </span>
            )}
          </div>

          {/* Content */}
          <div>
            <p className="maze-eyebrow mb-2">Content</p>
            <p className="text-[13px] leading-relaxed">{mem.content}</p>
          </div>

          {/* Score breakdown */}
          <div>
            <p className="maze-eyebrow mb-2">Score Breakdown</p>

            {/* Stacked bar */}
            <div className="flex w-full rounded-md overflow-hidden">
              <ScoreSegment
                label="Rel"
                value={mem.relevanceScore}
                color="oklch(0.68 0.16 132)"
                total={total}
              />
              <ScoreSegment
                label="Str"
                value={mem.strengthScore}
                color="oklch(0.58 0.18 260)"
                total={total}
              />
              <ScoreSegment
                label="Coh"
                value={mem.coherenceScore}
                color="oklch(0.55 0.17 300)"
                total={total}
              />
            </div>

            {/* Score legend */}
            <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: "oklch(0.68 0.16 132)" }} />
                Relevance {mem.relevanceScore.toFixed(2)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: "oklch(0.58 0.18 260)" }} />
                Strength {mem.strengthScore.toFixed(2)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: "oklch(0.55 0.17 300)" }} />
                Coherence {mem.coherenceScore.toFixed(2)}
              </span>
            </div>

            {/* Total */}
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </span>
              <span className="text-lg font-medium tabular-nums">
                {mem.totalScore.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Cluster ID */}
          {mem.clusterId && (
            <div>
              <p className="maze-eyebrow mb-2">Cluster</p>
              <span className="text-[12px] font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
                {mem.clusterId}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 border-t border-border space-y-2">
            <p className="maze-eyebrow mb-3">Actions</p>
            <div className="flex flex-col gap-2">
              {onHold && (
                <button
                  onClick={() => onHold(mem.content)}
                  className="maze-btn-outline maze-btn w-full justify-start gap-2.5 text-[12px]"
                >
                  <Hand size={14} />
                  Hold in Mind
                </button>
              )}
              {onSuppress && (
                <button
                  onClick={() => onSuppress(mem.content)}
                  className="maze-btn-ghost maze-btn w-full justify-start gap-2.5 text-[12px]"
                >
                  <EyeOff size={14} />
                  Suppress
                </button>
              )}
              {onRelease && (
                <button
                  onClick={() => onRelease(mem.content)}
                  className="maze-btn-ghost maze-btn w-full justify-start gap-2.5 text-[12px]"
                >
                  <Unlock size={14} />
                  Release
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
