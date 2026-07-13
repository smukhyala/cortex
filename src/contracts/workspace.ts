import { z } from "zod";
import { MemoryCategorySchema } from "@/contracts/memory";

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

// ─── Workspace Slot Response (J-Space dashboard API shape) ─────────────────

export const WorkspaceSlotResponseSchema = z.object({
  position: z.number().int(),
  memoryId: z.string().nullable(),
  conceptLabel: z.string().nullable(),
  loading: z.number().min(0).max(1),
  pinned: z.boolean(),
  sourceSignal: z.enum(["activity", "query", "ignition", "manual"]),
  activatedAt: z.string().nullable(),
  memories: z.array(z.string()),
});

export type WorkspaceSlotResponse = z.infer<typeof WorkspaceSlotResponseSchema>;

export const WorkspaceResponseSchema = z.object({
  slots: z.array(WorkspaceSlotResponseSchema),
  capacity: z.object({
    used: z.number().int(),
    total: z.number().int(),
  }),
  lastUpdated: z.string(),
});

export type WorkspaceResponse = z.infer<typeof WorkspaceResponseSchema>;
