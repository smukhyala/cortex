import { prisma } from "@/lib/db";

export async function seedWorkspaceSlots(): Promise<number> {
  const existing = await prisma.workspaceSlot.count();
  if (existing >= 20) return 0;

  const existingPositions = await prisma.workspaceSlot.findMany({
    select: { position: true },
  });
  const taken = new Set(existingPositions.map((s) => s.position));

  let created = 0;
  for (let i = 0; i < 20; i++) {
    if (taken.has(i)) continue;
    await prisma.workspaceSlot.create({
      data: { position: i },
    });
    created++;
  }
  return created;
}
