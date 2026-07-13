"use client";

import { useState, useEffect, useCallback } from "react";
import type { WorkspaceResponse, WorkspaceSlotResponse } from "@/contracts/workspace";
import type { WorkspaceState } from "@/contracts/workspace";

/** Transform the internal WorkspaceState into the slot-based WorkspaceResponse shape */
function toSlotResponse(state: WorkspaceState): WorkspaceResponse {
  const slots: WorkspaceSlotResponse[] = [];
  const now = new Date().toISOString();

  const ignitionMembers = state.ignitionCluster
    ? new Set(state.ignitionCluster.members)
    : new Set<string>();

  // Occupied slots from active memories
  for (let i = 0; i < state.active.length; i++) {
    const mem = state.active[i];
    const isIgnited = ignitionMembers.has(mem.memoryId);
    slots.push({
      position: i,
      memoryId: mem.memoryId,
      conceptLabel: mem.content.length > 60 ? mem.content.slice(0, 57) + "..." : mem.content,
      loading: Math.min(1, Math.max(0, mem.totalScore / 10)),
      pinned: mem.pinned,
      sourceSignal: isIgnited ? "ignition" : mem.pinned ? "manual" : "activity",
      activatedAt: state.computedAt,
      memories: [mem.content],
    });
  }

  // Empty slots to fill capacity
  for (let i = state.active.length; i < state.capacity; i++) {
    slots.push({
      position: i,
      memoryId: null,
      conceptLabel: null,
      loading: 0,
      pinned: false,
      sourceSignal: "activity",
      activatedAt: null,
      memories: [],
    });
  }

  return {
    slots,
    capacity: {
      used: state.active.length,
      total: state.capacity,
    },
    lastUpdated: state.computedAt,
  };
}

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace");
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const state: WorkspaceState = await res.json();
      setWorkspace(toSlotResponse(state));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWorkspace(); }, [fetchWorkspace]);

  const holdInMind = async (concept: string) => {
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hold", concept }),
    });
    await fetchWorkspace();
  };

  const suppressConcept = async (concept: string, durationHours?: number) => {
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suppress", concept, durationHours }),
    });
    await fetchWorkspace();
  };

  const releaseConcept = async (concept: string) => {
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "release", concept }),
    });
    await fetchWorkspace();
  };

  return { workspace, loading, error, refresh: fetchWorkspace, holdInMind, suppressConcept, releaseConcept };
}
