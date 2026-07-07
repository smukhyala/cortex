import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtractedMemory, DeduplicationOutput } from "@/contracts/pipeline";

// Mock Prisma before importing the module under test
vi.mock("@/lib/db", () => {
  const mockPrisma = {
    memory: {
      create: vi.fn(),
      update: vi.fn(),
    },
    reviewItem: {
      create: vi.fn(),
    },
    conflict: {
      create: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { commit } from "@/pipeline/commit";
import { prisma } from "@/lib/db";

const mockedPrisma = vi.mocked(prisma);

function makeMemory(overrides: Partial<ExtractedMemory> = {}): ExtractedMemory {
  return {
    content: "User prefers TypeScript",
    subject: "user",
    category: "preferences",
    confidence: 0.9,
    verbatimQuote: "I prefer TypeScript",
    temporality: "durable",
    sensitive: false,
    isCorrection: false,
    ...overrides,
  };
}

function makeConflict(
  type: "refinement" | "supersede" | "contradiction",
  overrides: Partial<DeduplicationOutput["conflicts"][number]> = {}
): DeduplicationOutput["conflicts"][number] {
  return {
    newMemory: makeMemory({ content: "User prefers Python now" }),
    existingMemoryId: "existing-mem-1",
    existingContent: "User prefers TypeScript",
    type,
    reasoning: `This is a ${type}`,
    suggestedAction: type === "contradiction" ? "keep_both" : "merge",
    mergedContent: type !== "contradiction" ? "Merged content" : undefined,
    ...overrides,
  };
}

describe("commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock return values
    mockedPrisma.memory.create.mockResolvedValue({
      id: "new-mem-1",
      content: "",
      subject: "user",
      category: "preferences",
      confidence: 0.9,
      verbatimQuote: "",
      temporality: "durable",
      sensitive: false,
      sourceId: "src-1",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    mockedPrisma.memory.update.mockResolvedValue({} as any);
    mockedPrisma.reviewItem.create.mockResolvedValue({} as any);
    mockedPrisma.conflict.create.mockResolvedValue({ id: "conflict-1" } as any);
    mockedPrisma.activityLog.create.mockResolvedValue({} as any);
  });

  it("creates new memories and review items for clean items", async () => {
    const mem1 = makeMemory({ content: "User is named Sanjay" });
    const mem2 = makeMemory({ content: "User likes dark mode", category: "preferences" });

    const result = await commit({
      sourceId: "src-1",
      clean: [mem1, mem2],
      conflicts: [],
      conversationMap: new Map(),
    });

    expect(result.memoriesCreated).toBe(2);
    expect(result.reviewItemsCreated).toBe(2);
    expect(result.conflictsCreated).toBe(0);
    expect(result.autoApproved).toBe(0);
    expect(result.autoSuperseded).toBe(0);

    // Verify memory.create was called for each clean memory
    expect(mockedPrisma.memory.create).toHaveBeenCalledTimes(2);
    expect(mockedPrisma.memory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "User is named Sanjay",
          status: "pending",
          sourceId: "src-1",
        }),
      })
    );

    // Verify review items created with type "new_memory"
    expect(mockedPrisma.reviewItem.create).toHaveBeenCalledTimes(2);
    expect(mockedPrisma.reviewItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "new_memory",
          status: "pending",
        }),
      })
    );
  });

  it("can create clean exchange memories as active without review items", async () => {
    const result = await commit({
      sourceId: "src-1",
      clean: [makeMemory({ content: "User's dog is named Brian", category: "relationships" })],
      conflicts: [],
      conversationMap: new Map(),
      initialStatus: "active",
    });

    expect(result.memoriesCreated).toBe(1);
    expect(result.reviewItemsCreated).toBe(0);
    expect(mockedPrisma.memory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "active",
          approvedAt: expect.any(Date),
        }),
      })
    );
    expect(mockedPrisma.reviewItem.create).not.toHaveBeenCalled();
  });

  it("auto-approves refinements of existing memories", async () => {
    const refinement = makeConflict("refinement", {
      mergedContent: "User prefers TypeScript for all web projects",
    });

    const result = await commit({
      sourceId: "src-1",
      clean: [],
      conflicts: [refinement],
      conversationMap: new Map(),
    });

    expect(result.autoApproved).toBe(1);
    expect(result.memoriesCreated).toBe(0);
    expect(result.reviewItemsCreated).toBe(0);
    expect(result.conflictsCreated).toBe(0);

    // Should update the existing memory with merged content
    expect(mockedPrisma.memory.update).toHaveBeenCalledOnce();
    expect(mockedPrisma.memory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-mem-1" },
        data: expect.objectContaining({
          content: "User prefers TypeScript for all web projects",
        }),
      })
    );

    // Should log activity
    expect(mockedPrisma.activityLog.create).toHaveBeenCalledOnce();
    expect(mockedPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "auto_merge_refinement",
        }),
      })
    );
  });

  it("creates review items for contradictions", async () => {
    const contradiction = makeConflict("contradiction", {
      newMemory: makeMemory({ content: "User prefers Python" }),
      existingContent: "User prefers TypeScript",
    });

    const result = await commit({
      sourceId: "src-1",
      clean: [],
      conflicts: [contradiction],
      conversationMap: new Map(),
    });

    expect(result.conflictsCreated).toBe(1);
    expect(result.memoriesCreated).toBe(1);
    expect(result.reviewItemsCreated).toBe(1);
    expect(result.autoApproved).toBe(0);
    expect(result.autoSuperseded).toBe(0);

    // Should create a new pending memory
    expect(mockedPrisma.memory.create).toHaveBeenCalledOnce();
    expect(mockedPrisma.memory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "User prefers Python",
          status: "pending",
        }),
      })
    );

    // Should create a conflict record
    expect(mockedPrisma.conflict.create).toHaveBeenCalledOnce();
    expect(mockedPrisma.conflict.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "contradiction",
          status: "pending",
        }),
      })
    );

    // Should create a review item with type "conflict"
    expect(mockedPrisma.reviewItem.create).toHaveBeenCalledOnce();
    expect(mockedPrisma.reviewItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "conflict",
          status: "pending",
        }),
      })
    );
  });

  it("handles supersede correctly (updates existing, logs activity)", async () => {
    const supersede = makeConflict("supersede", {
      mergedContent: "User now prefers Python for all projects",
      existingContent: "User prefers TypeScript",
    });

    const result = await commit({
      sourceId: "src-1",
      clean: [],
      conflicts: [supersede],
      conversationMap: new Map(),
    });

    expect(result.autoSuperseded).toBe(1);
    expect(result.memoriesCreated).toBe(0);
    expect(result.reviewItemsCreated).toBe(0);
    expect(result.conflictsCreated).toBe(0);

    // Should update existing memory with new content
    expect(mockedPrisma.memory.update).toHaveBeenCalledOnce();
    expect(mockedPrisma.memory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-mem-1" },
        data: expect.objectContaining({
          content: "User now prefers Python for all projects",
        }),
      })
    );

    // Should log activity with auto_supersede action
    expect(mockedPrisma.activityLog.create).toHaveBeenCalledOnce();
    expect(mockedPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "auto_supersede",
        }),
      })
    );
  });

  it("increments reference tracking for duplicate references", async () => {
    const result = await commit({
      sourceId: "src-1",
      clean: [],
      conflicts: [],
      duplicateReferences: [
        {
          existingMemoryId: "existing-mem-1",
          newMemory: makeMemory({ content: "User prefers TypeScript" }),
          reasoning: "Same fact was mentioned again",
        },
      ],
      conversationMap: new Map(),
    });

    expect(result.referencesUpdated).toBe(1);
    expect(mockedPrisma.memory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-mem-1" },
        data: expect.objectContaining({
          referenceCount: { increment: 1 },
          lastReferencedAt: expect.any(Date),
        }),
      })
    );
    expect(mockedPrisma.activityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "memory_reference_repeated",
        }),
      })
    );
  });

  it("handles empty input gracefully", async () => {
    const result = await commit({
      sourceId: "src-1",
      clean: [],
      conflicts: [],
      conversationMap: new Map(),
    });

    expect(result.memoriesCreated).toBe(0);
    expect(result.reviewItemsCreated).toBe(0);
    expect(result.conflictsCreated).toBe(0);
    expect(result.autoApproved).toBe(0);
    expect(result.autoSuperseded).toBe(0);

    expect(mockedPrisma.memory.create).not.toHaveBeenCalled();
    expect(mockedPrisma.memory.update).not.toHaveBeenCalled();
    expect(mockedPrisma.reviewItem.create).not.toHaveBeenCalled();
    expect(mockedPrisma.conflict.create).not.toHaveBeenCalled();
  });

  it("handles sensitive memories (creates them as pending, does not auto-approve)", async () => {
    const sensitiveMem = makeMemory({
      content: "User earns $200k",
      category: "identity",
      sensitive: true,
    });

    const result = await commit({
      sourceId: "src-1",
      clean: [sensitiveMem],
      conflicts: [],
      conversationMap: new Map(),
    });

    // Sensitive memories should still be created as pending with review items
    expect(result.memoriesCreated).toBe(1);
    expect(result.reviewItemsCreated).toBe(1);

    expect(mockedPrisma.memory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "User earns $200k",
          sensitive: true,
          status: "pending",
        }),
      })
    );
  });

  it("uses newMemory.content when mergedContent is not provided for refinement", async () => {
    const refinement = makeConflict("refinement", {
      newMemory: makeMemory({ content: "User prefers TypeScript for all projects" }),
      mergedContent: undefined,
    });

    await commit({
      sourceId: "src-1",
      clean: [],
      conflicts: [refinement],
      conversationMap: new Map(),
    });

    expect(mockedPrisma.memory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: "User prefers TypeScript for all projects",
        }),
      })
    );
  });

  it("handles mixed clean and conflict items in a single call", async () => {
    const cleanMem = makeMemory({ content: "User plays guitar" });
    const refinement = makeConflict("refinement");
    const contradiction = makeConflict("contradiction", {
      existingMemoryId: "existing-mem-2",
    });

    const result = await commit({
      sourceId: "src-1",
      clean: [cleanMem],
      conflicts: [refinement, contradiction],
      conversationMap: new Map(),
    });

    expect(result.memoriesCreated).toBe(2); // 1 clean + 1 contradiction
    expect(result.reviewItemsCreated).toBe(2); // 1 clean + 1 contradiction
    expect(result.autoApproved).toBe(1); // refinement
    expect(result.conflictsCreated).toBe(1); // contradiction
  });
});
