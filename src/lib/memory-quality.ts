const TECHNICAL_DETAIL_PATTERNS = [
  /\b[A-Z_]{3,}\b/,
  /\b[a-z0-9_-]+\.(?:json|ts|tsx|js|jsx|py|md|yml|yaml|toml|env|sqlite|db|log|png|jpg|jpeg)\b/i,
  /\b(?:src|app|lib|components|pages|api|prisma|node_modules|logs|screenshots|fixtures|tests|__tests__)\/[^\s]+/i,
  /`[^`]*(?:\/|\.json|\.ts|\.tsx|\.js|\.py|make\s|npm\s|pnpm\s|yarn\s|npx\s|claude-|gpt-|api key)[^`]*`/i,
  /\b(?:npm|pnpm|yarn|npx|make|tsx|vitest|eslint|prisma|next build|next dev|docker|pytest|curl)\s+[a-z0-9:_./-]+/i,
  /\b(?:route|endpoint|adapter|schema|migration|contentHash|sourceId|task_id|arm_id|llm_model|webhook|payload|artifact|result\.json|history\.json)\b/i,
  /\b(?:Claude|OpenAI|Anthropic|Poke|WebArena|Next\.js|React|Prisma|SQLite|TypeScript|JavaScript)\b.*\b(?:adapter|api|route|schema|model|command|configurable|default|stores|uses|runs)\b/i,
];

const PERSONAL_SIGNAL_PATTERNS = [
  /\buser(?:'s)?\s+(?:name|prefers|likes|dislikes|lives|works|studied|wants|goal|favorite|birthday|partner|friend|family|dog|cat|chosen|major|university|company)\b/i,
  /\buser\s+(?:is\s+interested\s+in|has\s+built|is\s+working\s+on|works\s+on|studies|researches|chose|plans\s+to)\b/i,
  /\b(?:prefers|likes|dislikes|favorite|goal|wants|interested in|has built|working on|project called)\b/i,
  /\b(?:writing style|communication style|personal preference|career goal|relationship|hobby|research interest|technical interest|elective|concentration|course)\b/i,
];

const HARD_TECHNICAL_PATTERNS = [
  /\b[a-z0-9_-]+\.(?:json|ts|tsx|js|jsx|py|md|yml|yaml|toml|env|sqlite|db|log|png|jpg|jpeg)\b/i,
  /\b(?:src|app|lib|components|pages|api|prisma|node_modules|logs|screenshots|fixtures|tests|__tests__|packages)\/[^\s]+/i,
  /`[^`]*(?:\/|\.json|\.ts|\.tsx|\.js|\.py|make\s|npm\s|pnpm\s|yarn\s|npx\s|claude-|gpt-|api key)[^`]*`/i,
  /\b(?:contentHash|sourceId|task_id|arm_id|llm_model|result\.json|history\.json)\b/i,
];

export function isLikelyTechnicalMemory(content: string): boolean {
  const normalized = content.trim();
  if (!normalized) return false;

  const technicalHits = TECHNICAL_DETAIL_PATTERNS.filter((pattern) =>
    pattern.test(normalized)
  ).length;
  if (technicalHits === 0) return false;

  const hardTechnicalHits = HARD_TECHNICAL_PATTERNS.filter((pattern) =>
    pattern.test(normalized)
  ).length;

  const hasPersonalSignal = PERSONAL_SIGNAL_PATTERNS.some((pattern) =>
    pattern.test(normalized)
  );

  if (hardTechnicalHits >= 2) return true;
  if (hasPersonalSignal && hardTechnicalHits === 0) return false;

  return technicalHits >= 2 || !hasPersonalSignal;
}
