import { describe, expect, it } from "vitest";
import { MEMORY_CATEGORIES } from "@/contracts/memory";
import { CATEGORY_MEMORY_TOOL_LIST, CATEGORY_MEMORY_TOOLS, formatMemoryToolCatalog } from "@/contracts/memory-routing";

describe("memory routing registry", () => {
  it("defines an MCP category tool for every memory category", () => {
    expect(Object.keys(CATEGORY_MEMORY_TOOLS).sort()).toEqual([...MEMORY_CATEGORIES].sort());
    expect(CATEGORY_MEMORY_TOOL_LIST).toHaveLength(MEMORY_CATEGORIES.length);
  });

  it("gives every category tool a stable name, description, and triggers", () => {
    for (const category of MEMORY_CATEGORIES) {
      const config = CATEGORY_MEMORY_TOOLS[category];
      expect(config.category).toBe(category);
      expect(config.name).toMatch(/^cortex_get_/);
      expect(config.description).toContain("Cortex memories");
      expect(config.triggers.length).toBeGreaterThan(0);
    }
  });

  it("formats the bootstrap tool catalog from the registry", () => {
    const catalog = formatMemoryToolCatalog();

    for (const config of CATEGORY_MEMORY_TOOL_LIST) {
      expect(catalog).toContain(config.name);
    }
  });
});
