"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { ArrowRight } from "lucide-react";

interface MemoryItem {
  id: string;
  content: string;
  category: string;
}

interface Stats {
  memories: number;
  pending: number;
  sources: number;
}

const CAT_COLORS: Record<string, string> = {
  identity: "#6d9fff",
  education_career: "#c89dff",
  projects: "#5de8b5",
  research: "#ffd760",
  preferences: "#ffab5e",
  goals: "#ff8ec6",
  relationships: "#8b8fff",
  writing_voice: "#5ed8e8",
  workflows: "#5ee8c4",
  temporary: "#888",
};

/* ── Hero Graphic ─────────────────────────────────────────────────────────── */

const TOOL_NODES = [
  { label: "ChatGPT", angle: -90, color: "#10a37f" },
  { label: "Claude", angle: 30, color: "#d4a574" },
  { label: "Poke", angle: 150, color: "#8b8fff" },
];

function HeroGraphic({ memories }: { memories: MemoryItem[] }) {
  const cx = 220;
  const cy = 220;
  const toolRadius = 170;
  const memRadius = 105;

  // Deterministic positions for memory dots based on actual data
  const memNodes = useMemo(() => {
    const items = memories.length > 0 ? memories.slice(0, 12) : Array.from({ length: 12 }, (_, i) => ({
      id: `placeholder-${i}`,
      content: "",
      category: Object.keys(CAT_COLORS)[i % Object.keys(CAT_COLORS).length],
    }));
    return items.map((mem, i) => {
      const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
      const r = memRadius + (i % 3 === 0 ? -14 : i % 3 === 1 ? 8 : 0);
      return {
        x: Math.round((cx + Math.cos(angle) * r) * 100) / 100,
        y: Math.round((cy + Math.sin(angle) * r) * 100) / 100,
        color: CAT_COLORS[mem.category] ?? "#888",
        content: mem.content,
      };
    });
  }, [memories]);

  const tools = TOOL_NODES.map((t) => {
    const rad = (t.angle * Math.PI) / 180;
    return {
      ...t,
      x: Math.round((cx + Math.cos(rad) * toolRadius) * 100) / 100,
      y: Math.round((cy + Math.sin(rad) * toolRadius) * 100) / 100,
    };
  });

  return (
    <div className="relative w-full max-w-[440px] aspect-square">
      {/* Glow backdrop */}
      <div
        className="absolute inset-0 rounded-full opacity-20 blur-[80px]"
        style={{ background: "radial-gradient(circle, #84cc16 0%, transparent 70%)" }}
      />
      <svg viewBox="0 0 440 440" className="w-full h-full" style={{ filter: "drop-shadow(0 0 30px rgba(132,204,22,0.08))" }}>
        <defs>
          <radialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#84cc16" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#84cc16" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Orbital rings */}
        <circle cx={cx} cy={cy} r={memRadius} fill="none" stroke="#27272A" strokeWidth="0.5" strokeDasharray="3 6" />
        <circle cx={cx} cy={cy} r={toolRadius} fill="none" stroke="#27272A" strokeWidth="0.5" strokeDasharray="3 6" />

        {/* Connections from tool nodes to center */}
        {tools.map((t) => (
          <line
            key={t.label}
            x1={cx} y1={cy} x2={t.x} y2={t.y}
            stroke={t.color}
            strokeWidth="0.8"
            strokeOpacity="0.25"
          />
        ))}

        {/* Connections from memory nodes to center */}
        {memNodes.map((m, i) => (
          <line
            key={i}
            x1={cx} y1={cy} x2={m.x} y2={m.y}
            stroke={m.color}
            strokeWidth="0.5"
            strokeOpacity="0.15"
          />
        ))}

        {/* Connections between adjacent memory nodes */}
        {memNodes.map((m, i) => {
          const next = memNodes[(i + 1) % memNodes.length];
          return (
            <line
              key={`edge-${i}`}
              x1={m.x} y1={m.y} x2={next.x} y2={next.y}
              stroke="#27272A"
              strokeWidth="0.7"
            />
          );
        })}

        {/* Center hub */}
        <circle cx={cx} cy={cy} r={28} fill="url(#hero-glow)" stroke="#84cc16" strokeWidth="1.2" />
        <circle cx={cx} cy={cy} r={4} fill="#84cc16" />
        {/* Pulsing ring */}
        <circle cx={cx} cy={cy} r={28} fill="none" stroke="#84cc16" strokeWidth="0.6" strokeOpacity="0.4">
          <animate attributeName="r" values="28;38;28" dur="3s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.4;0;0.4" dur="3s" repeatCount="indefinite" />
        </circle>

        {/* Memory nodes */}
        {memNodes.map((m, i) => (
          <g key={i}>
            <circle cx={m.x} cy={m.y} r={4.5} fill={m.color} fillOpacity="0.7" />
            <circle cx={m.x} cy={m.y} r={4.5} fill="none" stroke={m.color} strokeWidth="0.5" strokeOpacity="0.3">
              <animate attributeName="r" values="4.5;7;4.5" dur={`${2.5 + (i % 3) * 0.7}s`} repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.3;0;0.3" dur={`${2.5 + (i % 3) * 0.7}s`} repeatCount="indefinite" />
            </circle>
          </g>
        ))}

        {/* Tool nodes */}
        {tools.map((t) => (
          <g key={t.label}>
            <circle cx={t.x} cy={t.y} r={22} fill="#111113" stroke={t.color} strokeWidth="1.2" />
            <text
              x={t.x} y={t.y + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fill={t.color}
              fontSize="9"
              fontWeight="600"
              fontFamily="var(--font-jakarta), system-ui, sans-serif"
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Center label */}
        <text
          x={cx} y={cy + 46}
          textAnchor="middle"
          fill="#84cc16"
          fontSize="10"
          fontWeight="600"
          letterSpacing="0.12em"
          fontFamily="var(--font-jakarta), system-ui, sans-serif"
        >
          CORTEX
        </text>
      </svg>
    </div>
  );
}

export default function LandingPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/memories?limit=14")
      .then((r) => r.json())
      .then((d) => setMemories(d.items ?? []))
      .catch(() => {});
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setStats(d.stats ?? null))
      .catch(() => {});
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#09090B",
        color: "#FAFAFA",
        fontFamily: "var(--font-jakarta), system-ui, sans-serif",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .lp-link { color: #FAFAFA; text-decoration: none; }
        .lp-link:hover { opacity: 0.7; }
        .lp-muted { color: #71717A; }
        .lp-border { border-color: #27272A; }
        .lp-lime { color: #84cc16; }
        @keyframes lp-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .lp-ticker {
          animation: lp-scroll 60s linear infinite;
        }
        .lp-ticker:hover {
          animation-play-state: paused;
        }
        .lp-fade-edge {
          mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 5%, black 95%, transparent);
        }
      `}} />

      {/* ── Nav ── */}
      <nav
        className="flex items-center justify-between px-8 lg:px-16 h-16"
        style={{ borderBottom: "1px solid #18181B" }}
      >
        <span className="text-[15px] font-semibold tracking-wide">Cortex</span>
        <div className="flex items-center gap-6">
          <Link href="/j-space" className="lp-link text-[13px] lp-muted hidden sm:inline">J-Space</Link>
          <Link href="/memories" className="lp-link text-[13px] lp-muted hidden sm:inline">Memories</Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] font-medium"
            style={{ background: "#84cc16", color: "#09090B" }}
          >
            Dashboard
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="px-8 lg:px-16 pt-24 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left — copy */}
          <div>
            <p className="text-[13px] font-medium tracking-widest uppercase lp-lime mb-6">
              Personal AI Memory
            </p>
            <h1
              className="font-semibold leading-[1.05] tracking-tight"
              style={{ fontSize: "clamp(2.5rem, 6vw, 5rem)" }}
            >
              Your AI tools forget everything.
              <br />
              <span className="lp-muted">Cortex doesn&rsquo;t.</span>
            </h1>
            <p className="mt-8 text-[17px] leading-relaxed max-w-xl" style={{ color: "#A1A1AA" }}>
              Extract memories from ChatGPT, Claude, and Poke conversations.
              Deduplicate. Resolve conflicts. Sync back to every tool.
            </p>
            <div className="flex gap-4 mt-10">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 h-12 px-7 rounded-lg text-[15px] font-medium"
                style={{ background: "#84cc16", color: "#09090B" }}
              >
                Open Dashboard
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/j-space"
                className="inline-flex items-center gap-2 h-12 px-7 rounded-lg text-[15px] font-medium lp-link"
                style={{ border: "1px solid #27272A" }}
              >
                How it works
              </Link>
            </div>
          </div>

          {/* Right — graphic */}
          <div className="hidden lg:flex items-center justify-center">
            <HeroGraphic memories={memories} />
          </div>
        </div>
      </section>

      {/* ── Memory ticker ── */}
      {memories.length > 0 && (
        <section className="py-10" style={{ borderTop: "1px solid #18181B", borderBottom: "1px solid #18181B" }}>
          <p className="text-[11px] font-medium tracking-widest uppercase lp-muted px-8 lg:px-16 mb-5">
            Extracted from your conversations
          </p>
          <div className="lp-fade-edge overflow-hidden">
            <div className="lp-ticker flex gap-4 w-max">
              {[...memories, ...memories].map((mem, i) => (
                <div
                  key={`${mem.id}-${i}`}
                  className="shrink-0 rounded-lg px-4 py-3 max-w-[320px]"
                  style={{ border: "1px solid #27272A", background: "#111113" }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: CAT_COLORS[mem.category] ?? "#888" }}
                    />
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: "#52525B" }}>
                      {mem.category.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed line-clamp-2" style={{ color: "#D4D4D8" }}>
                    {mem.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Stats ── */}
      {stats && stats.memories > 0 && (
        <section className="px-8 lg:px-16 py-16" style={{ borderBottom: "1px solid #18181B" }}>
          <div className="flex items-baseline gap-16 flex-wrap">
            <div>
              <p className="text-5xl font-light tracking-tight">{stats.memories}</p>
              <p className="text-[12px] tracking-widest uppercase lp-muted mt-2">memories</p>
            </div>
            <div>
              <p className="text-5xl font-light tracking-tight">{stats.sources}</p>
              <p className="text-[12px] tracking-widest uppercase lp-muted mt-2">sources</p>
            </div>
            <div>
              <p className="text-5xl font-light tracking-tight">20</p>
              <p className="text-[12px] tracking-widest uppercase lp-muted mt-2">active workspace slots</p>
            </div>
          </div>
        </section>
      )}

      {/* ── How it works ── */}
      <section className="px-8 lg:px-16 py-20">
        <p className="text-[13px] font-medium tracking-widest uppercase lp-lime mb-10">
          How it works
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12 max-w-4xl">
          {[
            {
              title: "Import",
              body: "Upload a ChatGPT export (.zip) or Claude export. Or connect Claude Code for live sync via file watcher.",
            },
            {
              title: "Extract",
              body: "An LLM reads each conversation and extracts atomic, durable facts. Not debugging context. Not AI opinions. Just what you said about yourself.",
            },
            {
              title: "Resolve",
              body: "Duplicate memories merge automatically. Refinements update existing facts. Genuine contradictions go to your review queue.",
            },
            {
              title: "Sync",
              body: "Approved memories write back to every tool in its native format — Custom Instructions for ChatGPT, CLAUDE.md for Claude Code, API push for Poke.",
            },
          ].map(({ title, body }) => (
            <div key={title}>
              <h3 className="text-[18px] font-medium mb-3">{title}</h3>
              <p className="text-[14px] leading-[1.7]" style={{ color: "#A1A1AA" }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── J-Space ── */}
      <section className="px-8 lg:px-16 py-20" style={{ borderTop: "1px solid #18181B" }}>
        <div className="max-w-4xl">
          <p className="text-[13px] font-medium tracking-widest uppercase lp-lime mb-6">
            J-Space
          </p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight leading-tight mb-6 max-w-lg">
            Working memory for your AI assistant.
          </h2>
          <p className="text-[15px] leading-[1.7] max-w-xl mb-4" style={{ color: "#A1A1AA" }}>
            You have hundreds of memories, but an AI can only hold 20 at once.
            J-Space picks the most relevant ones based on what you&rsquo;re doing
            right now. Unused memories decay. New signals promote fresh ones.
          </p>
          <p className="text-[14px] leading-[1.7] max-w-xl mb-8" style={{ color: "#71717A" }}>
            Scoring weights: 40% keyword overlap, 25% category match, 20% recency, 15% co-occurrence.
            Seven-day half-life. Eviction below 15% loading. You can pin, suppress, or release any memory.
          </p>
          <Link
            href="/j-space"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-lg text-[14px] font-medium lp-link"
            style={{ border: "1px solid #27272A" }}
          >
            Explore J-Space
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* ── Sources ── */}
      <section className="px-8 lg:px-16 py-16" style={{ borderTop: "1px solid #18181B" }}>
        <p className="text-[13px] font-medium tracking-widest uppercase lp-lime mb-8">
          Supported sources
        </p>
        <div className="flex flex-wrap gap-3">
          {[
            "ChatGPT (export .zip)",
            "Claude.ai (export .json/.zip)",
            "Claude Code (live watcher)",
            "Poke (API push)",
            "Granola (markdown watcher)",
          ].map((src) => (
            <span
              key={src}
              className="rounded-full px-5 py-2.5 text-[13px]"
              style={{ border: "1px solid #27272A", color: "#D4D4D8" }}
            >
              {src}
            </span>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-8 lg:px-16 pt-20 pb-24" style={{ borderTop: "1px solid #18181B" }}>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-4">
          Get started in 30 seconds.
        </h2>
        <p className="text-[15px] mb-8 max-w-md" style={{ color: "#A1A1AA" }}>
          Export your conversations. Drag onto the dashboard. Done.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 h-12 px-7 rounded-lg text-[15px] font-medium"
          style={{ background: "#84cc16", color: "#09090B" }}
        >
          Open Dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
