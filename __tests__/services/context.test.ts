import { beforeEach, describe, expect, it, vi } from "vitest";

const memoryFindManyMock = vi.hoisted(() => vi.fn());
const sourceFindFirstMock = vi.hoisted(() => vi.fn());
const sourceFindUniqueMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: memoryFindManyMock,
    },
    source: {
      findFirst: sourceFindFirstMock,
      findUnique: sourceFindUniqueMock,
    },
  },
}));

import { getContextBundle } from "@/services/context";

const memory = (overrides: Record<string, unknown>) => ({
  id: "mem-1",
  content: "User prefers TypeScript",
  category: "preferences",
  subject: "user",
  confidence: 0.8,
  temporality: "durable",
  sensitive: false,
  referenceCount: 1,
  updatedAt: new Date("2026-07-01T00:00:00.000Z"),
  lastReferencedAt: new Date("2026-07-01T00:00:00.000Z"),
  ...overrides,
});

describe("getContextBundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceFindFirstMock.mockResolvedValue(null);
    sourceFindUniqueMock.mockResolvedValue(null);
  });

  it("builds default context from active non-sensitive memories", async () => {
    memoryFindManyMock.mockResolvedValue([
      memory({ id: "active", content: "User prefers TypeScript" }),
      memory({ id: "sensitive", content: "User has a private diagnosis", sensitive: true }),
    ]);

    const context = await getContextBundle();

    expect(memoryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "active" } })
    );
    expect(context).toMatchObject({
      memoryCount: 1,
      omittedSensitiveCount: 1,
    });
    expect(context.markdown).toContain("Found 1 Cortex memories:");
    expect(context.markdown).toContain("## Preferences & Style");
    expect(context.markdown).toContain("- User prefers TypeScript");
    expect(context.prompt).toContain("Use this Cortex context as the user's current authoritative profile.");
    expect(context.markdown).not.toContain("private diagnosis");
    expect(context.prompt).not.toContain("private diagnosis");
  });

  it("orders memories within a category by reference count before recency", async () => {
    memoryFindManyMock.mockResolvedValue([
      memory({
        id: "low",
        content: "Low-reference preference",
        referenceCount: 1,
        lastReferencedAt: new Date("2026-07-07T00:00:00.000Z"),
      }),
      memory({
        id: "high",
        content: "High-reference preference",
        referenceCount: 5,
        lastReferencedAt: new Date("2026-06-01T00:00:00.000Z"),
      }),
    ]);

    const context = await getContextBundle();

    expect(context.markdown.indexOf("High-reference preference")).toBeLessThan(
      context.markdown.indexOf("Low-reference preference")
    );
  });

  it("respects maxItems after sorting", async () => {
    memoryFindManyMock.mockResolvedValue([
      memory({ id: "first", content: "First preference", referenceCount: 3 }),
      memory({ id: "second", content: "Second preference", referenceCount: 2 }),
      memory({ id: "third", content: "Third preference", referenceCount: 1 }),
    ]);

    const context = await getContextBundle({ maxItems: 2 });

    expect(context.memoryCount).toBe(2);
    expect(context.markdown).toContain("First preference");
    expect(context.markdown).toContain("Second preference");
    expect(context.markdown).not.toContain("Third preference");
  });

  it("can include sensitive memories only when explicitly requested", async () => {
    memoryFindManyMock.mockResolvedValue([
      memory({ id: "public", content: "User likes dense dashboards" }),
      memory({ id: "sensitive", content: "User sensitive fact", sensitive: true }),
    ]);

    const context = await getContextBundle({ includeSensitive: true });

    expect(context).toMatchObject({ memoryCount: 2, omittedSensitiveCount: 1 });
    expect(context.markdown).toContain("User sensitive fact");
  });

  it("returns stable empty-state copy when no memories qualify", async () => {
    memoryFindManyMock.mockResolvedValue([]);

    const context = await getContextBundle();

    expect(context).toMatchObject({
      memoryCount: 0,
      markdown: "No Cortex memories are available yet.",
      prompt: "No Cortex context is available yet. If you learn durable facts about the user, save them to Cortex.",
    });
  });
});
