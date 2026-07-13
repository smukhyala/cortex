import { z } from "zod";
import { MemoryCategorySchema } from "@/contracts/memory";

// ─── J-Space Enums ───────────────────────────────────────────────────────────

export const MemoryTierSchema = z.enum(["background", "workspace"]);
export type MemoryTier = z.infer<typeof MemoryTierSchema>;

export const SourceSignalSchema = z.enum(["activity", "explicit", "query", "sync"]);
export type SourceSignal = z.infer<typeof SourceSignalSchema>;

// ─── J-Lens Configuration ────────────────────────────────────────────────────

export const JLensConfigSchema = z.object({
  capacity: z.number().int().min(10).max(30).default(20),
  halfLifeDays: z.number().min(1).max(30).default(7),
  evictionThreshold: z.number().min(0).max(0.5).default(0.15),
  reinforcementBoost: z.number().min(0.05).max(0.5).default(0.2),
  weights: z.object({
    keywordOverlap: z.number().default(0.40),
    categoryMatch: z.number().default(0.25),
    recencyBoost: z.number().default(0.20),
    coOccurrence: z.number().default(0.15),
  }).default({}),
});

export type JLensConfig = z.infer<typeof JLensConfigSchema>;

export const DEFAULT_JLENS_CONFIG: JLensConfig = JLensConfigSchema.parse({});

// ─── Workspace Slot (MCP response shape) ─────────────────────────────────────

export const WorkspaceSlotSchema = z.object({
  position: z.number().int().min(0).max(29),
  memoryId: z.string().nullable().optional(),
  conceptLabel: z.string().nullable().optional(),
  loading: z.number().min(0).max(1),
  pinned: z.boolean(),
  sourceSignal: SourceSignalSchema,
  activatedAt: z.string(),
  memories: z.array(z.string()),
});

export type WorkspaceSlotResponse = z.infer<typeof WorkspaceSlotSchema>;

// ─── Activity Signal ─────────────────────────────────────────────────────────

export const ActivitySignalSchema = z.object({
  type: z.enum(["mcp_query", "conversation_sync", "file_change", "manual"]),
  keywords: z.array(z.string()),
  categories: z.array(z.string()),
  sourceType: z.string().optional(),
});

export type ActivitySignalInput = z.infer<typeof ActivitySignalSchema>;

// ─── Workspace Response (full MCP response) ──────────────────────────────────

export const WorkspaceResponseSchema = z.object({
  slots: z.array(WorkspaceSlotSchema),
  capacity: z.object({
    used: z.number(),
    total: z.number(),
  }),
  lastUpdated: z.string(),
});

export type WorkspaceResponse = z.infer<typeof WorkspaceResponseSchema>;

// ─── Legacy types (kept for existing workspace service) ──────────────────────

// ─── Configuration ──────────────────────────────────────────────────────────

export const WorkspaceConfigSchema = z.object({
  /** Max memories that can occupy the workspace simultaneously */
  capacity: z.number().int().min(5).max(50).default(20),
  /** Minimum cluster size to trigger ignition */
  ignitionThreshold: z.number().int().min(2).max(10).default(3),
  /** Score multiplier applied to the ignited cluster */
  ignitionBoost: z.number().min(1).max(5).default(2.0),
  /** Score multiplier applied to non-ignited memories when ignition fires */
  suppressionFactor: z.number().min(0).max(1).default(0.3),
  /** Weight of coherence score in the total score blend (0-1) */
  coherenceWeight: z.number().min(0).max(1).default(0.4),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  capacity: 20,
  ignitionThreshold: 3,
  ignitionBoost: 2.0,
  suppressionFactor: 0.3,
  coherenceWeight: 0.4,
};

// ─── Focus Modes ────────────────────────────────────────────────────────────

export const FocusModeSchema = z.object({
  id: z.string(),
  label: z.string(),
  boostedCategories: z.array(MemoryCategorySchema),
  suppressedCategories: z.array(MemoryCategorySchema),
});

export type FocusMode = z.infer<typeof FocusModeSchema>;

export const FOCUS_MODES: FocusMode[] = [
  {
    id: "balanced",
    label: "Balanced",
    boostedCategories: [],
    suppressedCategories: [],
  },
  {
    id: "work",
    label: "Work Mode",
    boostedCategories: ["projects", "workflows", "goals"],
    suppressedCategories: ["relationships", "writing_voice"],
  },
  {
    id: "personal",
    label: "Personal Mode",
    boostedCategories: ["relationships", "preferences", "identity"],
    suppressedCategories: ["workflows", "research"],
  },
  {
    id: "research",
    label: "Research Mode",
    boostedCategories: ["research", "education_career", "projects"],
    suppressedCategories: ["relationships", "temporary"],
  },
];

// ─── Workspace Candidate ────────────────────────────────────────────────────

export const WorkspaceCandidateSchema = z.object({
  memoryId: z.string(),
  content: z.string(),
  category: MemoryCategorySchema,
  relevanceScore: z.number(),
  strengthScore: z.number(),
  coherenceScore: z.number(),
  totalScore: z.number(),
  clusterId: z.string().nullable(),
  pinned: z.boolean(),
});

export type WorkspaceCandidate = z.infer<typeof WorkspaceCandidateSchema>;

// ─── Ignition Cluster ───────────────────────────────────────────────────────

export const IgnitionClusterSchema = z.object({
  id: z.string(),
  label: z.string(),
  members: z.array(z.string()),
  totalScore: z.number(),
});

export type IgnitionCluster = z.infer<typeof IgnitionClusterSchema>;

// ─── Workspace State ────────────────────────────────────────────────────────

export const WorkspaceStateSchema = z.object({
  active: z.array(WorkspaceCandidateSchema),
  suppressed: z.array(WorkspaceCandidateSchema),
  ignitionCluster: IgnitionClusterSchema.nullable(),
  capacity: z.number(),
  totalCandidates: z.number(),
  varianceExplained: z.number(),
  steeringApplied: z.array(z.string()),
  computedAt: z.string(),
});

export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;

// ─── J-Space: Memory Tiers & Source Signals ────────────────────────────────

export const MemoryTier = z.enum(["background", "workspace"]);
export type MemoryTier = z.infer<typeof MemoryTier>;

export const SourceSignal = z.enum(["automatic", "explicit", "reinforced"]);
export type SourceSignal = z.infer<typeof SourceSignal>;

// ─── J-Space: Activity Signal Input ────────────────────────────────────────

export const ActivitySignalInput = z.object({
  type: z.enum(["query", "conversation", "navigation", "tool_use"]),
  keywords: z.array(z.string()),
  categories: z.array(z.string()),
  sourceType: z.enum(["mcp", "api", "watcher"]).default("mcp"),
});

export type ActivitySignalInput = z.infer<typeof ActivitySignalInput>;

// ─── J-Space: Workspace Slot Response ──────────────────────────────────────

export const WorkspaceSlotResponse = z.object({
  position: z.number(),
  memoryId: z.string(),
  conceptLabel: z.string().nullable(),
  content: z.string(),
  category: z.string(),
  loading: z.number(),
  pinned: z.boolean(),
  sourceSignal: SourceSignal,
  activatedAt: z.string(),
  loadedAt: z.string(),
});

export type WorkspaceSlotResponse = z.infer<typeof WorkspaceSlotResponse>;

// ─── J-Space: Full Workspace Response ──────────────────────────────────────

export const WorkspaceResponse = z.object({
  slots: z.array(WorkspaceSlotResponse),
  capacity: z.number(),
  occupied: z.number(),
  lastUpdated: z.string(),
});

export type WorkspaceResponse = z.infer<typeof WorkspaceResponse>;

// ─── J-Lens: Scoring Configuration ────────────────────────────────────────

export const JLensConfigSchema = z.object({
  /** Weight for keyword match signal */
  keywordWeight: z.number().min(0).max(1).default(0.4),
  /** Weight for category match signal */
  categoryWeight: z.number().min(0).max(1).default(0.3),
  /** Weight for recency signal */
  recencyWeight: z.number().min(0).max(1).default(0.2),
  /** Weight for confidence signal */
  confidenceWeight: z.number().min(0).max(1).default(0.1),
  /** Loading threshold below which a slot is considered weak/evictable */
  evictionThreshold: z.number().min(0).max(1).default(0.15),
  /** Default decay rate for new slots */
  defaultDecayRate: z.number().min(0).max(1).default(0.05),
});

export type JLensConfig = z.infer<typeof JLensConfigSchema>;

export const DEFAULT_JLENS_CONFIG: JLensConfig = {
  keywordWeight: 0.4,
  categoryWeight: 0.3,
  recencyWeight: 0.2,
  confidenceWeight: 0.1,
  evictionThreshold: 0.15,
  defaultDecayRate: 0.05,
};
