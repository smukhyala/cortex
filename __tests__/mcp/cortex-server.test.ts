import { beforeEach, describe, expect, it, vi } from "vitest";

const toolCalls = vi.hoisted(() => [] as Array<{ name: string; handler: (input: any) => Promise<any> }>);
const memoryFindManyMock = vi.hoisted(() => vi.fn());
const getContextBundleMock = vi.hoisted(() => vi.fn());
const ingestExchangeFactsMock = vi.hoisted(() => vi.fn());
const decayAllSlotsMock = vi.hoisted(() => vi.fn());
const getWorkspaceResponseMock = vi.hoisted(() => vi.fn());
const reinforceSlotsMock = vi.hoisted(() => vi.fn());
const holdInMindMock = vi.hoisted(() => vi.fn());
const suppressMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
const logSignalMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/services/j-lens", () => ({
  decayAllSlots: decayAllSlotsMock,
  getWorkspaceResponse: getWorkspaceResponseMock,
  reinforceSlots: reinforceSlotsMock,
  holdInMind: holdInMindMock,
  suppress: suppressMock,
  release: releaseMock,
  logSignal: logSignalMock,
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
      reviewItemsCreated: 0,
      newMemoriesAutoApproved: 1,
      newMemoriesQueuedForReview: 0,
      propagatedDestinations: [{ type: "poke", name: "Poke", success: true }],
    });
    decayAllSlotsMock.mockResolvedValue({ decayed: 0, evicted: 0 });
    getWorkspaceResponseMock.mockResolvedValue({
      slots: [],
      capacity: 20,
      occupied: 0,
      lastUpdated: new Date().toISOString(),
    });
    reinforceSlotsMock.mockResolvedValue(0);
    holdInMindMock.mockResolvedValue({ slotPosition: 0, conceptLabel: "test concept" });
    suppressMock.mockResolvedValue({ evictedSlot: 0, suppressedUntil: new Date().toISOString() });
    releaseMock.mockResolvedValue({ slotPosition: 0 });
    logSignalMock.mockResolvedValue("signal-123");
  });

  it("registers the workspace-first MCP tool surface without starting a transport", () => {
    const server = createCortexMcpServer({ defaultOrigin: "claude" }) as any;

    expect(server.config).toEqual({ name: "cortex", version: "0.1.0" });
    expect(toolCalls.map((call) => call.name)).toEqual([
      "cortex_get_memories",
      "cortex_get_context",
      "cortex_search_memories",
      "cortex_get_relevant_memories",
      "cortex_get_memory_map",
      "cortex_answer_personal_question",
      "cortex_get_workspace",
      "cortex_search_background",
      "cortex_hold_in_mind",
      "cortex_suppress",
      "cortex_release",
      "cortex_log_signal",
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

  it("reports whether exchange memories were auto-approved or queued for manual approval", async () => {
    ingestExchangeFactsMock.mockResolvedValueOnce({
      memoriesCreated: 2,
      referencesUpdated: 1,
      conflictsCreated: 1,
      reviewItemsCreated: 1,
      newMemoriesAutoApproved: 1,
      newMemoriesQueuedForReview: 1,
      propagatedDestinations: [],
    });
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_log_context").handler({
      facts: [
        { content: "User prefers concise answers", category: "preferences" },
        { content: "User has sensitive context", category: "identity" },
      ],
    });

    expect(result.content[0].text).toContain("1 auto-approved.");
    expect(result.content[0].text).toContain("1 queued for manual approval.");
    expect(result.content[0].text).toContain("1 existing memories updated or reinforced.");
    expect(result.content[0].text).toContain("1 conflicts need review.");
  });

  it("answers personal questions with direct Cortex matches and broader context", async () => {
    memoryFindManyMock.mockResolvedValueOnce([
      {
        id: "dog-name",
        content: "User would name a dog Leslie.",
        category: "preferences",
        confidence: 0.9,
        referenceCount: 2,
      },
      {
        id: "watchdog",
        content: "User needs robust watchdog infrastructure for long-running experiments.",
        category: "workflows",
        confidence: 0.9,
        referenceCount: 1,
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
        where: { status: "active", sensitive: false },
      })
    );
    expect(result.content[0].text).toContain("Direct Cortex matches:");
    expect(result.content[0].text).toContain("User would name a dog Leslie.");
    expect(result.content[0].text).not.toContain("watchdog infrastructure");
  });

  it("routes arbitrary personal questions across all memory categories", async () => {
    memoryFindManyMock.mockResolvedValueOnce([
      {
        id: "project",
        content: "User is building Cortex as a cross-assistant memory layer.",
        category: "projects",
        confidence: 0.9,
        referenceCount: 3,
        lastReferencedAt: new Date("2026-07-10T00:00:00.000Z"),
        sensitive: false,
        manuallyStrong: false,
        pinned: false,
      },
      {
        id: "preference",
        content: "User prefers concise, direct engineering answers.",
        category: "preferences",
        confidence: 0.8,
        referenceCount: 1,
        lastReferencedAt: new Date("2026-07-10T00:00:00.000Z"),
        sensitive: false,
        manuallyStrong: false,
        pinned: false,
      },
    ]);
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_get_relevant_memories").handler({
      question: "what am i building?",
    });

    expect(result.content[0].text).toContain("Workspace:");
    expect(result.content[0].text).toContain("User is building Cortex as a cross-assistant memory layer.");
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

  // ─── J-Space workspace tools ──────────────────────────────────────────────

  it("cortex_get_workspace decays then returns slot state", async () => {
    decayAllSlotsMock.mockResolvedValueOnce({ decayed: 2, evicted: 1 });
    getWorkspaceResponseMock.mockResolvedValueOnce({
      slots: [
        {
          position: 0,
          memoryId: "mem-1",
          conceptLabel: "cortex project",
          content: "User is building Cortex.",
          category: "projects",
          loading: 0.85,
          pinned: true,
          sourceSignal: "explicit",
          activatedAt: new Date().toISOString(),
          loadedAt: new Date().toISOString(),
        },
      ],
      capacity: 20,
      occupied: 1,
      lastUpdated: new Date().toISOString(),
    });
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_get_workspace").handler({});

    expect(decayAllSlotsMock).toHaveBeenCalled();
    expect(getWorkspaceResponseMock).toHaveBeenCalled();
    expect(result.content[0].text).toContain("1/20 slots occupied");
    expect(result.content[0].text).toContain("1 evicted this cycle");
    expect(result.content[0].text).toContain("Slot 0: User is building Cortex. (cortex project)");
    expect(result.content[0].text).toContain("85%");
    expect(result.content[0].text).toContain("[pinned]");
  });

  it("cortex_get_workspace handles errors gracefully", async () => {
    decayAllSlotsMock.mockRejectedValueOnce(new Error("DB connection failed"));
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_get_workspace").handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to get workspace");
  });

  it("cortex_search_background searches background-tier memories", async () => {
    memoryFindManyMock.mockResolvedValueOnce([
      {
        id: "bg-1",
        content: "User uses Prisma as their ORM.",
        category: "workflows",
        confidence: 0.9,
      },
    ]);
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_search_background").handler({ query: "Prisma" });

    expect(memoryFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "active",
          tier: "background",
          content: { contains: "Prisma" },
        },
        take: 20,
      })
    );
    expect(result.content[0].text).toContain("1 background memories");
    expect(result.content[0].text).toContain("User uses Prisma as their ORM.");
  });

  it("cortex_hold_in_mind pins a concept and returns slot position", async () => {
    holdInMindMock.mockResolvedValueOnce({ slotPosition: 3, conceptLabel: "cortex project" });
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_hold_in_mind").handler({ concept: "Cortex project" });

    expect(holdInMindMock).toHaveBeenCalledWith("Cortex project");
    expect(result.content[0].text).toContain('Pinned "cortex project" in workspace slot 3.');
  });

  it("cortex_hold_in_mind wraps errors", async () => {
    holdInMindMock.mockRejectedValueOnce(new Error('No memories match concept: "nonexistent"'));
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_hold_in_mind").handler({ concept: "nonexistent" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Failed to hold in mind");
  });

  it("cortex_suppress evicts and suppresses a concept", async () => {
    suppressMock.mockResolvedValueOnce({ evictedSlot: 2, suppressedUntil: "2026-07-13T12:00:00.000Z" });
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_suppress").handler({ concept: "research", duration_hours: 48 });

    expect(suppressMock).toHaveBeenCalledWith("research", 48);
    expect(result.content[0].text).toContain("Suppressed from slot 2");
    expect(result.content[0].text).toContain("2026-07-13T12:00:00.000Z");
  });

  it("cortex_suppress defaults to 24 hours", async () => {
    suppressMock.mockResolvedValueOnce({ evictedSlot: 0, suppressedUntil: "2026-07-13T00:00:00.000Z" });
    createCortexMcpServer({ defaultOrigin: "claude" });

    await tool("cortex_suppress").handler({ concept: "research" });

    expect(suppressMock).toHaveBeenCalledWith("research", 24);
  });

  it("cortex_release unpins a concept", async () => {
    releaseMock.mockResolvedValueOnce({ slotPosition: 5 });
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_release").handler({ concept: "Cortex project" });

    expect(releaseMock).toHaveBeenCalledWith("Cortex project");
    expect(result.content[0].text).toContain("Released pin on slot 5");
    expect(result.content[0].text).toContain("decay naturally");
  });

  it("cortex_log_signal logs signal and reinforces slots", async () => {
    logSignalMock.mockResolvedValueOnce("signal-abc");
    reinforceSlotsMock.mockResolvedValueOnce(3);
    createCortexMcpServer({ defaultOrigin: "claude" });

    const result = await tool("cortex_log_signal").handler({
      keywords: ["cortex", "memory", "project"],
      categories: ["projects"],
      source: "conversation",
    });

    expect(logSignalMock).toHaveBeenCalledWith({
      type: "mcp_query",
      keywords: ["cortex", "memory", "project"],
      categories: ["projects"],
      sourceType: "conversation",
    });
    expect(reinforceSlotsMock).toHaveBeenCalledWith(["cortex", "memory", "project"]);
    expect(result.content[0].text).toContain("Signal logged. 3 workspace slots reinforced.");
  });

  it("cortex_log_signal defaults categories and source", async () => {
    logSignalMock.mockResolvedValueOnce("signal-def");
    reinforceSlotsMock.mockResolvedValueOnce(0);
    createCortexMcpServer({ defaultOrigin: "claude" });

    await tool("cortex_log_signal").handler({ keywords: ["test"] });

    expect(logSignalMock).toHaveBeenCalledWith({
      type: "mcp_query",
      keywords: ["test"],
      categories: [],
      sourceType: "mcp",
    });
  });
});
