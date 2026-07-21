"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import type { WorkspaceCandidate, IgnitionCluster } from "@/contracts/workspace";

// ─── Category Colors ────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
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

const DEFAULT_COLOR = "#a3a3a3";

// ─── Props ──────────────────────────────────────────────────────────────────

interface OrbitalViewProps {
  active: WorkspaceCandidate[];
  candidates?: WorkspaceCandidate[];
  ignitionCluster: IgnitionCluster | null;
  capacity: number;
  onSelectMemory?: (mem: WorkspaceCandidate) => void;
  onSelectCluster?: (clusterId: string) => void;
  className?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface PlottedNode {
  x: number;
  y: number;
  radius: number;
  candidate: WorkspaceCandidate;
  tier: "active" | "background";
  angle: number;
  orbitRadius: number;
  driftOffset: number;
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? DEFAULT_COLOR;
}

function scoreToRadius(totalScore: number): number {
  const clamped = Math.max(0, Math.min(1, totalScore));
  return 4 + clamped * 8; // 4px min, 12px max
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Deterministic but spread-out angular placement using golden angle */
function goldenAngle(index: number, seed: number): number {
  const golden = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees
  return (index * golden + seed * 0.7) % (2 * Math.PI);
}

/** Compute convex hull of 2D points (Graham scan) */
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points;

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  function cross(o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OrbitalView({
  active,
  candidates = [],
  ignitionCluster,
  capacity,
  onSelectMemory,
  onSelectCluster,
  className,
}: OrbitalViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const nodesRef = useRef<PlottedNode[]>([]);
  const hoveredRef = useRef<PlottedNode | null>(null);
  const selectedRef = useRef<string | null>(null);
  const timeRef = useRef(0);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    label: string;
    score: string;
  } | null>(null);

  // ── Build node layout ──────────────────────────────────────────────────

  const buildNodes = useCallback(
    (cx: number, cy: number, maxRadius: number): PlottedNode[] => {
      const nodes: PlottedNode[] = [];
      const innerBound = maxRadius * 0.6;

      // Active memories: inner 60%, higher score = closer to center
      for (let i = 0; i < active.length; i++) {
        const mem = active[i];
        const scoreFraction = Math.max(0, Math.min(1, mem.totalScore));
        // Higher score → closer to center: map [0,1] → [innerBound, innerBound*0.1]
        const orbitRadius = innerBound * (1 - scoreFraction * 0.9);
        const angle = goldenAngle(i, 0);
        const nodeRadius = scoreToRadius(mem.totalScore);

        nodes.push({
          x: cx + Math.cos(angle) * orbitRadius,
          y: cy + Math.sin(angle) * orbitRadius,
          radius: nodeRadius,
          candidate: mem,
          tier: "active",
          angle,
          orbitRadius,
          driftOffset: Math.random() * Math.PI * 2,
        });
      }

      // Background candidates: outer 40% (60-100% of radius)
      for (let i = 0; i < candidates.length; i++) {
        const mem = candidates[i];
        const scoreFraction = Math.max(0, Math.min(1, mem.totalScore));
        // Higher score → closer to inner boundary
        const orbitRadius = innerBound + (maxRadius - innerBound) * (1 - scoreFraction * 0.6);
        const angle = goldenAngle(i, 1);
        const nodeRadius = scoreToRadius(mem.totalScore);

        nodes.push({
          x: cx + Math.cos(angle) * orbitRadius,
          y: cy + Math.sin(angle) * orbitRadius,
          radius: nodeRadius,
          candidate: mem,
          tier: "background",
          angle,
          orbitRadius,
          driftOffset: Math.random() * Math.PI * 2,
        });
      }

      return nodes;
    },
    [active, candidates]
  );

  // ── Drawing ────────────────────────────────────────────────────────────

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, t: number) => {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, width * dpr, height * dpr);
      ctx.save();
      ctx.scale(dpr, dpr);

      const cx = width / 2;
      const cy = height / 2;
      const maxRadius = Math.min(cx, cy) - 24;
      const innerBound = maxRadius * 0.6;

      // ── Dashed boundary circle at 60% ──
      ctx.beginPath();
      ctx.arc(cx, cy, innerBound, 0, Math.PI * 2);
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Center dot with glow ──
      const pulseAlpha = 0.4 + Math.sin(t * 0.002) * 0.15;
      const glowRadius = 8 + Math.sin(t * 0.003) * 2;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      gradient.addColorStop(0, `rgba(132, 204, 22, ${pulseAlpha})`);
      gradient.addColorStop(1, "rgba(132, 204, 22, 0)");
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#84cc16";
      ctx.fill();

      // ── Update node positions with drift ──
      const nodes = nodesRef.current;
      for (const node of nodes) {
        const drift = Math.sin(t * 0.0003 + node.driftOffset) * 3;
        const angularDrift = t * 0.00005;
        const currentAngle = node.angle + angularDrift;
        const currentOrbit = node.orbitRadius + drift;
        node.x = cx + Math.cos(currentAngle) * currentOrbit;
        node.y = cy + Math.sin(currentAngle) * currentOrbit;
      }

      // ── Cluster constellation lines ──
      const clusterMap = new Map<string, PlottedNode[]>();
      for (const node of nodes) {
        const cid = node.candidate.clusterId;
        if (cid) {
          if (!clusterMap.has(cid)) {
            clusterMap.set(cid, []);
          }
          clusterMap.get(cid)!.push(node);
        }
      }

      for (const [clusterId, clusterNodes] of clusterMap) {
        if (clusterNodes.length < 2) continue;

        // Find dominant category in cluster
        const catCounts = new Map<string, number>();
        for (const n of clusterNodes) {
          const cat = n.candidate.category;
          catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
        }
        let dominantCat = "";
        let maxCount = 0;
        for (const [cat, count] of catCounts) {
          if (count > maxCount) {
            maxCount = count;
            dominantCat = cat;
          }
        }
        const lineColor = getCategoryColor(dominantCat);

        // Draw constellation lines between all pairs
        ctx.strokeStyle = hexToRgba(lineColor, 0.2);
        ctx.lineWidth = 0.5;
        for (let i = 0; i < clusterNodes.length; i++) {
          for (let j = i + 1; j < clusterNodes.length; j++) {
            ctx.beginPath();
            ctx.moveTo(clusterNodes[i].x, clusterNodes[i].y);
            ctx.lineTo(clusterNodes[j].x, clusterNodes[j].y);
            ctx.stroke();
          }
        }

        // ── Ignition hull ──
        const isIgnition = ignitionCluster && clusterId === ignitionCluster.id;
        if (isIgnition && clusterNodes.length >= 3) {
          const hullPoints = convexHull(clusterNodes.map((n) => ({ x: n.x, y: n.y })));
          if (hullPoints.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(hullPoints[0].x, hullPoints[0].y);
            for (let i = 1; i < hullPoints.length; i++) {
              ctx.lineTo(hullPoints[i].x, hullPoints[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = "rgba(132, 204, 22, 0.05)";
            ctx.fill();
            ctx.strokeStyle = "rgba(132, 204, 22, 0.3)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // ── Draw nodes ──
      const hovered = hoveredRef.current;
      const selected = selectedRef.current;

      for (const node of nodes) {
        const color = getCategoryColor(node.candidate.category);
        const isHovered = hovered === node;
        const isSelected = selected === node.candidate.memoryId;
        const isIgnitionMember =
          ignitionCluster && ignitionCluster.members.includes(node.candidate.memoryId);

        let drawRadius = node.radius;
        if (isHovered) drawRadius *= 1.3;
        if (isSelected) drawRadius *= 1.2;

        // Background glow for ignition members
        if (isIgnitionMember) {
          const igPulse = 0.2 + Math.sin(t * 0.004 + node.driftOffset) * 0.1;
          const igGlow = ctx.createRadialGradient(
            node.x,
            node.y,
            drawRadius * 0.5,
            node.x,
            node.y,
            drawRadius * 2.5
          );
          igGlow.addColorStop(0, `rgba(132, 204, 22, ${igPulse})`);
          igGlow.addColorStop(1, "rgba(132, 204, 22, 0)");
          ctx.beginPath();
          ctx.arc(node.x, node.y, drawRadius * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = igGlow;
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, drawRadius, 0, Math.PI * 2);

        const alpha = node.tier === "active" ? 0.85 : 0.45;
        ctx.fillStyle = hexToRgba(color, alpha);
        ctx.fill();

        // Selection ring
        if (isSelected) {
          ctx.strokeStyle = hexToRgba(color, 0.9);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Hover ring
        if (isHovered && !isSelected) {
          ctx.strokeStyle = hexToRgba(color, 0.6);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      ctx.restore();
    },
    [ignitionCluster]
  );

  // ── Animation loop ─────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const maxRadius = Math.min(cx, cy) - 24;
      nodesRef.current = buildNodes(cx, cy, maxRadius);
    };

    resize();
    window.addEventListener("resize", resize);

    const animate = (timestamp: number) => {
      timeRef.current = timestamp;
      const rect = container.getBoundingClientRect();
      draw(ctx, rect.width, rect.height, timestamp);
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [buildNodes, draw]);

  // ── Rebuild nodes when data changes ────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const maxRadius = Math.min(cx, cy) - 24;
    nodesRef.current = buildNodes(cx, cy, maxRadius);
  }, [active, candidates, buildNodes]);

  // ── Hit testing ────────────────────────────────────────────────────────

  const findNodeAtPoint = useCallback((clientX: number, clientY: number): PlottedNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Check in reverse order (top-most drawn last)
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      const dx = x - node.x;
      const dy = y - node.y;
      const hitRadius = Math.max(node.radius, 8); // minimum hit target
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return node;
      }
    }
    return null;
  }, []);

  // ── Mouse handlers ─────────────────────────────────────────────────────

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const node = findNodeAtPoint(e.clientX, e.clientY);
      hoveredRef.current = node;

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = node ? "pointer" : "default";
      }

      if (node) {
        const rect = canvasRef.current!.getBoundingClientRect();
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          label: node.candidate.content.slice(0, 80) + (node.candidate.content.length > 80 ? "..." : ""),
          score: node.candidate.totalScore.toFixed(2),
        });
      } else {
        setTooltip(null);
      }
    },
    [findNodeAtPoint]
  );

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = null;
    setTooltip(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const node = findNodeAtPoint(e.clientX, e.clientY);

      if (node) {
        selectedRef.current = node.candidate.memoryId;
        onSelectMemory?.(node.candidate);

        if (node.candidate.clusterId) {
          onSelectCluster?.(node.candidate.clusterId);
        }
      } else {
        selectedRef.current = null;
        // Click empty space → deselect (no callback needed)
      }
    },
    [findNodeAtPoint, onSelectMemory, onSelectCluster]
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", width: "100%", height: "500px" }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ display: "block", width: "100%", height: "100%" }}
      />

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            pointerEvents: "none",
            background: "rgba(0, 0, 0, 0.85)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 6,
            padding: "6px 10px",
            maxWidth: 260,
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "rgba(255, 255, 255, 0.9)",
              lineHeight: "1.4",
              wordBreak: "break-word",
            }}
          >
            {tooltip.label}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "rgba(255, 255, 255, 0.5)",
              marginTop: 2,
            }}
          >
            score: {tooltip.score}
          </div>
        </div>
      )}

      {/* Capacity indicator — top-right */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 12,
          fontSize: 10,
          color: "rgba(255, 255, 255, 0.35)",
          letterSpacing: "0.04em",
        }}
      >
        {active.length}/{capacity}
      </div>
    </div>
  );
}
