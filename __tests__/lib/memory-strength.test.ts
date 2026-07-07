import { describe, expect, it } from "vitest";
import { computeMemoryStrength, isObjectiveProfileMemory } from "@/lib/memory-strength";

describe("computeMemoryStrength", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");

  it("keeps a single fresh reference below reinforced memories", () => {
    const strength = computeMemoryStrength(1, now, now);
    expect(strength).toBeGreaterThan(0);
    expect(strength).toBeLessThan(0.4);
    expect(strength).toBeLessThanOrEqual(1.0);
  });

  it("promotes objective education facts into the strong range", () => {
    const strength = computeMemoryStrength(1, now, now, {
      content: "User's major is computer science at Stanford University.",
      category: "education_career",
    });
    expect(strength).toBeGreaterThanOrEqual(0.45);
  });

  it("promotes objective identity facts into the strong range", () => {
    const strength = computeMemoryStrength(1, now, now, {
      content: "User's name is Sanjay.",
      category: "identity",
    });
    expect(strength).toBeGreaterThanOrEqual(0.45);
  });

  it("does not promote technical memories into the strong range", () => {
    const strength = computeMemoryStrength(1, now, now, {
      content: "User's project stores result.json artifacts in `logs/webarena/<task_id>/`.",
      category: "projects",
      isTechnical: true,
    });
    expect(strength).toBeLessThan(0.45);
  });

  it("promotes memories that are manually marked strong", () => {
    const strength = computeMemoryStrength(1, now, now, {
      content: "User is interested in sample efficiency.",
      category: "research",
      manuallyStrong: true,
    });
    expect(strength).toBeGreaterThanOrEqual(0.9);
  });

  it("returns a low score for a memory from 365 days ago with 1 reference", () => {
    const oldDate = new Date("2025-07-07T12:00:00.000Z");
    const strength = computeMemoryStrength(1, oldDate, now);
    expect(strength).toBeLessThan(0.2);
  });

  it("10 references scores higher than 1 reference for same date", () => {
    expect(computeMemoryStrength(10, now, now)).toBeGreaterThan(
      computeMemoryStrength(1, now, now)
    );
  });

  it("decays older memories with the same reference count", () => {
    const olderDate = new Date("2026-04-08T12:00:00.000Z");
    expect(computeMemoryStrength(10, now, now)).toBeGreaterThan(
      computeMemoryStrength(10, olderDate, now)
    );
  });

  it("lets reinforcement outweigh one-off recency", () => {
    const olderDate = new Date("2026-06-07T12:00:00.000Z");
    expect(computeMemoryStrength(8, olderDate, now)).toBeGreaterThan(
      computeMemoryStrength(1, now, now)
    );
  });

  it("always returns a value in [0, 1]", () => {
    expect(computeMemoryStrength(0, now, now)).toBeGreaterThanOrEqual(0);
    expect(computeMemoryStrength(0, now, now)).toBeLessThanOrEqual(1);
    expect(computeMemoryStrength(100, now, now)).toBeLessThanOrEqual(1);
    expect(computeMemoryStrength(1, new Date(0), now)).toBeGreaterThanOrEqual(0);
  });

  it("does not crash with refCount 0", () => {
    expect(() => computeMemoryStrength(0, now, now)).not.toThrow();
  });
});

describe("isObjectiveProfileMemory", () => {
  it("recognizes school and major facts", () => {
    expect(isObjectiveProfileMemory("User majors in computer science.", "education_career")).toBe(true);
    expect(isObjectiveProfileMemory("User attends UC Berkeley.", "education_career")).toBe(true);
  });

  it("does not treat preferences as objective profile facts", () => {
    expect(isObjectiveProfileMemory("User prefers concise answers.", "preferences")).toBe(false);
  });
});
