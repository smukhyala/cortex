import { NextResponse } from "next/server";
import {
  MCP_CLIENT_IDS,
  type McpClientId,
  type McpClientConfigState,
  getMcpClientConfigStates,
  installMcpClientConfigs,
} from "@/integrations/mcp/client-config";
import { writeAllClaudeBootstraps } from "@/exporters/bootstrap";

export const runtime = "nodejs";

export async function GET() {
  try {
    const configs = await getMcpClientConfigStates();
    return NextResponse.json({
      configs,
      targets: configs.map(toTarget),
      summary: summarize(configs),
      pokeHttp: pokeHttpConfig(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to read MCP client config",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const clients = parseRequestedClients(body);
    const configs = await installMcpClientConfigs(clients);
    const bootstrap = await maybeInstallBootstrap(body);

    return NextResponse.json({
      configs,
      targets: configs.map(toTarget),
      summary: summarize(configs),
      bootstrap,
      pokeHttp: pokeHttpConfig(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("Unknown MCP client") ? 400 : 500;

    return NextResponse.json(
      {
        error: "Failed to write MCP client config",
        details: message,
      },
      { status }
    );
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function parseRequestedClients(body: unknown): McpClientId[] {
  if (!body || typeof body !== "object" || (!("clients" in body) && !("targets" in body))) {
    return [...MCP_CLIENT_IDS];
  }

  const rawClients = (body as { clients?: unknown; targets?: unknown }).clients
    ?? (body as { targets?: unknown }).targets;
  const clients = Array.isArray(rawClients) ? rawClients : [rawClients];

  return clients.map((client) => {
    if (typeof client === "string" && isMcpClientId(client)) {
      return client;
    }
    throw new Error(`Unknown MCP client: ${String(client)}`);
  });
}

async function maybeInstallBootstrap(body: unknown) {
  if (body && typeof body === "object" && (body as { installBootstrap?: unknown }).installBootstrap === false) {
    return undefined;
  }

  return writeAllClaudeBootstraps();
}

function toTarget(config: McpClientConfigState) {
  return {
    target: config.client,
    label: config.label,
    path: config.configPath,
    status: config.status,
    exists: config.status !== "missing",
    expected: config.desiredServer,
    current: config.existingServer ?? undefined,
    error: config.error ?? undefined,
    backupPath: config.backupPath ?? undefined,
  };
}

function pokeHttpConfig() {
  const port = process.env.MCP_PORT || "3001";
  return {
    url: `http://localhost:${port}/mcp`,
    healthUrl: `http://localhost:${port}/`,
  };
}

function isMcpClientId(value: string): value is McpClientId {
  return (MCP_CLIENT_IDS as readonly string[]).includes(value);
}

function summarize(configs: McpClientConfigState[]) {
  const statuses = configs.map((config) => config.status);
  const counts: Record<string, number> = {};
  for (const status of statuses) {
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return {
    installed: counts.installed ?? 0,
    total: configs.length,
    needsRepair: configs.some((config) => config.status !== "installed"),
    counts,
  };
}
