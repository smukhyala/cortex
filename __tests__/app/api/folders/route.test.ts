import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const mockPrisma = {
    folder: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    memoryFolder: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import { prisma } from "@/lib/db";
const mockedPrisma = vi.mocked(prisma);

import { slugify } from "@/lib/slugify";

describe("slugify", () => {
  it("converts text to a URL-safe slug", () => {
    expect(slugify("Work Projects")).toBe("work-projects");
  });

  it("handles special characters", () => {
    expect(slugify("My Folder!@#$%")).toBe("my-folder");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });
});

describe("Folders API logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("slugify produces unique slugs from folder names", () => {
    expect(slugify("Personal Notes")).toBe("personal-notes");
    expect(slugify("Work Projects")).toBe("work-projects");
    expect(slugify("AI Research")).toBe("ai-research");
  });
});
