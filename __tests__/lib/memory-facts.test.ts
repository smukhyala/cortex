import { describe, expect, it } from "vitest";
import { getMemoryFactKey, memoryFactKeysMatch } from "@/lib/memory-facts";

describe("memory fact keys", () => {
  it("keys graduation year memories as a single-truth education fact", () => {
    expect(getMemoryFactKey("User is graduating in 2100.")).toBe("education:graduation_year");
    expect(getMemoryFactKey("User's graduation year is 2027.")).toBe("education:graduation_year");
  });

  it("keys major and university facts separately", () => {
    expect(getMemoryFactKey("User's major is computer science.")).toBe("education:major");
    expect(getMemoryFactKey("User attends UC Berkeley.")).toBe("education:university");
  });

  it("matches repeated facts even when values differ", () => {
    expect(
      memoryFactKeysMatch(
        "User is graduating in 2027.",
        "User is graduating in 2100."
      )
    ).toBe(true);
  });

  it("keys workplace organization facts by organization", () => {
    expect(
      getMemoryFactKey("User works at or with an organization called Astera.")
    ).toBe("education:organization:astera");
    expect(getMemoryFactKey("User no longer works at Astera anymore.")).toBe(
      "education:organization:astera"
    );
  });

  it("matches stale workplace facts to no-longer-true statements", () => {
    expect(
      memoryFactKeysMatch(
        "User works at or with an organization called Astera",
        "User works at or with an organization called Astera."
      )
    ).toBe(true);
  });

  it("does not match unrelated facts", () => {
    expect(
      memoryFactKeysMatch(
        "User's major is computer science.",
        "User attends UC Berkeley."
      )
    ).toBe(false);
  });
});
