import { describe, it, expect } from "vitest";
import { extractProjectFromPath } from "@/lib/project-detect";

describe("extractProjectFromPath", () => {
  it("extracts project name from Claude Code project path", () => {
    expect(
      extractProjectFromPath("/Users/sanjay/.claude/projects/-Users-sanjay-projects-ProjOTW-cortex/memory/")
    ).toBe("Cortex");
  });

  it("extracts project name from direct project directory", () => {
    expect(
      extractProjectFromPath("/Users/sanjay/projects/ProjOTW/cortex")
    ).toBe("Cortex");
  });

  it("handles paths with nested project structure", () => {
    expect(
      extractProjectFromPath("/Users/sanjay/projects/BerkeleyProjects/Research/IanWaudbySmith/coldStartPrompts/")
    ).toBe("Cold Start Prompts");
  });

  it("returns null for non-project paths", () => {
    expect(extractProjectFromPath("/Users/sanjay/.claude/CLAUDE.md")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractProjectFromPath("")).toBeNull();
  });

  it("capitalizes and humanizes the project name", () => {
    expect(
      extractProjectFromPath("/Users/sanjay/projects/ProjOTW/frontier")
    ).toBe("Frontier");
  });
});
