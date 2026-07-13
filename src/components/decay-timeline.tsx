"use client";

import { Clock, TrendingDown } from "lucide-react";
import type { WorkspaceSlotResponse } from "@/contracts/workspace";

interface DecayTimelineProps {
  slots: WorkspaceSlotResponse[];
}

/** Decay rate in per-minute units (exponential decay constant) */
const DECAY_RATE = 0.0000688;

/** Eviction threshold — slot is evicted when loading drops below this */
const EVICTION_THRESHOLD = 0.15;

interface EvictionEstimate {
  conceptLabel: string;
  loading: number;
  minutesUntilEviction: number;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = Math.round(minutes % 60);
  if (hours < 24) {
    return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHr = hours % 24;
  return remainingHr > 0 ? `${days}d ${remainingHr}h` : `${days}d`;
}

function computeEvictions(slots: WorkspaceSlotResponse[]): EvictionEstimate[] {
  const estimates: EvictionEstimate[] = [];

  for (const slot of slots) {
    // Skip empty, pinned, or already-below-threshold slots
    if (!slot.memoryId || !slot.conceptLabel || slot.pinned) continue;
    if (slot.loading <= EVICTION_THRESHOLD) continue;

    // Time until loading drops below threshold:
    // loading(t) = loading(0) * e^(-decayRate * t)
    // threshold = loading(0) * e^(-decayRate * t)
    // t = -ln(threshold / loading(0)) / decayRate
    const t = -Math.log(EVICTION_THRESHOLD / slot.loading) / DECAY_RATE;

    estimates.push({
      conceptLabel: slot.conceptLabel,
      loading: slot.loading,
      minutesUntilEviction: t,
    });
  }

  // Sort by soonest to evict
  estimates.sort((a, b) => a.minutesUntilEviction - b.minutesUntilEviction);

  return estimates.slice(0, 5);
}

export function DecayTimeline({ slots }: DecayTimelineProps) {
  const evictions = computeEvictions(slots);

  if (evictions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="h-4 w-4 text-stone-400" />
          <p className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
            Decay Timeline
          </p>
        </div>
        <p className="text-[12px] text-stone-400">
          No unpinned concepts approaching eviction.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown className="h-4 w-4 text-stone-400" />
        <p className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
          Projected Evictions
        </p>
      </div>

      <div className="space-y-3">
        {evictions.map((ev, i) => {
          const urgency = ev.minutesUntilEviction < 60 * 24
            ? "text-red-500"
            : ev.minutesUntilEviction < 60 * 24 * 3
              ? "text-amber-500"
              : "text-stone-500";

          const barWidth = Math.max(5, Math.min(100, (ev.loading / 1) * 100));

          return (
            <div key={i} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium text-stone-700 truncate">
                  {ev.conceptLabel}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1 flex-1 rounded-full bg-stone-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-lime transition-all"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-stone-400 tabular-nums shrink-0">
                    {Math.round(ev.loading * 100)}%
                  </span>
                </div>
              </div>
              <div className={`flex items-center gap-1 shrink-0 ${urgency}`}>
                <Clock className="h-3 w-3" />
                <span className="text-[11px] font-medium tabular-nums">
                  {formatDuration(ev.minutesUntilEviction)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
