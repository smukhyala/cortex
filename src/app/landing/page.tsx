"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  Brain,
  Zap,
  Shield,
  RefreshCw,
  ArrowRight,
  Sparkles,
} from "lucide-react";

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
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

/* ── Feature card ── */
function FeatureCard({
  icon: Icon,
  title,
  description,
  delay,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <Reveal delay={delay}>
      <div className="group maze-card p-6 sm:p-8 h-full">
        <div className="h-12 w-12 rounded-xl bg-lime/10 flex items-center justify-center mb-5 transition-transform group-hover:scale-110">
          <Icon className="h-5 w-5 text-lime" />
        </div>
        <h3 className="text-base font-semibold tracking-tight mb-2">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </Reveal>
  );
}

/* ========================================================================== */
/*  LANDING PAGE                                                              */
/* ========================================================================== */

export default function LandingPage() {
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
                  fontFamily:
                    "var(--font-jakarta), system-ui, sans-serif",
                }}
              >
                Personal AI Memory Layer
              </span>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <h1
              className="text-white leading-[1.1] tracking-[-0.04em] font-bold"
              style={{
                fontSize: "clamp(2.5rem, 2rem + 4vw, 5rem)",
                fontFamily:
                  "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              Your AI Memory,{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, oklch(0.7119 0.1668 121.63), oklch(0.82 0.14 121))",
                }}
              >
                Unified
              </span>
            </h1>
          </Reveal>

          <Reveal delay={0.2}>
            <p
              className="mt-6 text-white/60 max-w-2xl mx-auto leading-relaxed"
              style={{ fontSize: "clamp(1rem, 0.9rem + 0.5vw, 1.25rem)" }}
            >
              Your personal context is scattered across ChatGPT, Claude, and
              Poke. You repeat yourself to every AI tool. Cortex keeps them all
              in sync.
            </p>
          </Reveal>

          <Reveal delay={0.35}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/"
                className="maze-btn maze-btn-lime text-base px-8 py-3 h-auto rounded-xl font-medium shadow-lg hover:shadow-xl"
              >
                Get Started
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
      {/*  PROBLEM                                                           */}
      {/* ================================================================== */}
      <section className="py-24 sm:py-32 bg-background">
        <div className="max-w-5xl mx-auto px-6">
          <Reveal>
            <p
              className="maze-eyebrow text-lime text-center mb-4"
              style={{
                fontFamily:
                  "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              The Problem
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2
              className="text-center max-w-2xl mx-auto"
              style={{
                fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem)",
                fontFamily:
                  "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              The Problem with AI Memory
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="text-center text-muted-foreground mt-4 max-w-xl mx-auto leading-relaxed">
              You told ChatGPT you&apos;re 25. Claude thinks you&apos;re still
              in college. Poke doesn&apos;t know your name.
            </p>
          </Reveal>

          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                label: "ChatGPT",
                color: "#10a37f",
                initial: "G",
                memory: '"Knows your age and job title"',
              },
              {
                label: "Claude",
                color: "#d97706",
                initial: "C",
                memory: '"Has outdated info about your role"',
              },
              {
                label: "Poke",
                color: "#3b82f6",
                initial: "P",
                memory: '"Missing everything you told the others"',
              },
            ].map((platform, i) => (
              <Reveal key={platform.label} delay={0.1 * (i + 1)}>
                <div className="flex flex-col items-center text-center">
                  <PlatformBubble
                    label={platform.label}
                    color={platform.color}
                    initial={platform.initial}
                  />
                  {/* Disconnected memory bubble */}
                  <div className="mt-5 relative">
                    <div className="w-px h-6 bg-border mx-auto" />
                    <div className="maze-card-static px-5 py-3 mt-0 inline-block border-dashed border-2">
                      <p className="text-xs text-muted-foreground italic">
                        {platform.memory}
                      </p>
                    </div>
                    {/* Red "disconnected" indicator */}
                    <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-400/80 border-2 border-background" />
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  SOLUTION                                                          */}
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
                fontFamily:
                  "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              The Solution
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2
              className="text-center max-w-2xl mx-auto"
              style={{
                fontSize: "clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem)",
                fontFamily:
                  "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              One Brain for All Your AI Tools
            </h2>
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
                  {/* ChatGPT line */}
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
                  {/* Claude line */}
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
                  {/* Poke line */}
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

          {/* Feature cards */}
          <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FeatureCard
              icon={Zap}
              title="Auto-Extract"
              description="Memories are automatically extracted from your conversations. No manual tagging required."
              delay={0.1}
            />
            <FeatureCard
              icon={Brain}
              title="Smart Dedup"
              description="Duplicate and conflicting memories are intelligently resolved so your context stays clean."
              delay={0.15}
            />
            <FeatureCard
              icon={RefreshCw}
              title="Cross-Platform Sync"
              description="Changes propagate to ChatGPT, Claude, and Poke. Update once, sync everywhere."
              delay={0.2}
            />
            <FeatureCard
              icon={Shield}
              title="You're in Control"
              description="Review, edit, and manage what gets shared. Nothing goes out without your approval."
              delay={0.25}
            />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/*  BEFORE / AFTER                                                    */}
      {/* ================================================================== */}
      <section className="py-24 sm:py-32 bg-background">
        <div className="max-w-4xl mx-auto px-6">
          <Reveal>
            <p
              className="maze-eyebrow text-lime text-center mb-4"
              style={{
                fontFamily:
                  "var(--font-jakarta), system-ui, sans-serif",
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
                fontFamily:
                  "var(--font-jakarta), system-ui, sans-serif",
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
                  className="text-xs font-bold uppercase tracking-widest text-red-400 mb-4"
                  style={{
                    fontFamily:
                      "var(--font-jakarta), system-ui, sans-serif",
                  }}
                >
                  Before
                </p>
                <p className="text-lg font-semibold text-foreground leading-snug mb-3">
                  Fragmented memory everywhere
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Tell ChatGPT your name. Tell Claude your role. Tell Poke your
                  projects. Repeat every time. Correct outdated info. Lose
                  context when switching tools.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Repetitive", "Inconsistent", "Manual"].map((tag) => (
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
                  className="text-xs font-bold uppercase tracking-widest text-lime mb-4"
                  style={{
                    fontFamily:
                      "var(--font-jakarta), system-ui, sans-serif",
                  }}
                >
                  After
                </p>
                <p className="text-lg font-semibold text-foreground leading-snug mb-3">
                  Unified, always current
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Tell once. Every AI tool knows. Always current. Always
                  accurate. Your memory stays in sync across every platform
                  automatically.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Automatic", "Consistent", "Synced"].map((tag) => (
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
      {/*  STATS                                                             */}
      {/* ================================================================== */}
      <section
        className="py-24 sm:py-32"
        style={{ background: "var(--surface-raised)" }}
      >
        <div className="max-w-4xl mx-auto px-6">
          <Reveal>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
              {[
                { value: "247", label: "Memories Managed" },
                { value: "3", label: "Platforms Connected" },
                { value: "12", label: "Auto-Syncs This Week" },
              ].map((stat, i) => (
                <div key={stat.label} className="landing-count" style={{ animationDelay: `${i * 0.15}s` }}>
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
                fontFamily:
                  "var(--font-jakarta), system-ui, sans-serif",
                letterSpacing: "-0.03em",
              }}
            >
              Ready to unify your AI memory?
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 text-white/50 text-lg">
              Stop repeating yourself. Start syncing.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <Link
              href="/"
              className="maze-btn maze-btn-lime text-base px-10 py-4 h-auto rounded-xl font-medium shadow-lg hover:shadow-xl mt-10 inline-flex"
            >
              Open Dashboard
              <ArrowRight className="h-5 w-5 ml-2" />
            </Link>
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
                fontFamily:
                  "var(--font-jakarta), system-ui, sans-serif",
              }}
            >
              Cortex
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Personal AI Memory Sync
          </p>
        </div>
      </footer>
    </div>
  );
}
