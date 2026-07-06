"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Search, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Input } from "@/components/ui/input";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  label: string;
  category: string;
  fullContent: string;
  confidence: number;
  isCluster: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
  strength: number;
}

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  highlighted: boolean;
  searchMatch: boolean;
}

// ─── Category colors ─────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  identity:         { fill: "rgba(59, 130, 246, 0.8)",   stroke: "rgba(59, 130, 246, 1)",   text: "#93c5fd" },
  education_career: { fill: "rgba(147, 51, 234, 0.8)",   stroke: "rgba(147, 51, 234, 1)",   text: "#c4b5fd" },
  projects:         { fill: "rgba(16, 185, 129, 0.8)",   stroke: "rgba(16, 185, 129, 1)",   text: "#6ee7b7" },
  research:         { fill: "rgba(234, 179, 8, 0.8)",    stroke: "rgba(234, 179, 8, 1)",    text: "#fde047" },
  preferences:      { fill: "rgba(249, 115, 22, 0.8)",   stroke: "rgba(249, 115, 22, 1)",   text: "#fdba74" },
  goals:            { fill: "rgba(236, 72, 153, 0.8)",   stroke: "rgba(236, 72, 153, 1)",   text: "#f9a8d4" },
  relationships:    { fill: "rgba(99, 102, 241, 0.8)",   stroke: "rgba(99, 102, 241, 1)",   text: "#a5b4fc" },
  writing_voice:    { fill: "rgba(6, 182, 212, 0.8)",    stroke: "rgba(6, 182, 212, 1)",    text: "#67e8f9" },
  workflows:        { fill: "rgba(20, 184, 166, 0.8)",   stroke: "rgba(20, 184, 166, 1)",   text: "#5eead4" },
  temporary:        { fill: "rgba(115, 115, 115, 0.8)",  stroke: "rgba(115, 115, 115, 1)",  text: "#a3a3a3" },
};

const DEFAULT_COLOR = { fill: "rgba(115, 115, 115, 0.8)", stroke: "rgba(115, 115, 115, 1)", text: "#a3a3a3" };
const LIME_ACCENT = "#a3e635";
const BG_COLOR = "#0a0a0a";
const EDGE_COLOR = "rgba(255, 255, 255, 0.06)";
const EDGE_HIGHLIGHT_COLOR = "rgba(163, 230, 53, 0.5)";

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] || DEFAULT_COLOR;
}

// ─── Relationship label colors ───────────────────────────────────────────────

const REL_COLORS: Record<string, string> = {
  related_to:  "rgba(255, 255, 255, 0.4)",
  part_of:     "rgba(163, 230, 53, 0.3)",
  supports:    "rgba(16, 185, 129, 0.4)",
  contradicts: "rgba(239, 68, 68, 0.4)",
  temporal:    "rgba(234, 179, 8, 0.4)",
  refines:     "rgba(147, 51, 234, 0.4)",
};

// ─── Force simulation ────────────────────────────────────────────────────────

const REPULSION = 800;
const ATTRACTION = 0.008;
const GRAVITY = 0.01;
const DAMPING = 0.92;
const MIN_VELOCITY = 0.01;

function runSimulationStep(
  nodes: SimNode[],
  edges: GraphEdge[],
  centerX: number,
  centerY: number
): boolean {
  let moving = false;

  // Build adjacency for quick lookup
  const edgeMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
    if (!edgeMap.has(e.target)) edgeMap.set(e.target, []);
    edgeMap.get(e.source)!.push(e.target);
    edgeMap.get(e.target)!.push(e.source);
  }

  // Repulsion (Coulomb)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = REPULSION / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  // Attraction (Hooke) along edges
  const nodeMap = new Map<string, SimNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = dist * ATTRACTION * edge.strength;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Gravity toward center
  for (const node of nodes) {
    const dx = centerX - node.x;
    const dy = centerY - node.y;
    node.vx += dx * GRAVITY;
    node.vy += dy * GRAVITY;
  }

  // Apply velocities with damping
  for (const node of nodes) {
    node.vx *= DAMPING;
    node.vy *= DAMPING;
    node.x += node.vx;
    node.y += node.vy;

    if (Math.abs(node.vx) > MIN_VELOCITY || Math.abs(node.vy) > MIN_VELOCITY) {
      moving = true;
    }
  }

  return moving;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GraphPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animFrameRef = useRef<number>(0);
  const animateRef = useRef<() => void>(() => {});
  const isSimulatingRef = useRef(true);

  // View state
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const dragNodeRef = useRef<SimNode | null>(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [selectedConnectionCount, setSelectedConnectionCount] = useState(0);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [stats, setStats] = useState({ nodes: 0, edges: 0, categories: 0 });

  // ─── Search effect ──────────────────────────────────────────────────────

  useEffect(() => {
    const query = search.toLowerCase().trim();
    for (const node of nodesRef.current) {
      node.searchMatch = query.length > 0 && (
        node.fullContent.toLowerCase().includes(query) ||
        node.category.toLowerCase().includes(query) ||
        node.label.toLowerCase().includes(query)
      );
    }
  }, [search]);

  // ─── Screen to world coords ─────────────────────────────────────────────

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const z = zoomRef.current;
    const p = panRef.current;
    return {
      x: (sx - p.x) / z,
      y: (sy - p.y) / z,
    };
  }, []);

  const worldToScreen = useCallback((wx: number, wy: number) => {
    const z = zoomRef.current;
    const p = panRef.current;
    return {
      x: wx * z + p.x,
      y: wy * z + p.y,
    };
  }, []);

  // ─── Find node at position ──────────────────────────────────────────────

  const findNodeAt = useCallback((sx: number, sy: number): SimNode | null => {
    const world = screenToWorld(sx, sy);
    const z = zoomRef.current;
    // Check in reverse so top-rendered (last) nodes are hit first
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i];
      const dx = world.x - node.x;
      const dy = world.y - node.y;
      const hitRadius = node.radius / z + 4 / z;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return node;
      }
    }
    return null;
  }, [screenToWorld]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Subtle grid
    ctx.save();
    ctx.translate(panRef.current.x, panRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);

    const gridSize = 80;
    const visibleLeft = -panRef.current.x / zoomRef.current;
    const visibleTop = -panRef.current.y / zoomRef.current;
    const visibleRight = (w - panRef.current.x) / zoomRef.current;
    const visibleBottom = (h - panRef.current.y) / zoomRef.current;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.025)";
    ctx.lineWidth = 0.5 / zoomRef.current;

    const startX = Math.floor(visibleLeft / gridSize) * gridSize;
    const startY = Math.floor(visibleTop / gridSize) * gridSize;

    for (let x = startX; x <= visibleRight; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, visibleTop);
      ctx.lineTo(x, visibleBottom);
      ctx.stroke();
    }
    for (let y = startY; y <= visibleBottom; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(visibleLeft, y);
      ctx.lineTo(visibleRight, y);
      ctx.stroke();
    }

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    const nodeMap = new Map<string, SimNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const hasSearch = search.trim().length > 0;
    const hasSelection = selectedNode !== null;

    // Build set of highlighted node IDs (selected + connected)
    const highlightedIds = new Set<string>();
    const highlightedEdges = new Set<number>();
    if (selectedNode) {
      highlightedIds.add(selectedNode.id);
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (e.source === selectedNode.id || e.target === selectedNode.id) {
          highlightedIds.add(e.source);
          highlightedIds.add(e.target);
          highlightedEdges.add(i);
        }
      }
    }

    // Draw edges
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      const isHighlighted = highlightedEdges.has(i);
      const dimmed = hasSelection && !isHighlighted;

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      if (isHighlighted) {
        ctx.strokeStyle = EDGE_HIGHLIGHT_COLOR;
        ctx.lineWidth = 1.5 / zoomRef.current;
      } else if (dimmed) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.015)";
        ctx.lineWidth = 0.5 / zoomRef.current;
      } else {
        const relColor = REL_COLORS[edge.relationship] || EDGE_COLOR;
        ctx.strokeStyle = relColor;
        ctx.lineWidth = Math.max(0.5, edge.strength * 1.5) / zoomRef.current;
      }

      ctx.stroke();
    }

    // Draw nodes
    // Sort: clusters first (drawn behind), then regular nodes
    const sortedNodes = [...nodes].sort((a, b) => {
      if (a.isCluster && !b.isCluster) return -1;
      if (!a.isCluster && b.isCluster) return 1;
      return 0;
    });

    for (const node of sortedNodes) {
      const color = getCategoryColor(node.category);
      const isSelected = selectedNode?.id === node.id;
      const isConnected = highlightedIds.has(node.id);
      const isSearchMatch = node.searchMatch;
      const dimmed = (hasSelection && !isConnected) || (hasSearch && !isSearchMatch);

      const nodeRadius = node.radius;
      const alpha = dimmed ? 0.12 : 1;

      // Glow for search matches
      if (isSearchMatch && !dimmed) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius + 8 / zoomRef.current, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(
          node.x, node.y, nodeRadius,
          node.x, node.y, nodeRadius + 8 / zoomRef.current
        );
        gradient.addColorStop(0, LIME_ACCENT + "44");
        gradient.addColorStop(1, LIME_ACCENT + "00");
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Glow for selected node
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeRadius + 12 / zoomRef.current, 0, Math.PI * 2);
        const gradient = ctx.createRadialGradient(
          node.x, node.y, nodeRadius,
          node.x, node.y, nodeRadius + 12 / zoomRef.current
        );
        gradient.addColorStop(0, LIME_ACCENT + "66");
        gradient.addColorStop(1, LIME_ACCENT + "00");
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius, 0, Math.PI * 2);

      if (node.isCluster) {
        // Cluster nodes: larger, semi-transparent fill
        ctx.fillStyle = color.fill.replace("0.8", `${0.2 * alpha}`);
        ctx.fill();
        ctx.strokeStyle = color.stroke.replace("1)", `${0.4 * alpha})`);
        ctx.lineWidth = 1.5 / zoomRef.current;
        ctx.setLineDash([4 / zoomRef.current, 4 / zoomRef.current]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = color.fill.replace("0.8", `${0.8 * alpha}`);
        ctx.fill();

        if (isSelected || isConnected) {
          ctx.strokeStyle = LIME_ACCENT;
          ctx.lineWidth = 2 / zoomRef.current;
          ctx.stroke();
        }
      }

      // Labels for cluster nodes and hovered/selected nodes
      const showLabel = node.isCluster || isSelected || (hoveredNode?.id === node.id);
      if (showLabel) {
        const fontSize = node.isCluster
          ? Math.max(11, 13 / zoomRef.current)
          : Math.max(9, 11 / zoomRef.current);

        ctx.font = `${node.isCluster ? "600" : "400"} ${fontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (node.isCluster) {
          ctx.fillStyle = color.text.replace(")", `, ${alpha})`).replace("rgb", "rgba");
          // Fallback for hex colors
          if (!ctx.fillStyle.startsWith("rgba")) {
            ctx.fillStyle = `${color.text}`;
            ctx.globalAlpha = alpha;
          }
          ctx.fillText(
            node.label.toUpperCase(),
            node.x,
            node.y
          );
          ctx.globalAlpha = 1;
        } else {
          // Draw label below the node
          const labelY = node.y + nodeRadius + 14 / zoomRef.current;

          // Background pill for label
          const metrics = ctx.measureText(node.label);
          const padX = 6 / zoomRef.current;
          const padY = 3 / zoomRef.current;
          const lw = metrics.width + padX * 2;
          const lh = fontSize + padY * 2;

          ctx.fillStyle = "rgba(10, 10, 10, 0.85)";
          ctx.beginPath();
          const r = 4 / zoomRef.current;
          ctx.roundRect(node.x - lw / 2, labelY - lh / 2, lw, lh, r);
          ctx.fill();

          ctx.fillStyle = "rgba(229, 229, 229, 0.9)";
          ctx.fillText(node.label, node.x, labelY);
        }
      }
    }

    ctx.restore();
  }, [search, selectedNode, hoveredNode]);

  // ─── Animation loop ─────────────────────────────────────────────────────

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isSimulatingRef.current && !dragNodeRef.current) {
      const centerX = canvas.width / (2 * (window.devicePixelRatio || 1)) / zoomRef.current - panRef.current.x / zoomRef.current;
      const centerY = canvas.height / (2 * (window.devicePixelRatio || 1)) / zoomRef.current - panRef.current.y / zoomRef.current;

      const moving = runSimulationStep(nodesRef.current, edgesRef.current, centerX, centerY);
      if (!moving) {
        isSimulatingRef.current = false;
      }
    }

    render();
    animFrameRef.current = requestAnimationFrame(() => animateRef.current());
  }, [render]);

  useEffect(() => {
    animateRef.current = animate;
  }, [animate]);

  // ─── Resize handler ────────────────────────────────────────────────────

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, []);

  // ─── Fetch data ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchGraph() {
      try {
        const res = await fetch("/api/memories/graph");
        if (!res.ok) throw new Error(`Failed to fetch graph: ${res.statusText}`);
        const data = await res.json();

        const canvas = canvasRef.current;
        const w = canvas ? canvas.width / (window.devicePixelRatio || 1) : 800;
        const h = canvas ? canvas.height / (window.devicePixelRatio || 1) : 600;

        // Initialize node positions in a circle layout by category
        const categoryAngles = new Map<string, number>();
        const categories: string[] = [...new Set<string>(data.nodes.map((n: GraphNode) => n.category))];
        categories.forEach((cat, i) => {
          categoryAngles.set(cat, (i / categories.length) * Math.PI * 2);
        });

        const simNodes: SimNode[] = data.nodes.map((n: GraphNode) => {
          const angle = categoryAngles.get(n.category) || 0;
          const spreadRadius = n.isCluster ? 120 : 180 + Math.random() * 100;
          return {
            ...n,
            x: w / 2 + Math.cos(angle) * spreadRadius + (Math.random() - 0.5) * 60,
            y: h / 2 + Math.sin(angle) * spreadRadius + (Math.random() - 0.5) * 60,
            vx: 0,
            vy: 0,
            radius: n.isCluster ? 24 : 4 + n.confidence * 4,
            highlighted: false,
            searchMatch: false,
          };
        });

        // Center pan
        panRef.current = { x: 0, y: 0 };
        zoomRef.current = 1;

        nodesRef.current = simNodes;
        edgesRef.current = data.edges;
        isSimulatingRef.current = true;

        setStats({
          nodes: data.nodes.filter((n: GraphNode) => !n.isCluster).length,
          edges: data.edges.length,
          categories: categories.length,
        });

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      }
    }

    resize();
    fetchGraph();

    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ─── Start animation loop after loading ─────────────────────────────────

  useEffect(() => {
    if (!loading && !error) {
      animFrameRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animFrameRef.current);
    }
  }, [loading, error, animate]);

  // ─── Mouse handlers ─────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const node = findNodeAt(sx, sy);
    if (node && !node.isCluster) {
      dragNodeRef.current = node;
      isSimulatingRef.current = true;
    } else {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y };
    }

    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, [findNodeAt]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragNodeRef.current) {
      const world = screenToWorld(sx, sy);
      dragNodeRef.current.x = world.x;
      dragNodeRef.current.y = world.y;
      dragNodeRef.current.vx = 0;
      dragNodeRef.current.vy = 0;
      return;
    }

    if (isDraggingRef.current) {
      panRef.current = {
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      };
      return;
    }

    // Hover detection
    const node = findNodeAt(sx, sy);
    if (node && !node.isCluster) {
      const screenPos = worldToScreen(node.x, node.y);
      setTooltipPos({ x: screenPos.x + 16, y: screenPos.y - 8 });
      setHoveredNode(node);
      if (canvasRef.current) canvasRef.current.style.cursor = "pointer";
    } else {
      setHoveredNode(null);
      if (canvasRef.current) canvasRef.current.style.cursor = isDraggingRef.current ? "grabbing" : "default";
    }
  }, [findNodeAt, screenToWorld, worldToScreen]);

  const handleMouseUp = useCallback(() => {
    if (dragNodeRef.current) {
      dragNodeRef.current = null;
      isSimulatingRef.current = true;
    }
    isDraggingRef.current = false;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Only count as click if mouse didn't move much
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    if (dx * dx + dy * dy > 16) return;

    const node = findNodeAt(sx, sy);
    if (node && !node.isCluster) {
      const next = selectedNode?.id === node.id ? null : node;
      setSelectedNode(next);
      setSelectedConnectionCount(
        next
          ? edgesRef.current.filter((e) => e.source === next.id || e.target === next.id).length
          : 0
      );
    } else {
      setSelectedNode(null);
      setSelectedConnectionCount(0);
    }
  }, [findNodeAt, selectedNode]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
    const newZoom = Math.min(4, Math.max(0.15, zoomRef.current * zoomFactor));

    // Zoom toward cursor
    const worldBefore = screenToWorld(sx, sy);
    zoomRef.current = newZoom;
    const worldAfter = screenToWorld(sx, sy);

    panRef.current.x += (worldAfter.x - worldBefore.x) * newZoom;
    panRef.current.y += (worldAfter.y - worldBefore.y) * newZoom;
  }, [screenToWorld]);

  // ─── Zoom controls ─────────────────────────────────────────────────────

  const zoomIn = useCallback(() => {
    zoomRef.current = Math.min(4, zoomRef.current * 1.3);
  }, []);

  const zoomOut = useCallback(() => {
    zoomRef.current = Math.max(0.15, zoomRef.current * 0.7);
  }, []);

  const resetView = useCallback(() => {
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    isSimulatingRef.current = true;

    // Recenter nodes
    const canvas = canvasRef.current;
    if (canvas) {
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);
      nodesRef.current = nodesRef.current.map((node) => ({
        ...node,
        vx: (w / 2 - node.x) * 0.01,
        vy: (h / 2 - node.y) * 0.01,
      }));
    }
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] bg-[#0a0a0a]">
        <div className="maze-card p-8 max-w-md text-center">
          <h2 className="text-lg font-semibold text-red-400 mb-2">Error Loading Graph</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100vh-64px)] overflow-hidden bg-[#0a0a0a]" ref={containerRef}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a] z-20">
          <div className="relative mb-6">
            <div className="h-12 w-12 rounded-full border-2 border-neutral-800 border-t-lime animate-spin" />
          </div>
          <p
            className="text-[13px] text-neutral-400 tracking-wide"
            style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
          >
            Loading knowledge graph...
          </p>
          <p
            className="text-[11px] text-neutral-600 mt-1.5"
            style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
          >
            Mapping approved memories locally
          </p>
        </div>
      )}

      {/* Search bar - top left */}
      {!loading && (
        <div className="absolute top-5 left-5 z-10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
            <Input
              placeholder="Search memories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 w-64 bg-neutral-900/90 backdrop-blur-sm border-neutral-800 text-[13px] text-neutral-200 placeholder:text-neutral-600 rounded-lg focus:border-lime/50 focus:ring-lime/20"
              style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
            />
          </div>
        </div>
      )}

      {/* Stats - top right */}
      {!loading && (
        <div
          className="absolute top-5 right-5 z-10 flex items-center gap-4 bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-lg px-4 py-2.5"
          style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
        >
          <div className="text-center">
            <p className="text-[17px] font-semibold text-neutral-100">{stats.nodes}</p>
            <p className="text-[9px] uppercase tracking-widest text-neutral-500">Memories</p>
          </div>
          <div className="w-px h-6 bg-neutral-800" />
          <div className="text-center">
            <p className="text-[17px] font-semibold text-neutral-100">{stats.edges}</p>
            <p className="text-[9px] uppercase tracking-widest text-neutral-500">Relations</p>
          </div>
          <div className="w-px h-6 bg-neutral-800" />
          <div className="text-center">
            <p className="text-[17px] font-semibold text-neutral-100">{stats.categories}</p>
            <p className="text-[9px] uppercase tracking-widest text-neutral-500">Categories</p>
          </div>
        </div>
      )}

      {/* Zoom controls - bottom right */}
      {!loading && (
        <div className="absolute bottom-5 right-5 z-10 flex flex-col gap-1">
          <button
            onClick={zoomIn}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80 transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={zoomOut}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80 transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={resetView}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/80 transition-colors"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Category legend - bottom left */}
      {!loading && (
        <div
          className="absolute bottom-5 left-5 z-10 bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-lg p-3"
          style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
        >
          <p className="text-[9px] uppercase tracking-widest text-neutral-500 mb-2">Categories</p>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1">
            {Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color.stroke }}
                />
                <span className="text-[10px] text-neutral-400 capitalize">
                  {cat.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tooltip */}
      {hoveredNode && !selectedNode && (
        <div
          className="absolute z-30 max-w-xs pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            fontFamily: "var(--font-jakarta), system-ui, sans-serif",
          }}
        >
          <div className="bg-neutral-900/95 backdrop-blur-md border border-neutral-700 rounded-lg p-3 shadow-xl">
            <div className="flex items-center gap-2 mb-1.5">
              <div
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: getCategoryColor(hoveredNode.category).stroke }}
              />
              <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                {hoveredNode.category.replace("_", " ")}
              </span>
            </div>
            <p className="text-[12px] text-neutral-200 leading-relaxed">
              {hoveredNode.fullContent}
            </p>
            <p className="text-[10px] text-neutral-600 mt-1.5">
              Confidence: {(hoveredNode.confidence * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      )}

      {/* Selected node detail panel */}
      {selectedNode && (
        <div
          className="absolute top-5 left-1/2 -translate-x-1/2 z-20 w-full max-w-md"
          style={{ fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
        >
          <div className="bg-neutral-900/95 backdrop-blur-md border border-neutral-700 rounded-xl p-5 shadow-2xl">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: getCategoryColor(selectedNode.category).stroke }}
                />
                <span className="text-[11px] uppercase tracking-wider text-neutral-400">
                  {selectedNode.category.replace("_", " ")}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedNode(null);
                  setSelectedConnectionCount(0);
                }}
                className="text-neutral-500 hover:text-neutral-200 text-[11px] transition-colors"
              >
                ESC
              </button>
            </div>
            <p className="text-[14px] text-neutral-100 leading-relaxed mb-3">
              {selectedNode.fullContent}
            </p>
            <div className="flex items-center gap-4 text-[10px] text-neutral-600">
              <span>Confidence: {(selectedNode.confidence * 100).toFixed(0)}%</span>
              <span>ID: {selectedNode.id.slice(0, 8)}</span>
              <span>{selectedConnectionCount} connections</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
