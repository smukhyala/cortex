import { prisma } from "@/lib/db";
import { seedWorkspaceSlots } from "@/lib/seed-workspace";
import { decayAllSlots, scoreBatch, coldStart } from "@/services/j-lens";

export async function runWorkspaceTick(): Promise<{
  decayed: number;
  evicted: number;
  loaded: number;
}> {
  const decay = await decayAllSlots();
  const batch = await scoreBatch();
  return {
    decayed: decay.decayed,
    evicted: decay.evicted + batch.evicted,
    loaded: batch.loaded,
  };
}

export async function initializeWorkspace(): Promise<{
  slotsSeeded: number;
  memoriesLoaded: number;
}> {
  const slotsSeeded = await seedWorkspaceSlots();

  // Check if any slots are already occupied
  const occupiedSlots = await prisma.workspaceSlot.findMany({
    where: { memoryId: { not: null } },
  });

  let memoriesLoaded = 0;
  if (occupiedSlots.length === 0) {
    memoriesLoaded = await coldStart();
  }

  return { slotsSeeded, memoriesLoaded };
}
