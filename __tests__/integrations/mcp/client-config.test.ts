import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CORTEX_MCP_SERVER_NAME,
  getDesiredCortexMcpServerConfig,
  getMcpClientConfigState,
  getMcpClientDescriptor,
  installMcpClientConfig,
} from "@/integrations/mcp/client-config";

describe("MCP client config", () => {
  let tmpDir: string;
  let homeDir: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "cortex-mcp-config-"));
    homeDir = join(tmpDir, "home");
    projectRoot = join(tmpDir, "project");
    await mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("reports missing config for Claude Desktop and Claude Code global", async () => {
    const desktop = await getMcpClientConfigState("claude_desktop", {
      homeDir,
      projectRoot,
    });
    const code = await getMcpClientConfigState("claude_code", {
      homeDir,
      projectRoot,
    });

    expect(desktop.status).toBe("missing");
    expect(desktop.configPath).toContain("claude_desktop_config.json");
    expect(code.status).toBe("missing");
    expect(code.configPath).toBe(join(homeDir, ".mcp.json"));
  });

  it("preserves unrelated Claude Desktop config and backs up before writing", async () => {
    const descriptor = getMcpClientDescriptor("claude_desktop", {
      homeDir,
      projectRoot,
    });
    await mkdir(join(homeDir, "Library", "Application Support", "Claude"), {
      recursive: true,
    });
    await writeFile(
      descriptor.configPath,
      JSON.stringify(
        {
          unrelated: true,
          mcpServers: {
            existing: { type: "stdio", command: "node", args: ["server.js"] },
          },
        },
        null,
        2
      )
    );

    const result = await installMcpClientConfig("claude_desktop", {
      homeDir,
      projectRoot,
    });
    const updated = JSON.parse(await readFile(descriptor.configPath, "utf-8"));
    const backup = JSON.parse(await readFile(result.backupPath!, "utf-8"));
    const state = await getMcpClientConfigState("claude_desktop", {
      homeDir,
      projectRoot,
    });

    expect(result.status).toBe("installed");
    expect(state.status).toBe("installed");
    expect(result.backupPath).toMatch(/claude_desktop_config\.json\..+\.bak$/);
    expect(backup.mcpServers).toHaveProperty("existing");
    expect(updated.unrelated).toBe(true);
    expect(updated.mcpServers.existing).toEqual({
      type: "stdio",
      command: "node",
      args: ["server.js"],
    });
    expect(updated.mcpServers[CORTEX_MCP_SERVER_NAME]).toEqual(
      getDesiredCortexMcpServerConfig({ homeDir, projectRoot })
    );
  });

  it("detects drifted cortex entries and updates only that server", async () => {
    const descriptor = getMcpClientDescriptor("claude_code", {
      homeDir,
      projectRoot,
    });
    await mkdir(homeDir, { recursive: true });
    await writeFile(
      descriptor.configPath,
      JSON.stringify({
        mcpServers: {
          [CORTEX_MCP_SERVER_NAME]: {
            type: "stdio",
            command: "node",
            args: ["old.js"],
          },
          keep: { type: "stdio", command: "node", args: ["keep.js"] },
        },
      })
    );

    const before = await getMcpClientConfigState("claude_code", {
      homeDir,
      projectRoot,
    });
    const after = await installMcpClientConfig("claude_code", {
      homeDir,
      projectRoot,
    });
    const updated = JSON.parse(await readFile(descriptor.configPath, "utf-8"));

    expect(before.status).toBe("drifted");
    expect(after.status).toBe("installed");
    expect(updated.mcpServers.keep).toEqual({
      type: "stdio",
      command: "node",
      args: ["keep.js"],
    });
    expect(updated.mcpServers[CORTEX_MCP_SERVER_NAME]).toEqual(
      getDesiredCortexMcpServerConfig({ homeDir, projectRoot })
    );
  });

  it("detects invalid JSON and preserves it in a backup before replacement", async () => {
    const descriptor = getMcpClientDescriptor("claude_code", {
      homeDir,
      projectRoot,
    });
    await mkdir(homeDir, { recursive: true });
    await writeFile(descriptor.configPath, "{ not-json");

    const before = await getMcpClientConfigState("claude_code", {
      homeDir,
      projectRoot,
    });
    const after = await installMcpClientConfig("claude_code", {
      homeDir,
      projectRoot,
    });
    const backup = await readFile(after.backupPath!, "utf-8");
    const updated = JSON.parse(await readFile(descriptor.configPath, "utf-8"));

    expect(before.status).toBe("invalid_json");
    expect(after.status).toBe("installed");
    expect(after.error).toContain("Previous config was invalid JSON");
    expect(backup).toBe("{ not-json");
    expect(updated.mcpServers[CORTEX_MCP_SERVER_NAME]).toEqual(
      getDesiredCortexMcpServerConfig({ homeDir, projectRoot })
    );
  });

  it("supports CLAUDE_CONFIG_DIR for Claude Code global config", async () => {
    const claudeConfigDir = join(tmpDir, "claude-config");

    const result = await installMcpClientConfig("claude_code", {
      claudeConfigDir,
      homeDir,
      projectRoot,
    });
    const updated = JSON.parse(await readFile(result.configPath, "utf-8"));

    expect(result.configPath).toBe(join(claudeConfigDir, ".mcp.json"));
    expect(updated.mcpServers[CORTEX_MCP_SERVER_NAME]).toEqual(
      getDesiredCortexMcpServerConfig({ homeDir, projectRoot })
    );
  });
});
