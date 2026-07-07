import { beforeEach, describe, expect, it, vi } from "vitest";

const toolCalls = vi.hoisted(() => [] as Array<{ name: string; handler: (input: any) => Promise<any> }>);
const memoryFindManyMock = vi.hoisted(() => vi.fn());
const getContextBundleMock = vi.hoisted(() => vi.fn());
const ingestExchangeFactsMock = vi.hoisted(() => vi.fn());

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: vi.fn(function MockMcpServer(this: any, config: unknown) {
    this.config = config;
    this.tool = (name: string, _description: string, _schema: unknown, handler: (input: any) => Promise<any>) => {
      toolCalls.push({ name, handler });
    };
    this.connect = vi.fn();
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: memoryFindManyMock,
    },
  },
}));

vi.mock("@/services/context", () => ({
  getContextBundle: getContextBundleMock,
}));

vi.mock("@/services/exchange-ingest", () => ({
  ingestExchangeFacts: ingestExchangeFactsMock,
}));

import { createCortexMcpServer } from "@/mcp/cortex-server";

function tool(name: string) {
  const found = toolCalls.find((call) => call.name === name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found;
}

describe("createCortexMcpServer", () => {
  beforeEach(() => {
    toolCalls.length = 0;
    vi.clearAllMocks();
    memoryFindManyMock.mockResolvedValue([]);
    getContextBundleMock.mockResolvedValue({ prompt: "Latest Cortex context" });
    ingestExchangeFactsMock.mockResolvedValue({
      memoriesCreated: 1,
      referencesUpdated: 0,
      conflictsCreated: 0,
      propagatedDestinations: [{ type: "poke", name: "Poke", success: true }],
    });
  });

  it("registers the Cortex MCP tool surface without starting a transport", () => {
    const server = createCortexMcpServer({ defaultOrigin: "claude" }) as any;

    expect(server.config).toEqual({ name: "cortex", version: "0.1.0" });
    expect(toolCalls.map((call) => call.name)).toEqual([
      "cortex_get_memories",
      "cortex_get_context",
      "cortex_search_memories",
      "cortex_get_memory_map",
      "cortex_answer_personal_question",
      "cortex_get_identity_profile",
      "cortex_get_education_career",
      "cortex_get_projects_startups",
      "cortex_get_research_interests",
      "cortex_get_preferences_style",
      "cortex_get_goals_plans",
      "cortex_get_relationships_contacts",
      "cortex_get_writing_voice",
      "cortex_get_workflows_tools",
      "cortex_get_current_context",
      "cortex_save_conversation",
      "cortex_log_context",
    ]);
  });

  it("uses the canonical context bundle for cortex_get_context", async () => {
    createCortexMcpServer({ defaultOrigin: "poke" });

    const result = await tool("cortex_get_context").handler({});

    expect(getContextBundleMock).toHaveBeenCalledWith({ destination: "poke" });
    expect(result.content[0].text).toBe("Latest Cortex context");
  });

  it("defaults saved conversation origin from the transport", async () => {
    createCortexMcpServer({ defaultOrigin: "claude" });

    await tool("cortex_save_conversation").handler({
      summary: "learned facts",
      key_facts: ["User prefers Cortex"],
      topic: "preferences",
    });

    expect(ingestExchangeFactsMock).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "claude" })
    );
  });

  it("answers personal questions with direct Cortex matches and broader context", async () => {
    memoryFindManyMock.mockResolvedValueOnce([
      {
        id: "dog-name",
        content: "User would name a dog Leslie.",
        category: "preferences",
        confidence: 0.9,
      },
    ]);
    getContextBundleMock.mockResolvedValueOnce({
      markdown: "## Preferences\n- User would name a dog Leslie.",
    });
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_answer_personal_question").handler({
      question: "what would i name a dog?",
    });

    expect(memoryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "active", content: { contains: "dog" } },
      })
    );
    expect(result.content[0].text).toContain("Direct Cortex matches:");
    expect(result.content[0].text).toContain("User would name a dog Leslie.");
  });

  it("returns a live category coverage map", async () => {
    memoryFindManyMock.mockResolvedValueOnce([
      { category: "preferences" },
      { category: "projects" },
      { category: "preferences" },
    ]);
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_get_memory_map").handler({});

    expect(memoryFindManyMock).toHaveBeenCalledWith({
      where: { status: "active", sensitive: false },
      select: { category: true },
    });
    expect(result.content[0].text).toContain("preferences: Preferences & Style - 2 active memories");
    expect(result.content[0].text).toContain("projects: Projects & Startups - 1 active memories");
  });

  it("returns category-specific memories for focused personal questions", async () => {
    memoryFindManyMock.mockResolvedValueOnce([
      {
        content: "User would name a dog Leslie.",
        category: "preferences",
        confidence: 0.9,
        referenceCount: 2,
        lastReferencedAt: new Date("2026-07-07T10:55:00.000Z"),
      },
    ]);
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_get_preferences_style").handler({});

    expect(memoryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "active", category: "preferences", sensitive: false },
      })
    );
    expect(result.content[0].text).toContain("Preferences & Style (1 Cortex memories):");
    expect(result.content[0].text).toContain("User would name a dog Leslie.");
  });
});
