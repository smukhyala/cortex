import { describe, expect, it } from "vitest";
import { isLikelyTechnicalMemory } from "@/lib/memory-quality";

describe("isLikelyTechnicalMemory", () => {
  it("flags project artifact paths and implementation storage notes", () => {
    expect(
      isLikelyTechnicalMemory(
        "User's project stores per-task artifacts (conversations, history.json, result.json, screenshots) in `logs/webarena/<arm_id>/<task_id>/`."
      )
    ).toBe(true);
  });

  it("flags model adapter defaults and command/API details", () => {
    expect(
      isLikelyTechnicalMemory(
        "User's project uses `claude-opus-4-7` as the default LLM for the WebArena adapter."
      )
    ).toBe(true);
    expect(
      isLikelyTechnicalMemory(
        "User uses a `make smoke` command to run smoke tests against the Anthropic API after adding an API key."
      )
    ).toBe(true);
  });

  it("keeps durable personal preferences", () => {
    expect(isLikelyTechnicalMemory("User prefers concise answers with minimal caveats.")).toBe(false);
    expect(isLikelyTechnicalMemory("User's dog is named Brian.")).toBe(false);
  });

  it("keeps useful research, project, and education memories that mention technical topics", () => {
    expect(
      isLikelyTechnicalMemory(
        "User is interested in sample efficiency and the tradeoff between RL and natural language reflection in LLM training"
      )
    ).toBe(false);
    expect(
      isLikelyTechnicalMemory(
        "User has built agentic systems, including a ClickUp API integration"
      )
    ).toBe(false);
    expect(
      isLikelyTechnicalMemory(
        "User's chosen clustered electives for the Economics concentration are ECON 141 (Econometrics), MATH 170 (Mathematical Methods for Optimization), and STATS 155 (Game Theory)"
      )
    ).toBe(false);
    expect(
      isLikelyTechnicalMemory(
        "User is working on a project called AutomaticCheckInMessaging involving ClickUp API integration"
      )
    ).toBe(false);
  });

  it("still flags repo artifact breadcrumbs as cleanup", () => {
    expect(
      isLikelyTechnicalMemory(
        "User's company (Oasis) frontend repo has a logo at packages/frontend/public/oasis-logo-1024.png"
      )
    ).toBe(true);
  });
});
