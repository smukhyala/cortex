import { describe, expect, it } from "vitest";
import {
  deriveExchangePolicyFromText,
  filterMemoriesForDestination,
  getExchangePolicy,
  withExchangePolicyConfig,
} from "@/services/exchange-policy";

const categories = [
  { slug: "education_career", label: "Education & Career" },
  { slug: "preferences", label: "Preferences & Style" },
  { slug: "design", label: "Design" },
];

describe("exchange policy orchestration", () => {
  it("derives blocked categories from natural language aliases", () => {
    const policy = deriveExchangePolicyFromText({
      destination: "poke",
      instruction: "Do not allow school or design memories to go to Poke",
      categories,
    });

    expect(policy.mode).toBe("block");
    expect(policy.blockedCategories).toEqual(
      expect.arrayContaining(["education_career", "design"])
    );
  });

  it("derives allow-only policies from natural language", () => {
    const policy = deriveExchangePolicyFromText({
      destination: "claude_code",
      instruction: "Only share preferences with Claude",
      categories,
    });

    expect(policy.mode).toBe("allow_only");
    expect(policy.allowedCategories).toEqual(["preferences"]);
  });

  it("filters memories according to allow and block policy", () => {
    const memories = [
      { content: "school", category: "education_career", sensitive: false },
      { content: "style", category: "preferences", sensitive: false },
      { content: "secret", category: "design", sensitive: true },
    ];

    expect(
      filterMemoriesForDestination(memories, {
        destination: "poke",
        mode: "block",
        allowedCategories: [],
        blockedCategories: ["education_career"],
      }).map((m) => m.content)
    ).toEqual(["style"]);

    expect(
      filterMemoriesForDestination(memories, {
        destination: "poke",
        mode: "allow_only",
        allowedCategories: ["education_career"],
        blockedCategories: [],
      }).map((m) => m.content)
    ).toEqual(["school"]);
  });

  it("round-trips policies through source config", () => {
    const config = withExchangePolicyConfig(JSON.stringify({ apiKey: "secret" }), {
      destination: "poke",
      mode: "block",
      allowedCategories: [],
      blockedCategories: ["design"],
    });

    expect(JSON.parse(config).apiKey).toBe("secret");
    expect(getExchangePolicy(config, "poke").blockedCategories).toEqual(["design"]);
  });

  it("natural language: don't send school memories to Poke → mode block, education_career blocked", () => {
    const policy = deriveExchangePolicyFromText({
      destination: "poke",
      instruction: "don't send school memories to Poke",
      categories: [
        { slug: "education_career", label: "Education & Career" },
        { slug: "projects", label: "Projects" },
      ],
    });
    expect(policy.mode).toBe("block");
    expect(policy.blockedCategories).toContain("education_career");
  });

  it("natural language: only share projects with Claude → mode allow_only, projects allowed", () => {
    const policy = deriveExchangePolicyFromText({
      destination: "claude_code",
      instruction: "only share projects with Claude",
      categories: [
        { slug: "education_career", label: "Education & Career" },
        { slug: "projects", label: "Projects" },
      ],
    });
    expect(policy.mode).toBe("allow_only");
    expect(policy.allowedCategories).toContain("projects");
  });
});
