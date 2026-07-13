import { computeWorkspace } from "@/services/workspace";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WorkspaceSlotResponse {
  position: number;
  memoryId?: string;
  conceptLabel?: string;
  loading: boolean;
  pinned: boolean;
  sourceSignal: string;
  activatedAt: string;
  memories: string[];
}

export interface WorkspaceCapacity {
  used: number;
  total: number;
}

export interface WorkspaceResponse {
  slots: WorkspaceSlotResponse[];
  capacity: WorkspaceCapacity;
  lastUpdated: string;
}

// ─── Main ───────────────────────────────────────────────────────────────────

export async function getWorkspaceResponse(): Promise<WorkspaceResponse> {
  const state = await computeWorkspace();
  const now = new Date().toISOString();

  const slots: WorkspaceSlotResponse[] = state.active.map((candidate, index) => ({
    position: index,
    memoryId: candidate.memoryId,
    conceptLabel: candidate.category,
    loading: false,
    pinned: candidate.pinned,
    sourceSignal: candidate.clusterId ?? "standalone",
    activatedAt: now,
    memories: [candidate.content],
  }));

  return {
    slots,
    capacity: {
      used: slots.length,
      total: state.capacity,
    },
    lastUpdated: now,
  };
}
