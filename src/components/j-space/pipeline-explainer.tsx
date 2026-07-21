"use client";

import {
  Activity,
  BarChart3,
  CircleDot,
  TrendingDown,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── Pipeline stage definitions ─────────────────────────────────────────── */

interface Stage {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const STAGES: Stage[] = [
  {
    id: "signals",
    label: "Signals",
    description: "You chat, sync, or query \u2192 Cortex captures keywords and categories as activity signals",
    icon: Activity,
  },
  {
    id: "scoring",
    label: "Scoring",
    description: "Inspired by the paper\u2019s Jacobian lens, Cortex scores each memory by relevance, strength, and coherence against recent signals",
    icon: BarChart3,
  },
  {
    id: "workspace",
    label: "Promote",
    description: "Highest-scoring memories fill the 20 workspace slots \u2014 these are what your AI sees",
    icon: CircleDot,
  },
  {
    id: "decay",
    label: "Decay",
    description: "Every minute, unused memory loading drops: loading(t) = loading\u2080 \u00D7 e^(\u2212\u03BBt), 7-day half-life",
    icon: TrendingDown,
  },
  {
    id: "eviction",
    label: "Evict",
    description: "When loading falls below 15%, the memory is evicted back to background storage for a new one",
    icon: XCircle,
  },
];

/* ── Component ──────────────────────────────────────────────────────────── */

export function PipelineExplainer() {
  return (
    <div className="maze-block">
      <p className="maze-eyebrow mb-5">Pipeline</p>

      {/* Inline keyframes — CSS animations, no canvas */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pe-dash-flow {
          to { stroke-dashoffset: -24; }
        }
        @keyframes pe-signal-pulse {
          0%, 100% { box-shadow: 0 0 0 0 var(--lime); }
          50% { box-shadow: 0 0 0 8px transparent; }
        }
        .pe-flowing-line {
          animation: pe-dash-flow 1.2s linear infinite;
        }
        .pe-signal-pulse {
          animation: pe-signal-pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}} />

      <div
        className="relative flex items-start justify-between gap-0 overflow-x-auto"
        style={{ minHeight: 160 }}
      >
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const isFirst = i === 0;

          return (
            <div
              key={stage.id}
              className="flex items-start"
              style={{ flex: "1 1 0%", minWidth: 0 }}
            >
              {/* ── Connector line (before every node except the first) ── */}
              {i > 0 && (
                <div
                  className="flex-shrink-0 flex items-center"
                  style={{ width: 48, height: 48, marginTop: 0 }}
                >
                  <svg
                    width="100%"
                    height="48"
                    viewBox="0 0 48 48"
                    fill="none"
                    preserveAspectRatio="none"
                    className="block"
                  >
                    <line
                      x1="0"
                      y1="24"
                      x2="48"
                      y2="24"
                      stroke="var(--border)"
                      strokeWidth="1.5"
                    />
                    <line
                      x1="0"
                      y1="24"
                      x2="48"
                      y2="24"
                      stroke="var(--lime)"
                      strokeWidth="1.5"
                      strokeDasharray="6 6"
                      strokeLinecap="round"
                      className="pe-flowing-line"
                    />
                  </svg>
                </div>
              )}

              {/* ── Stage node ── */}
              <div
                className="flex flex-col items-center text-center"
                style={{ flex: "1 1 0%", minWidth: 0 }}
              >
                {/* Icon container */}
                <div
                  className={[
                    "w-12 h-12 rounded-xl flex items-center justify-center",
                    "border transition-colors duration-200",
                    isFirst
                      ? "bg-lime-muted border-lime/30 pe-signal-pulse"
                      : "bg-card border-border hover:border-lime/40",
                  ].join(" ")}
                >
                  <Icon
                    size={20}
                    strokeWidth={1.5}
                    className={
                      isFirst ? "text-lime" : "text-muted-foreground"
                    }
                  />
                </div>

                {/* Label */}
                <span
                  className="mt-2.5 text-[11px] font-semibold uppercase tracking-wider text-foreground"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {stage.label}
                </span>

                {/* Description */}
                <span className="mt-1 text-[10px] leading-[1.5] text-muted-foreground max-w-[130px]">
                  {stage.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
