const MAX_REF = 20;
const HALF_LIFE_DAYS = 60;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const OBJECTIVE_PROFILE_FLOOR = 0.55;
const MANUAL_STRONG_FLOOR = 0.9;

interface MemoryStrengthOptions {
  content?: string;
  category?: string;
  isTechnical?: boolean;
  manuallyStrong?: boolean;
}

const OBJECTIVE_PROFILE_PATTERNS = [
  /\buser(?:'s)?\s+name\s+is\b/i,
  /\buser\s+(?:goes by|is named|lives in|is based in|was born in|is from)\b/i,
  /\buser\s+(?:studies|studied|majors?|is majoring|graduated|attends|attended)\b/i,
  /\buser(?:'s)?\s+(?:major|minor|degree|university|college|school|alma mater)\b/i,
  /\buser\s+(?:works at|works for|is employed by|founded|co-founded)\b/i,
  /\buser(?:'s)?\s+(?:employer|company|job title|role|position)\b/i,
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function isObjectiveProfileMemory(
  content: string,
  category?: string
): boolean {
  const objectiveCategory =
    category === "identity" ||
    category === "education_career" ||
    category === "relationships";
  if (!objectiveCategory) return false;
  return OBJECTIVE_PROFILE_PATTERNS.some((pattern) => pattern.test(content));
}

export function computeMemoryStrength(
  refCount: number,
  lastReferencedAt: Date,
  now = new Date(),
  options: MemoryStrengthOptions = {}
): number {
  const safeRefCount = Math.max(0, refCount);
  const frequencyScore = clamp01(
    Math.log(safeRefCount + 1) / Math.log(MAX_REF + 1)
  );
  const lastReferencedTime = lastReferencedAt.getTime();
  const nowTime = now.getTime();
  const daysSince = Number.isFinite(lastReferencedTime) && Number.isFinite(nowTime)
    ? Math.max(0, (nowTime - lastReferencedTime) / MS_PER_DAY)
    : Number.POSITIVE_INFINITY;
  const recencyScore = Math.exp(-daysSince / HALF_LIFE_DAYS);

  // Blend frequency and recency — recency weight increases when references are low.
  // At 1 ref, recency is 70% of the score. At 10+ refs, recency drops to 30%.
  const refRatio = clamp01(safeRefCount / 10);
  const recencyWeight = 0.7 - 0.4 * refRatio; // 0.7 at 0 refs → 0.3 at 10+ refs
  const evidenceScore = recencyWeight * recencyScore + (1 - recencyWeight) * frequencyScore;

  if (options.manuallyStrong) {
    return clamp01(Math.max(evidenceScore, MANUAL_STRONG_FLOOR));
  }

  if (
    !options.isTechnical &&
    options.content &&
    isObjectiveProfileMemory(options.content, options.category)
  ) {
    return clamp01(Math.max(evidenceScore, OBJECTIVE_PROFILE_FLOOR));
  }

  return clamp01(evidenceScore);
}
