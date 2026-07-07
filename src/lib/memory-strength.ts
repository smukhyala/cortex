const MAX_REF = 20;
const HALF_LIFE_DAYS = 90;

export function computeMemoryStrength(
  refCount: number,
  lastReferencedAt: Date
): number {
  const frequencyScore = Math.log(refCount + 1) / Math.log(MAX_REF + 1);
  const daysSince =
    (Date.now() - lastReferencedAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.exp(-daysSince / HALF_LIFE_DAYS);
  return Math.max(0, Math.min(1, 0.6 * frequencyScore + 0.4 * recencyScore));
}
