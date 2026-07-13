"use client";

import { useState } from "react";
import { Pin, ChevronDown, ChevronUp, Hand, EyeOff, Unlock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { WorkspaceSlotResponse } from "@/contracts/workspace";

interface WorkspaceSlotCardProps {
  slot: WorkspaceSlotResponse;
  onHold?: (concept: string) => void;
  onRelease?: (concept: string) => void;
  onSuppress?: (concept: string) => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const SIGNAL_LABELS: Record<string, string> = {
  activity: "Activity",
  query: "Query",
  ignition: "Ignition",
  manual: "Manual",
};

export function WorkspaceSlotCard({ slot, onHold, onRelease, onSuppress }: WorkspaceSlotCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!slot.memoryId || !slot.conceptLabel) {
    return null;
  }

  const opacityValue = 0.4 + slot.loading * 0.6;

  return (
    <div
      className="bg-white rounded-xl border border-stone-200 shadow-sm transition-all hover:shadow-md"
      style={{ opacity: opacityValue }}
    >
      {/* Card header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {slot.pinned && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                <Pin className="h-2.5 w-2.5" />
                Pinned
              </span>
            )}
            <span className="text-[9px] font-medium text-stone-400 uppercase tracking-wider">
              {SIGNAL_LABELS[slot.sourceSignal] ?? slot.sourceSignal}
            </span>
            {slot.activatedAt && (
              <span className="text-[9px] text-stone-400">
                {timeAgo(slot.activatedAt)}
              </span>
            )}
          </div>
          <p className="text-[13px] font-medium text-stone-800 leading-snug truncate">
            {slot.conceptLabel}
          </p>
        </div>
        <div className="shrink-0 text-stone-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Loading bar */}
      <div className="px-4 pb-3">
        <Progress value={slot.loading * 100}>
          <div className="flex items-center justify-between text-[9px] text-stone-400 mb-1">
            <span>Loading</span>
            <span>{Math.round(slot.loading * 100)}%</span>
          </div>
        </Progress>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-stone-100 px-4 py-3 space-y-3">
          {/* Memories list */}
          {slot.memories.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-stone-500 uppercase tracking-wider">
                Memories
              </p>
              {slot.memories.map((mem, i) => (
                <p key={i} className="text-[12px] text-stone-600 leading-relaxed pl-2 border-l-2 border-stone-200">
                  {mem}
                </p>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            {onHold && (
              <button
                onClick={() => onHold(slot.conceptLabel!)}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-600 bg-stone-50 hover:bg-stone-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Hand className="h-3 w-3" />
                Hold in mind
              </button>
            )}
            {onRelease && (
              <button
                onClick={() => onRelease(slot.conceptLabel!)}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-600 bg-stone-50 hover:bg-stone-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Unlock className="h-3 w-3" />
                Release
              </button>
            )}
            {onSuppress && (
              <button
                onClick={() => onSuppress(slot.conceptLabel!)}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-red-500 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <EyeOff className="h-3 w-3" />
                Suppress
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
