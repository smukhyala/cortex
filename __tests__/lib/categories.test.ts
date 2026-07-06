import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const mockPrisma = {
    category: {
      findMany: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

import {
  getCategories,
  invalidateCategoryCache,
  getCategorySlugs,
  getCategoryLabels,
  getCategoryColors,
} from "@/lib/categories";
import { prisma } from "@/lib/db";

const mockedPrisma = vi.mocked(prisma);

const sampleCategories = [
  { slug: "identity", label: "Identity & Profile", color: "#3B82F6", sortOrder: 0 },
  { slug: "preferences", label: "Preferences & Style", color: "#10B981", sortOrder: 1 },
  { slug: "projects", label: "Projects & Startups", color: "#F59E0B", sortOrder: 2 },
];

describe("categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Always invalidate cache before each test to ensure isolation
    invalidateCategoryCache();

    (mockedPrisma as any).category.findMany.mockResolvedValue(sampleCategories);
  });

  describe("getCategories", () => {
    it("returns categories from database", async () => {
      const result = await getCategories();

      expect(result).toEqual(sampleCategories);
      expect((mockedPrisma as any).category.findMany).toHaveBeenCalledOnce();
      expect((mockedPrisma as any).category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sortOrder: "asc" },
        })
      );
    });

    it("caches results (second call within TTL does not hit DB)", async () => {
      // First call should hit the database
      const result1 = await getCategories();
      expect(result1).toEqual(sampleCategories);
      expect((mockedPrisma as any).category.findMany).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await getCategories();
      expect(result2).toEqual(sampleCategories);
      expect((mockedPrisma as any).category.findMany).toHaveBeenCalledTimes(1); // Still 1
    });

    it("cache invalidation causes next call to hit DB", async () => {
      // First call fills cache
      await getCategories();
      expect((mockedPrisma as any).category.findMany).toHaveBeenCalledTimes(1);

      // Invalidate cache
      invalidateCategoryCache();

      // Next call should hit DB again
      await getCategories();
      expect((mockedPrisma as any).category.findMany).toHaveBeenCalledTimes(2);
    });

    it("cache expires after TTL", async () => {
      // First call fills cache
      await getCategories();
      expect((mockedPrisma as any).category.findMany).toHaveBeenCalledTimes(1);

      // Advance time past the TTL (60 seconds)
      vi.useFakeTimers();
      vi.advanceTimersByTime(61_000);

      await getCategories();
      expect((mockedPrisma as any).category.findMany).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("returns empty array when no categories exist", async () => {
      (mockedPrisma as any).category.findMany.mockResolvedValue([]);

      const result = await getCategories();
      expect(result).toEqual([]);
    });
  });

  describe("getCategorySlugs", () => {
    it("returns array of slugs", async () => {
      const slugs = await getCategorySlugs();

      expect(slugs).toEqual(["identity", "preferences", "projects"]);
    });

    it("returns empty array when no categories exist", async () => {
      (mockedPrisma as any).category.findMany.mockResolvedValue([]);

      const slugs = await getCategorySlugs();
      expect(slugs).toEqual([]);
    });
  });

  describe("getCategoryLabels", () => {
    it("returns slug->label map", async () => {
      const labels = await getCategoryLabels();

      expect(labels).toEqual({
        identity: "Identity & Profile",
        preferences: "Preferences & Style",
        projects: "Projects & Startups",
      });
    });

    it("returns empty object when no categories exist", async () => {
      (mockedPrisma as any).category.findMany.mockResolvedValue([]);

      const labels = await getCategoryLabels();
      expect(labels).toEqual({});
    });
  });

  describe("getCategoryColors", () => {
    it("returns slug->color map", async () => {
      const colors = await getCategoryColors();

      expect(colors).toEqual({
        identity: "#3B82F6",
        preferences: "#10B981",
        projects: "#F59E0B",
      });
    });
  });

  describe("invalidateCategoryCache", () => {
    it("clears cache so next getCategories call fetches fresh data", async () => {
      // Fill cache
      await getCategories();

      // Update mock to return different data
      const updatedCategories = [
        { slug: "identity", label: "Updated Identity", color: "#FF0000", sortOrder: 0 },
      ];
      (mockedPrisma as any).category.findMany.mockResolvedValue(updatedCategories);

      // Without invalidation, should get old data
      const cachedResult = await getCategories();
      expect(cachedResult).toEqual(sampleCategories);

      // Invalidate and fetch again
      invalidateCategoryCache();
      const freshResult = await getCategories();
      expect(freshResult).toEqual(updatedCategories);
    });
  });
});
