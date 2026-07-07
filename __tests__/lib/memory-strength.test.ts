import { describe, expect, it } from "vitest";
import { computeMemoryStrength } from "@/lib/memory-strength";

describe("computeMemoryStrength", () => {
  it("returns a score in (0.4, 1] for a memory referenced today", () => {
    const strength = computeMemoryStrength(1, new Date());
    expect(strength).toBeGreaterThan(0.4);
    expect(strength).toBeLessThanOrEqual(1.0);
  });

  it("returns a low score for a memory from 365 days ago with 1 reference", () => {
    const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const strength = computeMemoryStrength(1, oldDate);
    expect(strength).toBeLessThan(0.2);
  });

  it("10 references scores higher than 1 reference for same date", () => {
    const now = new Date();
    expect(computeMemoryStrength(10, now)).toBeGreaterThan(
      computeMemoryStrength(1, now)
    );
  });

  it("always returns a value in [0, 1]", () => {
    expect(computeMemoryStrength(0, new Date())).toBeGreaterThanOrEqual(0);
    expect(computeMemoryStrength(0, new Date())).toBeLessThanOrEqual(1);
    expect(computeMemoryStrength(100, new Date())).toBeLessThanOrEqual(1);
    expect(computeMemoryStrength(1, new Date(0))).toBeGreaterThanOrEqual(0);
  });

  it("does not crash with refCount 0", () => {
    expect(() => computeMemoryStrength(0, new Date())).not.toThrow();
  });
});
