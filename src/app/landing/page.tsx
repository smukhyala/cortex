"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Brain,
  ArrowRight,
  Sparkles,
  Upload,
  Search,
  CheckCircle,
  RefreshCw,
  AlertTriangle,
  Lock,
  MessageSquare,
} from "lucide-react";

/* ── Types ── */
interface StatusResponse {
  stats: {
    memories: number;
    pending: number;
    sources: number;
    lastSync: string | null;
  };
  connections: Record<
    string,
    { connected: boolean; label: string; description: string }
  >;
}

/* ── Tiny intersection-observer hook for scroll-triggered animations ── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("landing-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`landing-fade ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

/* ── Platform icon (simple colored circle with initial) ── */
function PlatformBubble({
  label,
  color,
  initial,
  size = "lg",
}: {
  label: string;
  color: string;
  initial: string;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-16 w-16 text-xl" : "h-10 w-10 text-sm";
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${dim} rounded-full flex items-center justify-center font-bold text-white shadow-lg`}
        style={{ background: color }}
      >
        {initial}
      </div>
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/* ── Pain point card for the problem section ── */
function PainCard({
  quote,
  detail,
  delay,
}: {
  quote: string;
  detail: string;
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="maze-card p-6 sm:p-7 h-full border-l-2 border-red-400/50">
        <div className="flex items-start gap-3 mb-3">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm font-semibold text-foreground leading-snug">
            {quote}
          </p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed pl-7">
          {detail}
        </p>
      </div>
    </Reveal>
  );
}

/* ── Pipeline step for "How It Works" ── */
function PipelineStep({
  step,
  icon: Icon,
  title,
  description,
  delay,
  isLast = false,
}: {
  step: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  delay: number;
  isLast?: boolean;
}) {
  return (
    <Reveal delay={delay}>
      <div className="flex gap-5">
        {/* Step indicator + connector line */}
        <div className="flex flex-col items-center">
          <div className="h-11 w-11 rounded-xl bg-lime/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-lime" />
          </div>
          {!isLast && (
            <div className="w-px flex-1 bg-border mt-2 min-h-[24px]" />
          )}
        </div>
        {/* Content */}
        <div className="pb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-lime mb-1.5">
            Step {step}
          </p>
          <h3 className="text-base font-semibold tracking-tight mb-1.5">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </Reveal>
  );
}

/* ========================================================================== */
/*  LANDING PAGE                                                              */
/* ========================================================================== */

export default function LandingPage() {
  const [stats, setStats] = useState({
    memories: 247,
    sources: 3,
    syncs: 12,
  });

  useEffect(() => {
    fetch("/api/status")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json() as Promise<StatusResponse>;
      })
      .then((data) => {
        const connectedCount = Object.values(data.connections).filter(
          (c) => c.connected
        ).length;
        setStats({
          memories: data.stats.memories || 247,
          sources: connectedCount || data.stats.sources || 3,
          syncs: data.stats.sources || 12,
        });
      })
      .catch(() => {
        // keep fallback values
      });
  }, []);

  return (
    <div className="landing-page">
      {/* ── Inline styles for landing-specific animations ── */}
      <style>{`
        .landing-fade {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
                      transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .landing-fade.landing-visible {
          opacity: 1;
          transform: translateY(0);
        }

        @keyframes landing-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .landing-float {
          animation: landing-float 4s ease-in-out infinite;
        }

        @keyframes landing-pulse-line {
          0% { opacity: 0.15; }
          50% { opacity: 0.6; }
          100% { opacity: 0.15; }
        }
        .landing-pulse-line {
          animation: landing-pulse-line 2.5s ease-in-out infinite;
        }

        @keyframes landing-gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .landing-gradient-bg {
          background-size: 200% 200%;
          animation: landing-gradient-shift 8s ease-in-out infinite;
        }

        @keyframes landing-dash {
          to { stroke-dashoffset: 0; }
        }
        .landing-dash {
          stroke-dasharray: 200;
          stroke-dashoffset: 200;
        }
        .landing-visible .landing-dash {
          animation: landing-dash 1.2s ease-out forwards;
        }

        @keyframes landing-count-in {
          from { opacity: 0; transform: scale(0.6); }
          to { opacity: 1; transform: scale(1); }
        }
        .landing-count {
          opacity: 0;
        }
        .landing-visible .landing-count {
          animation: landing-count-in 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes landing-strike {
          0% { width: 0; }
          100% { width: 100%; }
        }
        .landing-visible .landing-strike::after {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          height: 2px;
          background: rgba(248, 113, 113, 0.6);
          animation: landing-strike 0.8s 0.3s ease-out forwards;
          width: 0;
        }
      `}</style>

      {/* ================================================================== */}
      {/*  HERO                                                              */}
      {/* ================================================================== */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Gradient background */}
        <div
          className="absolute inset-0 landing-gradient-bg"
          style={{
            background:
              "linear-gradient(135deg, #0a0a0a 0%, #111111 30%, oklch(0.25 0.08 121) 70%, oklch(0.35 0.12 121) 100%)",
          }}
        />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Radial glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20 blur-[120px]"
          style={{ background: "oklch(0.7119 0.1668 121.63)" }}
        />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center py-20">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-8">
              <Sparkles className="h-3.5 w-3.5 text-lime" />
              <span
                className="text-xs font-medium tracking-wide text-white/70"
                style={{
                  fontFamily: "var(--font-jakarta), system-ui, sans-serif",
                }}
              >
                Local-first. Privacy-first. Your data never leaves your machine.
              </span>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <h1
              className="text-white leading-[1.1] tracking-[-0.04em] font-bold"
              style={{
                fontSize: "clamp(2.5rem, 2rem + 4vw, 5rem)",
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              Your AI tools don&apos;t talk to each other.{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, oklch(0.7119 0.1668 121.63), oklch(0.82 0.14 121))",
                }}
              >
                Cortex fixes that.
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p
              className="mt-6 text-white/60 max-w-2xl mx-auto leading-relaxed"
              style={{ fontSize: "clamp(1rem, 0.9rem + 0.5vw, 1.25rem)" }}
            >
              You use ChatGPT, Claude, and Poke every day. Each one learns about
              you separately. None of them share what they know. Cortex extracts
              your memories from all of them, resolves conflicts, and syncs a
              single canonical profile everywhere.
            </p>
          </Reveal>

          <Reveal delay={0.35}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/"
                className="maze-btn maze-btn-lime text-base px-8 py-3 h-auto rounded-xl font-medium shadow-lg hover:shadow-xl"
              >
                <Lock className="h-4 w-4 mr-2" />
                Get Started -- It&apos;s Local
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </div>
          </Reveal>

          {/* Floating platform icons */}
          <Reveal delay={0.5}>
            <div className="mt-16 flex items-center justify-center gap-8 sm:gap-12">
              <div className="landing-float" style={{ animationDelay: "0s" }}>
                <PlatformBubble label="ChatGPT" color="#10a37f" initial="G" />
              </div>
              <div
                className="landing-float"
                style={{ animationDelay: "0.5s" }}
              >
                <PlatformBubble label="Claude" color="#d97706" initial="C" />
              </div>
              <div className="landing-float" style={{ animationDelay: "1s" }}>
                <PlatformBubble label="Poke" color="#3b82f6" initial="P" />
              </div>
            </div>
          </Reveal>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="w-6 h-10 rounded-full border-2 border-white/20 flex justify-center pt-2">
            <div className="w-1 h-2.5 rounded-full bg-white/40 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  THE PROBLEM                                                       */}
      {/* ================================================================== */}
      <section className="py-24 sm:py-32 bg-background">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <p
              className="maze-eyebrow text-lime text-center mb-4"
              style={{
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              The Problem
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2
              className="text-center max-w-3xl mx-auto"
              style={{
                fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem)",
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              Your memory is fragmented across every AI you use
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="text-center text-muted-foreground mt-4 max-w-xl mx-auto leading-relaxed">
              I built Cortex because I got tired of re-introducing myself to my
              own tools. If you use more than one AI, you already have this
              problem.
            </p>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-5">
            <PainCard
              quote={`"You told ChatGPT you're a founder. Claude has no idea."`}
              detail="Each AI tool keeps its own memory silo. They never compare notes. You end up with three different, incomplete profiles of yourself."
              delay={0.1}
            />
            <PainCard
              quote={`"You corrected your age in one tool. The others still think you're 23."`}
              detail="When facts change, you have to manually update every tool. Forget one, and it gives you wrong answers based on stale context."
              delay={0.15}
            />
            <PainCard
              quote={`"Every new conversation starts from zero."`}
              detail="You've had hundreds of conversations. Your AI tools should know you by now. Instead, you repeat your job title, your tech stack, your preferences -- every time."
              delay={0.2}
            />
            <PainCard
              quote={`"You have no idea what your AI tools actually remember about you."`}
              detail="Memories are buried in opaque settings pages you never check. There's no unified view of what each tool knows, what's outdated, or what's conflicting."
              delay={0.25}
            />
          </div>

          {/* Disconnected platforms visual */}
          <Reveal delay={0.3}>
            <div className="mt-16 flex items-center justify-center">
              <div className="flex items-center gap-8 sm:gap-12">
                {[
                  {
                    label: "ChatGPT",
                    color: "#10a37f",
                    initial: "G",
                    fact: "Knows your job",
                  },
                  {
                    label: "Claude",
                    color: "#d97706",
                    initial: "C",
                    fact: "Knows your stack",
                  },
                  {
                    label: "Poke",
                    color: "#3b82f6",
                    initial: "P",
                    fact: "Knows your name",
                  },
                ].map((p, i) => (
                  <div key={p.label} className="flex flex-col items-center">
                    <PlatformBubble
                      label={p.label}
                      color={p.color}
                      initial={p.initial}
                      size="sm"
                    />
                    <div className="mt-3 relative">
                      <div className="w-px h-4 bg-border mx-auto" />
                      <div className="maze-card-static px-4 py-2 mt-0 inline-block border-dashed border-2">
                        <p className="text-[11px] text-muted-foreground italic whitespace-nowrap">
                          {p.fact}
                        </p>
                      </div>
                      <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-400/80 border-2 border-background" />
                    </div>
                    {i < 2 && (
                      <div className="hidden md:block absolute" />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-6 tracking-wide">
              Three tools. Three silos. No shared understanding of who you are.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  THE SOLUTION                                                      */}
      {/* ================================================================== */}
      <section
        className="py-24 sm:py-32"
        style={{ background: "var(--surface-raised)" }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <p
              className="maze-eyebrow text-lime text-center mb-4"
              style={{
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              The Solution
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2
              className="text-center max-w-3xl mx-auto"
              style={{
                fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem)",
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              One memory. Every AI.
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="text-center text-muted-foreground mt-4 max-w-2xl mx-auto leading-relaxed">
              Cortex sits between you and your AI tools. It extracts what they
              learn about you, merges it into a single source of truth, and
              syncs it back. Update once, propagate everywhere.
            </p>
          </Reveal>

          {/* Hub diagram */}
          <Reveal delay={0.2}>
            <div className="mt-16 flex items-center justify-center">
              <div className="relative w-[340px] h-[280px] sm:w-[440px] sm:h-[340px]">
                {/* Center: Cortex */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                  <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-lime flex items-center justify-center shadow-xl">
                    <Brain className="h-8 w-8 sm:h-10 sm:w-10 text-lime-foreground" />
                  </div>
                  <p
                    className="text-center text-xs font-semibold mt-2 tracking-tight"
                    style={{
                      fontFamily:
                        "var(--font-jakarta), system-ui, sans-serif",
                    }}
                  >
                    Cortex
                  </p>
                </div>

                {/* Connection lines (SVG) */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 440 340"
                  fill="none"
                >
                  <line
                    x1="110"
                    y1="60"
                    x2="200"
                    y2="155"
                    stroke="oklch(0.7119 0.1668 121.63)"
                    strokeWidth="2"
                    className="landing-pulse-line"
                    style={{ animationDelay: "0s" }}
                  />
                  <line
                    x1="330"
                    y1="60"
                    x2="240"
                    y2="155"
                    stroke="oklch(0.7119 0.1668 121.63)"
                    strokeWidth="2"
                    className="landing-pulse-line"
                    style={{ animationDelay: "0.8s" }}
                  />
                  <line
                    x1="220"
                    y1="310"
                    x2="220"
                    y2="210"
                    stroke="oklch(0.7119 0.1668 121.63)"
                    strokeWidth="2"
                    className="landing-pulse-line"
                    style={{ animationDelay: "1.6s" }}
                  />
                </svg>

                {/* Platform nodes */}
                <div className="absolute top-0 left-4 sm:left-8">
                  <PlatformBubble
                    label="ChatGPT"
                    color="#10a37f"
                    initial="G"
                    size="sm"
                  />
                </div>
                <div className="absolute top-0 right-4 sm:right-8">
                  <PlatformBubble
                    label="Claude"
                    color="#d97706"
                    initial="C"
                    size="sm"
                  />
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
                  <PlatformBubble
                    label="Poke"
                    color="#3b82f6"
                    initial="P"
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </Reveal>

          {/* Pipeline flow description */}
          <Reveal delay={0.3}>
            <div className="mt-16 maze-card p-6 sm:p-8 max-w-2xl mx-auto">
              <p
                className="text-xs font-bold uppercase tracking-widest text-lime mb-5"
                style={{
                  fontFamily: "var(--font-jakarta), system-ui, sans-serif",
                }}
              >
                The Pipeline
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-0">
                {[
                  { label: "Import", sub: "conversations" },
                  { label: "Extract", sub: "facts via LLM" },
                  { label: "Deduplicate", sub: "resolve conflicts" },
                  { label: "Review", sub: "you approve" },
                  { label: "Sync", sub: "to all platforms" },
                ].map((step, i, arr) => (
                  <div
                    key={step.label}
                    className="flex items-center gap-3 sm:gap-0 sm:flex-1"
                  >
                    <div className="flex flex-col items-center text-center flex-1">
                      <p className="text-sm font-semibold tracking-tight">
                        {step.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {step.sub}
                      </p>
                    </div>
                    {i < arr.length - 1 && (
                      <ArrowRight className="h-3.5 w-3.5 text-lime shrink-0 hidden sm:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  HOW IT WORKS                                                      */}
      {/* ================================================================== */}
      <section className="py-24 sm:py-32 bg-background">
        <div className="max-w-3xl mx-auto px-6">
          <Reveal>
            <p
              className="maze-eyebrow text-lime text-center mb-4"
              style={{
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              How It Works
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2
              className="text-center max-w-2xl mx-auto mb-14"
              style={{
                fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem)",
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              Four steps to unified memory
            </h2>
          </Reveal>

          <div className="max-w-lg mx-auto">
            <PipelineStep
              step={1}
              icon={Upload}
              title="Connect your AI tools"
              description="Upload a ChatGPT export, point Cortex at your CLAUDE.md file, or connect Poke via API. Drag-and-drop or auto-watch -- your choice."
              delay={0.15}
            />
            <PipelineStep
              step={2}
              icon={Search}
              title="Cortex extracts and organizes your memories"
              description="An LLM pipeline reads your conversations and pulls out facts: preferences, projects, identity, relationships. Each memory is categorized and tagged."
              delay={0.2}
            />
            <PipelineStep
              step={3}
              icon={CheckCircle}
              title="Review and approve what gets shared"
              description="Nothing syncs without your say-so. The review queue shows you exactly what Cortex found, flags conflicts, and lets you edit or reject anything."
              delay={0.25}
            />
            <PipelineStep
              step={4}
              icon={RefreshCw}
              title="Sync everywhere with one click"
              description="Approved memories get written back to each platform's native format. ChatGPT Custom Instructions, CLAUDE.md, Poke API -- all updated at once."
              delay={0.3}
              isLast
            />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  BEFORE / AFTER                                                    */}
      {/* ================================================================== */}
      <section
        className="py-24 sm:py-32"
        style={{ background: "var(--surface-raised)" }}
      >
        <div className="max-w-4xl mx-auto px-6">
          <Reveal>
            <p
              className="maze-eyebrow text-lime text-center mb-4"
              style={{
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              The Difference
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2
              className="text-center"
              style={{
                fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem)",
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              Before &amp; After Cortex
            </h2>
          </Reveal>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Before */}
            <Reveal delay={0.15}>
              <div className="rounded-xl border-2 border-red-200/60 bg-red-50/30 p-8 h-full relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-400 to-red-300" />
                <p
                  className="text-xs font-bold uppercase tracking-widest text-red-400 mb-5"
                  style={{
                    fontFamily: "var(--font-jakarta), system-ui, sans-serif",
                  }}
                >
                  Before
                </p>
                <div className="space-y-4">
                  {[
                    "Tell ChatGPT you're a developer. Tell Claude too. And Poke. And again next week.",
                    "Update your job title in one tool. The others still introduce you wrong.",
                    "Switch to a new AI tool. Start completely from scratch.",
                    "No idea what ChatGPT actually remembers about you. Hope it's right.",
                  ].map((line) => (
                    <div key={line} className="flex items-start gap-2.5">
                      <MessageSquare className="h-3.5 w-3.5 text-red-400 mt-1 shrink-0" />
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {line}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Repetitive", "Inconsistent", "Blind"].map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-md bg-red-100/80 text-red-600 text-[11px] font-semibold uppercase tracking-wide"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* After */}
            <Reveal delay={0.25}>
              <div className="rounded-xl border-2 border-lime/30 bg-lime-muted/30 p-8 h-full relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-lime to-lime/60" />
                <p
                  className="text-xs font-bold uppercase tracking-widest text-lime mb-5"
                  style={{
                    fontFamily: "var(--font-jakarta), system-ui, sans-serif",
                  }}
                >
                  After
                </p>
                <div className="space-y-4">
                  {[
                    "Tell Cortex once. Every AI knows.",
                    "Update your title in the review queue. It propagates in seconds.",
                    "New tool? Import your full profile with one click.",
                    "See exactly what each platform knows. Edit or delete anything.",
                  ].map((line) => (
                    <div key={line} className="flex items-start gap-2.5">
                      <CheckCircle className="h-3.5 w-3.5 text-lime mt-1 shrink-0" />
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {line}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Automatic", "Consistent", "Transparent"].map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-md bg-lime/15 text-lime text-[11px] font-semibold uppercase tracking-wide"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  LIVE STATS                                                        */}
      {/* ================================================================== */}
      <section className="py-24 sm:py-32 bg-background">
        <div className="max-w-4xl mx-auto px-6">
          <Reveal>
            <p
              className="maze-eyebrow text-lime text-center mb-4"
              style={{
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              Right Now
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2
              className="text-center mb-14"
              style={{
                fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem)",
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              Your Cortex at a glance
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
              {[
                { value: String(stats.memories), label: "Memories Managed" },
                {
                  value: String(stats.sources),
                  label: "Platforms Connected",
                },
                { value: String(stats.syncs), label: "Sources Imported" },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className="landing-count"
                  style={{ animationDelay: `${i * 0.15}s` }}
                >
                  <p
                    className="font-bold tracking-tight text-lime"
                    style={{
                      fontSize: "clamp(3rem, 2.5rem + 3vw, 5rem)",
                      fontFamily:
                        "var(--font-jakarta), system-ui, sans-serif",
                      lineHeight: 1,
                    }}
                  >
                    {stat.value}
                  </p>
                  <p
                    className="text-sm text-muted-foreground mt-3 font-medium tracking-wide uppercase"
                    style={{
                      fontFamily:
                        "var(--font-jakarta), system-ui, sans-serif",
                      fontSize: "0.75rem",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  CTA                                                               */}
      {/* ================================================================== */}
      <section className="relative py-24 sm:py-32 overflow-hidden">
        {/* Background */}
        <div
          className="absolute inset-0 landing-gradient-bg"
          style={{
            background:
              "linear-gradient(135deg, #0a0a0a 0%, oklch(0.2 0.06 121) 50%, #0a0a0a 100%)",
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-15 blur-[100px]"
          style={{ background: "oklch(0.7119 0.1668 121.63)" }}
        />

        <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
          <Reveal>
            <h2
              className="text-white leading-tight"
              style={{
                fontSize: "clamp(1.75rem, 1.4rem + 2vw, 3rem)",
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
                letterSpacing: "-0.03em",
              }}
            >
              Stop re-introducing yourself to your own tools.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 text-white/50 text-lg leading-relaxed">
              Cortex runs locally on your machine. Your memories never leave
              your disk. No cloud, no account, no tracking. Just your AI
              context, finally in one place.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <Link
              href="/"
              className="maze-btn maze-btn-lime text-base px-10 py-4 h-auto rounded-xl font-medium shadow-lg hover:shadow-xl mt-10 inline-flex"
            >
              <Lock className="h-4 w-4 mr-2" />
              Get Started -- It&apos;s Local
              <ArrowRight className="h-5 w-5 ml-2" />
            </Link>
          </Reveal>
          <Reveal delay={0.25}>
            <p className="mt-6 text-white/30 text-sm">
              SQLite on your machine. No cloud. No sign-up.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 border-t border-border bg-background">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="Cortex" className="h-5 w-5" />
            <span
              className="text-sm font-medium tracking-tight text-muted-foreground"
              style={{
                fontFamily: "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              Cortex
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Built by Sanjay. Because AI memory shouldn&apos;t be siloed.
          </p>
        </div>
      </footer>
    </div>
  );
}
