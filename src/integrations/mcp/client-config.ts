import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { homedir } from "os";
import { basename, dirname, join, resolve } from "path";

export const CORTEX_MCP_SERVER_NAME = "cortex";

export const MCP_CLIENT_IDS = ["claude_desktop", "claude_code"] as const;
export type McpClientId = (typeof MCP_CLIENT_IDS)[number];

export type McpConfigStatus = "missing" | "installed" | "drifted" | "invalid_json";

export interface CortexMcpServerConfig {
  [key: string]: unknown;
  command: string;
  args: string[];
}

export interface McpClientConfigState {
  client: McpClientId;
  label: string;
  configPath: string;
  serverName: string;
  status: McpConfigStatus;
  desiredServer: CortexMcpServerConfig;
  existingServer: Record<string, unknown> | null;
  error: string | null;
  backupPath: string | null;
}

export interface McpClientConfigOptions {
  projectRoot?: string;
  homeDir?: string;
  claudeConfigDir?: string;
  platform?: NodeJS.Platform;
}

interface ClientDescriptor {
  client: McpClientId;
  label: string;
  configPath: string;
}

type JsonObject = Record<string, unknown>;

type ConfigReadResult =
  | { kind: "missing" }
  | { kind: "valid"; config: JsonObject }
  | { kind: "invalid_json"; error: string };

export function getDesiredCortexMcpServerConfig(
  options: McpClientConfigOptions = {}
): CortexMcpServerConfig {
  const projectRoot = options.projectRoot
    ? resolve(options.projectRoot)
    : join(/* turbopackIgnore: true */ process.cwd());

  return {
    command: "npm",
    args: ["--prefix", projectRoot, "run", "mcp"],
  };
}

export function getMcpClientDescriptors(
  options: McpClientConfigOptions = {}
): ClientDescriptor[] {
  return MCP_CLIENT_IDS.map((client) => getMcpClientDescriptor(client, options));
}

export function getMcpClientDescriptor(
  client: McpClientId,
  options: McpClientConfigOptions = {}
): ClientDescriptor {
  const homeDir = options.homeDir ?? homedir();
  const platform = options.platform ?? process.platform;

  if (client === "claude_code") {
    const configDir = options.claudeConfigDir ?? process.env.CLAUDE_CONFIG_DIR;
    return {
      client,
      label: "Claude Code (global)",
      configPath: join(configDir ?? homeDir, ".mcp.json"),
    };
  }

  const appSupportDir =
    platform === "win32"
      ? join(process.env.APPDATA ?? join(homeDir, "AppData", "Roaming"), "Claude")
      : join(homeDir, "Library", "Application Support", "Claude");

  return {
    client,
    label: "Claude Desktop",
    configPath: join(appSupportDir, "claude_desktop_config.json"),
  };
}

export async function getMcpClientConfigStates(
  options: McpClientConfigOptions = {}
): Promise<McpClientConfigState[]> {
  return Promise.all(
    getMcpClientDescriptors(options).map((descriptor) =>
      getMcpClientConfigState(descriptor.client, options)
    )
  );
}

export async function getCortexMcpStatus(
  options: McpClientConfigOptions = {}
): Promise<McpClientConfigState[]> {
  return getMcpClientConfigStates(options);
}

export async function getMcpClientConfigState(
  client: McpClientId,
  options: McpClientConfigOptions = {}
): Promise<McpClientConfigState> {
  const descriptor = getMcpClientDescriptor(client, options);
  const desiredServer = getDesiredCortexMcpServerConfig(options);
  const readResult = await readConfigFile(descriptor.configPath);

  if (readResult.kind === "missing") {
    return makeState(descriptor, desiredServer, "missing");
  }

  if (readResult.kind === "invalid_json") {
    return makeState(
      descriptor,
      desiredServer,
      "invalid_json",
      null,
      readResult.error
    );
  }

  const mcpServers = readResult.config.mcpServers;
  if (!isJsonObject(mcpServers)) {
    return makeState(
      descriptor,
      desiredServer,
      mcpServers === undefined ? "missing" : "drifted",
      null,
      mcpServers === undefined ? null : "mcpServers must be a JSON object"
    );
  }

  const existingServer = mcpServers[CORTEX_MCP_SERVER_NAME];
  if (!isJsonObject(existingServer)) {
    return makeState(
      descriptor,
      desiredServer,
      existingServer === undefined ? "missing" : "drifted",
      null,
      existingServer === undefined ? null : "Existing cortex server must be a JSON object"
    );
  }

  return makeState(
    descriptor,
    desiredServer,
    deepEqual(existingServer, desiredServer) ? "installed" : "drifted",
    existingServer
  );
}

export async function installMcpClientConfigs(
  clients: McpClientId[] = [...MCP_CLIENT_IDS],
  options: McpClientConfigOptions = {}
): Promise<McpClientConfigState[]> {
  const states: McpClientConfigState[] = [];
  for (const client of clients) {
    states.push(await installMcpClientConfig(client, options));
  }
  return states;
}

export async function installMcpClientConfig(
  client: McpClientId,
  options: McpClientConfigOptions = {}
): Promise<McpClientConfigState> {
  const descriptor = getMcpClientDescriptor(client, options);
  const desiredServer = getDesiredCortexMcpServerConfig(options);
  const readResult = await readConfigFile(descriptor.configPath);
  const config = readResult.kind === "valid" ? { ...readResult.config } : {};
  const existingMcpServers = config.mcpServers;

  const mcpServers = isJsonObject(existingMcpServers)
    ? { ...existingMcpServers }
    : {};

  mcpServers[CORTEX_MCP_SERVER_NAME] = desiredServer;
  config.mcpServers = mcpServers;

  const backupPath = await backupConfigFile(descriptor.configPath);
  await writeJsonAtomically(descriptor.configPath, config);

  return makeState(
    descriptor,
    desiredServer,
    "installed",
    desiredServer,
    readResult.kind === "invalid_json"
      ? `Previous config was invalid JSON and was preserved at ${backupPath}`
      : null,
    backupPath
  );
}

async function readConfigFile(configPath: string): Promise<ConfigReadResult> {
  let content: string;
  try {
    content = await readFile(configPath, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { kind: "missing" };
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isJsonObject(parsed)) {
      return { kind: "invalid_json", error: "Config root must be a JSON object" };
    }
    return { kind: "valid", config: parsed };
  } catch (error) {
    return {
      kind: "invalid_json",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function backupConfigFile(configPath: string): Promise<string | null> {
  try {
    await stat(configPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const backupPath = `${configPath}.${timestampForFileName()}.bak`;
  await copyFile(configPath, backupPath);
  return backupPath;
}

async function writeJsonAtomically(configPath: string, config: JsonObject): Promise<void> {
  const directory = dirname(configPath);
  await mkdir(directory, { recursive: true });

  const tempPath = join(
    directory,
    `.${basename(configPath)}.${process.pid}.${Date.now()}.tmp`
  );
  const mode = await getExistingMode(configPath);
  const data = `${JSON.stringify(config, null, 2)}\n`;

  try {
    await writeFile(tempPath, data, { encoding: "utf-8", mode });
    await rename(tempPath, configPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function getExistingMode(configPath: string): Promise<number> {
  try {
    return (await stat(configPath)).mode & 0o777;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return 0o600;
    }
    throw error;
  }
}

function makeState(
  descriptor: ClientDescriptor,
  desiredServer: CortexMcpServerConfig,
  status: McpConfigStatus,
  existingServer: Record<string, unknown> | null = null,
  error: string | null = null,
  backupPath: string | null = null
): McpClientConfigState {
  return {
    client: descriptor.client,
    label: descriptor.label,
    configPath: descriptor.configPath,
    serverName: CORTEX_MCP_SERVER_NAME,
    status,
    desiredServer,
    existingServer,
    error,
    backupPath,
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (isJsonObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function timestampForFileName(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
