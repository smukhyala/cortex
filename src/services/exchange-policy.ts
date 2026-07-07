import type { CategoryOption, ExchangeDestination, ExchangePolicy, MemoryForExchange } from "@/contracts/exchange";

const CATEGORY_ALIASES: Record<string, string[]> = {
  education_career: ["school", "college", "class", "classes", "education", "career", "work history"],
  preferences: ["preference", "preferences", "likes", "dislikes", "favorite", "favorites", "style"],
  projects: ["project", "projects", "startup", "startups"],
  relationships: ["relationship", "relationships", "people", "contacts", "friends", "family"],
  writing_voice: ["writing", "voice", "tone"],
  workflows: ["workflow", "workflows", "tools", "setup"],
  goals: ["goal", "goals", "plans"],
  research: ["research", "interests", "topics"],
  identity: ["identity", "profile", "background", "personal"],
  temporary: ["temporary", "current", "short term"],
};

const BLOCK_PATTERNS = [
  /\bdo\s+not\b/,
  /\bdon't\b/,
  /\bblock\b/,
  /\bexclude\b/,
  /\bhide\b/,
  /\bkeep\b.+\bfrom\b/,
  /\bnot\b.+\bgo\b/,
  /\bnever\b/,
];

const ALLOW_ONLY_PATTERNS = [
  /\bonly\b/,
  /\ballow\b/,
  /\binclude\b/,
  /\bshare\b/,
  /\bsend\b/,
  /\bmove\b/,
  /\bcan\s+go\b/,
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[_-]/g, " ");
}

function categoryTerms(category: CategoryOption): string[] {
  return [
    category.slug,
    category.label,
    ...(CATEGORY_ALIASES[category.slug] ?? []),
  ].map(normalizeText);
}

export function parseExchangePolicies(config: string | null | undefined): ExchangePolicy[] {
  try {
    const parsed = JSON.parse(config || "{}") as { exchangePolicies?: unknown };
    return Array.isArray(parsed.exchangePolicies)
      ? parsed.exchangePolicies.filter((policy): policy is ExchangePolicy => {
          return typeof policy === "object" && policy !== null && "destination" in policy;
        })
      : [];
  } catch {
    return [];
  }
}

export function withExchangePolicyConfig(
  config: string | null | undefined,
  policy: ExchangePolicy
): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(config || "{}") as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  const existing = parseExchangePolicies(config);
  const next = [
    ...existing.filter((item) => item.destination !== policy.destination),
    { ...policy, updatedAt: new Date().toISOString() },
  ];

  return JSON.stringify({ ...parsed, exchangePolicies: next });
}

export function getExchangePolicy(
  config: string | null | undefined,
  destination: ExchangeDestination
): ExchangePolicy {
  return (
    parseExchangePolicies(config).find((policy) => policy.destination === destination) ?? {
      destination,
      mode: "all",
      allowedCategories: [],
      blockedCategories: [],
    }
  );
}

export function filterMemoriesForDestination<T extends MemoryForExchange>(
  memories: T[],
  policy: ExchangePolicy
): T[] {
  return memories.filter((memory) => {
    if (memory.sensitive) return false;
    if (policy.mode === "allow_only" && !policy.allowedCategories.includes(memory.category)) {
      return false;
    }
    return !policy.blockedCategories.includes(memory.category);
  });
}

export function deriveExchangePolicyFromText(params: {
  destination: ExchangeDestination;
  instruction: string;
  categories: CategoryOption[];
  previous?: ExchangePolicy;
}): ExchangePolicy {
  const instruction = normalizeText(params.instruction);
  const matchedCategories = params.categories
    .filter((category) => categoryTerms(category).some((term) => instruction.includes(term)))
    .map((category) => category.slug);

  const hasBlockIntent = BLOCK_PATTERNS.some((pattern) => pattern.test(instruction));
  const hasAllowIntent = ALLOW_ONLY_PATTERNS.some((pattern) => pattern.test(instruction));
  const mode: ExchangePolicy["mode"] =
    hasBlockIntent || !hasAllowIntent ? "block" : "allow_only";

  const previous = params.previous ?? {
    destination: params.destination,
    mode: "all" as const,
    allowedCategories: [],
    blockedCategories: [],
  };

  const unique = (items: string[]) => Array.from(new Set(items));

  return {
    destination: params.destination,
    mode,
    allowedCategories:
      mode === "allow_only"
        ? unique([...previous.allowedCategories, ...matchedCategories])
        : previous.allowedCategories,
    blockedCategories:
      mode === "block"
        ? unique([...previous.blockedCategories, ...matchedCategories])
        : previous.blockedCategories,
    naturalLanguageRule: params.instruction,
  };
}
