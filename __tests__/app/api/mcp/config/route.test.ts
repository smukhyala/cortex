import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getMcpClientConfigStatesMock = vi.hoisted(() => vi.fn());
const installMcpClientConfigsMock = vi.hoisted(() => vi.fn());
const writeClaudeBootstrapMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/mcp/client-config", () => ({
  MCP_CLIENT_IDS: ["claude_desktop", "claude_code"],
  getMcpClientConfigStates: getMcpClientConfigStatesMock,
  installMcpClientConfigs: installMcpClientConfigsMock,
}));

vi.mock("@/exporters/bootstrap", () => ({
  writeAllClaudeBootstraps: writeClaudeBootstrapMock.mockResolvedValue([
    { path: "/tmp/CLAUDE.md", installed: true },
  ]),
}));

import { GET, POST } from "@/app/api/mcp/config/route";

const installedState = {
  client: "claude_desktop",
  label: "Claude Desktop",
  configPath: "/tmp/claude_desktop_config.json",
  serverName: "cortex",
  status: "installed",
  desiredServer: { command: "npm", args: ["--prefix", "/repo", "run", "mcp"] },
  existingServer: { command: "npm", args: ["--prefix", "/repo", "run", "mcp"] },
  error: null,
  backupPath: null,
};

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/mcp/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/mcp/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMcpClientConfigStatesMock.mockResolvedValue([installedState]);
    installMcpClientConfigsMock.mockResolvedValue([installedState]);
    writeClaudeBootstrapMock.mockResolvedValue([
      { path: "/tmp/CLAUDE.md", installed: true },
    ]);
  });

  it("returns config states in UI-friendly target shape", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.summary).toMatchObject({ installed: 1, total: 1, needsRepair: false });
    expect(body.targets[0]).toMatchObject({
      target: "claude_desktop",
      label: "Claude Desktop",
      path: "/tmp/claude_desktop_config.json",
      status: "installed",
    });
    expect(body.pokeHttp.url).toContain("/mcp");
  });

  it("repairs requested targets and installs bootstrap instructions", async () => {
    const response = await POST(postRequest({ targets: ["claude_code"], installBootstrap: true }));
    const body = await response.json();

    expect(installMcpClientConfigsMock).toHaveBeenCalledWith(["claude_code"]);
    expect(writeClaudeBootstrapMock).toHaveBeenCalled();
    expect(body.bootstrap[0].installed).toBe(true);
  });

  it("rejects unknown targets", async () => {
    const response = await POST(postRequest({ targets: ["bad"] }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details).toContain("Unknown MCP client");
  });
});
