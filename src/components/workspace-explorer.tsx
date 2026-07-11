"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Zap } from "lucide-react";
import type { WorkspaceState } from "@/contracts/workspace";
import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";
import { FOCUS_MODES } from "@/contracts/workspace";

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
  temporary: "bg-neutral-500",
};

interface WorkspaceExplorerProps {
  onWorkspaceComputed?: (state: WorkspaceState) => void;
}

export function WorkspaceExplorer({ onWorkspaceComputed }: WorkspaceExplorerProps) {
  const [query, setQuery] = useState("");
  const [focusMode, setFocusMode] = useState("balanced");
  const [state, setState] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(false);
  const [showIgnitionFlash, setShowIgnitionFlash] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevIgnitionRef = useRef<string | null>(null);

  const fetchWorkspace = useCallback(async (q: string, focus: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("query", q);
      if (focus !== "balanced") params.set("focus", focus);
      const res = await fetch(`/api/workspace?${params}`);
      const data: WorkspaceState = await res.json();
      setState(data);
      onWorkspaceComputed?.(data);

      // Ignition flash
      const newIgnitionId = data.ignitionCluster?.id ?? null;
      if (newIgnitionId && newIgnitionId !== prevIgnitionRef.current) {
        setShowIgnitionFlash(true);
        setTimeout(() => setShowIgnitionFlash(false), 600);
      }
      prevIgnitionRef.current = newIgnitionId;
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [onWorkspaceComputed]);

  // Debounced query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchWorkspace(query, focusMode);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, focusMode, fetchWorkspace]);

  // Initial load
  useEffect(() => {
    fetchWorkspace("", "balanced");
  }, [fetchWorkspace]);

  const ignitionMembers = state?.ignitionCluster
    ? new Set(state.ignitionCluster.members)
    : new Set<string>();

  return (
    <div className="space-y-4">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Query the workspace..."
          className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 border border-border/50 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-lime/50 transition-colors"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-lime/30 border-t-lime rounded-full animate-spin" />
        )}
      </div>

      {/* Focus mode pills */}
      <div className="flex gap-2 flex-wrap">
        {FOCUS_MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setFocusMode(mode.id)}
            className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${
              focusMode === mode.id
                ? "bg-lime text-lime-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Ignition banner */}
      {state?.ignitionCluster && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 ${
          showIgnitionFlash
            ? "bg-lime/20 border-lime/50"
            : "bg-lime/5 border-lime/20"
        }`}>
          <Zap className="h-3.5 w-3.5 text-lime shrink-0" />
          <span className="text-[11px] font-medium text-lime">
            Ignition: {state.ignitionCluster.label}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {state.ignitionCluster.members.length} memories clustered
          </span>
        </div>
      )}

      {/* Stats bar */}
      {state && (
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>{state.active.length}/{state.capacity} slots</span>
          <span>{Math.round(state.varianceExplained * 100)}% relevance</span>
          <span>{state.totalCandidates} total memories</span>
          {state.steeringApplied.length > 0 && (
            <span className="text-lime">{state.steeringApplied.join(", ")}</span>
          )}
        </div>
      )}

      {/* Active memories list */}
      {state && state.active.length > 0 && (
        <div className="space-y-1">
          {state.active.map((mem) => {
            const isIgnited = ignitionMembers.has(mem.memoryId);
            return (
              <div
                key={mem.memoryId}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg transition-colors ${
                  isIgnited
                    ? "bg-lime/5 border border-lime/15"
                    : "hover:bg-muted/30"
                }`}
              >
                <span className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${CATEGORY_DOT_COLORS[mem.category] ?? "bg-neutral-500"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] leading-relaxed line-clamp-1">{mem.content}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">
                      {CATEGORY_LABELS[mem.category as MemoryCategory] ?? mem.category}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {mem.totalScore.toFixed(1)}
                    </span>
                    {mem.pinned && <span className="text-[9px] text-lime font-medium">pinned</span>}
                    {isIgnited && <span className="text-[9px] text-lime font-medium">ignited</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {state && state.active.length === 0 && (
        <p className="text-[12px] text-muted-foreground text-center py-6">
          No memories in workspace. Sync some sources first.
        </p>
      )}
    </div>
  );
}
