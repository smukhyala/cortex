export type MemoryFactKey =
  | "identity:name"
  | "education:graduation_year"
  | "education:major"
  | "education:university"
  | `education:organization:${string}`
  | `preferences:favorite:${string}`;

function normalizeKeyValue(value: string): string {
  return value
    .replace(/['"`]/g, "")
    .replace(/\b(?:anymore|now|currently)\b/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getMemoryFactKey(content: string): MemoryFactKey | null {
  const normalized = content.toLowerCase();

  if (/\buser(?:'s)?\s+(?:name\s+is|goes by|is named)\b/.test(normalized)) {
    return "identity:name";
  }

  if (/\b(?:graduat(?:e|es|ing|ed)|class of|graduation)\b/.test(normalized)) {
    return "education:graduation_year";
  }

  if (/\b(?:major|majors in|majoring in|studies|studying)\b/.test(normalized)) {
    return "education:major";
  }

  if (/\b(?:university|college|school|attends|attended|studies at|studied at)\b/.test(normalized)) {
    return "education:university";
  }

  const favoriteMatch = normalized.match(/\b(?:user(?:'s)?\s+)?favorite\s+([a-z][a-z\s-]{1,40}?)\s+is\b/);
  if (favoriteMatch?.[1]) {
    return `preferences:favorite:${normalizeKeyValue(favoriteMatch[1])}`;
  }

  const organizationMatch =
    normalized.match(/\buser\s+works\s+(?:at or with an organization called|at|for|with)\s+([a-z0-9][a-z0-9 '&.-]{1,80})/) ??
    normalized.match(/\buser\s+(?:does\s+not|doesn't|doesnt|no\s+longer)\s+works?\s+(?:at|for|with)\s+([a-z0-9][a-z0-9 '&.-]{1,80})/) ??
    normalized.match(/\buser(?:'s)?\s+(?:company|employer)\s+(?:is|is called|called)\s+([a-z0-9][a-z0-9 '&.-]{1,80})/);
  if (organizationMatch?.[1]) {
    const organization = normalizeKeyValue(organizationMatch[1]);
    if (organization) {
      return `education:organization:${organization}`;
    }
  }

  return null;
}

export function memoryFactKeysMatch(a: string, b: string): boolean {
  const aKey = getMemoryFactKey(a);
  return aKey !== null && aKey === getMemoryFactKey(b);
}
