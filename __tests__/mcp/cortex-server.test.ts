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
});
