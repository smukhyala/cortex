import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    source: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/llm", () => ({
  structuredCall: vi.fn(),
}));

vi.mock("@/lib/categories", () => ({
  getCategories: vi.fn(),
}));

vi.mock("@/services/memory-change", () => ({
  notifyMemoryChange: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { structuredCall } from "@/lib/llm";
import { getCategories } from "@/lib/categories";
import { notifyMemoryChange } from "@/services/memory-change";
import { POST } from "@/app/api/memories/quick/route";

const mockedPrisma = vi.mocked(prisma);
const mockedStructuredCall = vi.mocked(structuredCall);
const mockedGetCategories = vi.mocked(getCategories);
const mockedNotifyMemoryChange = vi.mocked(notifyMemoryChange);

function request(statement: string) {
  return new NextRequest("http://localhost/api/memories/quick", {
    method: "POST",
    body: JSON.stringify({ statement }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/memories/quick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCategories.mockResolvedValue([
      { id: "cat-1", slug: "education_career", label: "Education & Career", color: "", sortOrder: 0, isDefault: false, createdAt: new Date(), updatedAt: new Date() },
      { id: "cat-2", slug: "identity", label: "Identity & Profile", color: "", sortOrder: 1, isDefault: false, createdAt: new Date(), updatedAt: new Date() },
    ] as any);
    mockedPrisma.memory.findMany.mockResolvedValue([
      { id: "mem-2027", content: "User is graduating in 2027.", category: "education_career" },
      { id: "mem-2028", content: "User's graduation year is 2028.", category: "education_career" },
    ] as any);
    mockedPrisma.memory.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      content: data.content ?? "archived",
      category: data.category ?? "education_career",
    }));
    mockedPrisma.activityLog.create.mockResolvedValue({} as any);
    mockedStructuredCall.mockResolvedValue({
      data: {
        action: "create",
        content: "User is graduating in 2100.",
        category: "education_career",
        matchingMemoryIds: [],
        reasoning: "The user stated a new graduation year.",
      },
      inputTokens: 1,
      outputTokens: 1,
    } as any);
    mockedNotifyMemoryChange.mockResolvedValue({
      destinations: [{ type: "poke", name: "Poke", success: true }],
    } as any);
  });

  it("updates the canonical fact and archives repeated stale memories", async () => {
    const response = await POST(request("I'm graduating in year 2100"));
    const body = await response.json();

    expect(mockedStructuredCall).toHaveBeenCalledOnce();
    expect(body.action).toBe("update");
    expect(body.previousContent).toBe("User is graduating in 2027.");
    expect(body.content).toBe("User is graduating in 2100.");
    expect(body.archivedDuplicateIds).toEqual(["mem-2028"]);
    expect(body.message).toContain("Updated");

    expect(mockedPrisma.memory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem-2027" },
        data: expect.objectContaining({
          content: "User is graduating in 2100.",
          category: "education_career",
        }),
      })
    );
    expect(mockedPrisma.memory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem-2028" },
        data: expect.objectContaining({
          status: "archived",
          archivedReason: "Superseded by quick memory change mem-2027",
        }),
      })
    );
    expect(mockedNotifyMemoryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        memoryId: "mem-2027",
        previousContent: "User is graduating in 2027.",
        content: "User is graduating in 2100.",
        archivedCount: 1,
      })
    );
  });

  it("uses the LLM to understand broad negated workplace changes", async () => {
    mockedPrisma.memory.findMany.mockResolvedValue([
      {
        id: "mem-astera",
        content: "User works at or with an organization called Astera",
        category: "education_career",
      },
    ] as any);
    mockedStructuredCall.mockResolvedValueOnce({
      data: {
        action: "delete",
        content: "User works at or with an organization called Astera.",
        category: "education_career",
        matchingMemoryIds: ["mem-astera"],
        reasoning: "The user said this workplace fact is no longer true.",
      },
      inputTokens: 1,
      outputTokens: 1,
    } as any);

    const response = await POST(request("i dont work at astera anymore"));
    const body = await response.json();

    expect(mockedStructuredCall).toHaveBeenCalledOnce();
    expect(body.action).toBe("delete");
    expect(body.archivedDuplicateIds).toEqual(["mem-astera"]);
    expect(body.usedLocalFallback).toBe(false);
    expect(mockedPrisma.memory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mem-astera" },
        data: expect.objectContaining({
          status: "archived",
          archivedReason: "User deleted via quick statement",
        }),
      })
    );
    expect(mockedNotifyMemoryChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete",
        memoryId: "mem-astera",
        previousContent: "User works at or with an organization called Astera",
        content: "User works at or with an organization called Astera.",
      })
    );
  });

  it("falls back locally for common workplace removals when the LLM is unavailable", async () => {
    mockedPrisma.memory.findMany.mockResolvedValue([
      {
        id: "mem-astera",
        content: "User works at or with an organization called Astera",
        category: "education_career",
      },
    ] as any);
    mockedStructuredCall.mockRejectedValueOnce(new Error("LLM unavailable"));

    const response = await POST(request("i dont work at astera anymore"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedStructuredCall).toHaveBeenCalledOnce();
    expect(body.action).toBe("delete");
    expect(body.content).toBe("User works at or with an organization called Astera.");
    expect(body.archivedDuplicateIds).toEqual(["mem-astera"]);
    expect(body.usedLocalFallback).toBe(true);
  });
});
