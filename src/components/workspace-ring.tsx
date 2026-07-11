"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkspaceState } from "@/contracts/workspace";
import { CATEGORY_LABELS, type MemoryCategory } from "@/contracts/memory";

// ─── Category colors (Tailwind CSS classes for dots) ────────────────────────

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

const CATEGORY_RING_COLORS: Record<string, string> = {
  identity: "#3b82f6",
  education_career: "#9333ea",
  projects: "#10b981",
  research: "#eab308",
  preferences: "#f97316",
  goals: "#ec4899",
  relationships: "#6366f1",
  writing_voice: "#06b6d4",
  workflows: "#14b8a6",
  temporary: "#737373",
};

interface WorkspaceRingProps {
  state: WorkspaceState | null;
  loading?: boolean;
}

export function WorkspaceRing({ state, loading }: WorkspaceRingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  const [animFrame, setAnimFrame] = useState(0);

  const capacity = state?.capacity ?? 20;
  const active = state?.active ?? [];
  const ignitionMembers = state?.ignitionCluster
    ? new Set(state.ignitionCluster.members)
    : new Set<string>();

  // Animate pulse
  useEffect(() => {
    if (!state?.ignitionCluster) return;
    let frame = 0;
    const id = setInterval(() => {
      frame = (frame + 1) % 60;
      setAnimFrame(frame);
    }, 50);
    return () => clearInterval(id);
  }, [state?.ignitionCluster]);

  // Draw ring
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 280;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const radius = 110;
    const slotRadius = 8;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Draw ring track
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw slots
    for (let i = 0; i < capacity; i++) {
      const angle = (i / capacity) * Math.PI * 2 - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      const memory = active[i];
      const isHovered = hoveredSlot === i;

      if (memory) {
        const color = CATEGORY_RING_COLORS[memory.category] ?? "#737373";
        const isIgnited = ignitionMembers.has(memory.memoryId);

        // Ignition glow
        if (isIgnited) {
          const pulseAlpha = 0.15 + 0.15 * Math.sin((animFrame / 60) * Math.PI * 2);
          ctx.beginPath();
          ctx.arc(x, y, slotRadius + 6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(163, 230, 53, ${pulseAlpha})`;
          ctx.fill();
        }

        // Pin indicator
        if (memory.pinned) {
          ctx.beginPath();
          ctx.arc(x, y, slotRadius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(163, 230, 53, 0.5)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Filled slot
        ctx.beginPath();
        ctx.arc(x, y, isHovered ? slotRadius + 2 : slotRadius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        // Empty slot
        ctx.beginPath();
        ctx.arc(x, y, slotRadius - 1, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Center text
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const activeCount = active.length;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "300 32px system-ui, -apple-system, sans-serif";
    ctx.fillText(`${activeCount}`, cx, cy - 8);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "500 10px system-ui, -apple-system, sans-serif";
    ctx.fillText(`of ${capacity} slots`, cx, cy + 14);
  }, [state, hoveredSlot, animFrame, active, capacity, ignitionMembers]);

  // Mouse interaction
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !state) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cx = 140, cy = 140, radius = 110;

    let found: number | null = null;
    for (let i = 0; i < capacity; i++) {
      const angle = (i / capacity) * Math.PI * 2 - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      const dist = Math.sqrt((mx - x) ** 2 + (my - y) ** 2);
      if (dist < 14) {
        found = i;
        break;
      }
    }
    setHoveredSlot(found);
  }

  const hoveredMemory = hoveredSlot !== null ? active[hoveredSlot] : null;

  return (
    <div className="maze-card p-6" data-animate>
      <div className="flex items-center justify-between mb-4">
        <p className="maze-eyebrow text-[10px]">Global Workspace</p>
        {state?.ignitionCluster && (
          <span className="text-[10px] font-medium text-lime flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-lime maze-pulse" />
            Ignition: {state.ignitionCluster.label}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredSlot(null)}
          className="cursor-crosshair"
          style={{ width: 280, height: 280 }}
        />
      </div>

      {/* Hovered memory tooltip */}
      {hoveredMemory && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-muted/50 border border-border/50">
          <div className="flex items-center gap-2 mb-1">
            <span className={`h-2 w-2 rounded-full shrink-0 ${CATEGORY_DOT_COLORS[hoveredMemory.category] ?? "bg-neutral-500"}`} />
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {CATEGORY_LABELS[hoveredMemory.category as MemoryCategory] ?? hoveredMemory.category}
            </span>
            {hoveredMemory.pinned && (
              <span className="text-[9px] font-medium text-lime">pinned</span>
            )}
          </div>
          <p className="text-[12px] leading-relaxed line-clamp-2">{hoveredMemory.content}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Score: {hoveredMemory.totalScore.toFixed(1)}</p>
        </div>
      )}

      {/* Variance explained */}
      {state && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
          <span className="text-[10px] text-muted-foreground">Relevance captured</span>
          <span className="text-[11px] font-medium">{Math.round((state.varianceExplained) * 100)}%</span>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-card/80 rounded-2xl">
          <div className="h-5 w-5 border-2 border-lime/30 border-t-lime rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
