import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ─── Auto-Detect Integrations ──────────────────────────────────────────────
//
// Scans local AI tool configuration files to discover what services the user
// already has connected. Instead of asking the user to manually configure
// Gmail, Google Drive, etc., we detect that Claude or ChatGPT already has
// those services wired up via MCP.
//
// Config locations scanned:
//
//   Claude Code:
//     ~/.claude/settings.json           — enabledPlugins with MCP servers
//     ~/.claude/settings.local.json     — local overrides
//     ~/.mcp.json                       — global MCP config (user-level)
//     .mcp.json                         — project-level MCP config
//     ~/.claude/plugins/.../.mcp.json   — plugin MCP definitions
//
//   Claude Desktop:
//     ~/Library/Application Support/Claude/claude_desktop_config.json
//
//   ChatGPT:
//     No local config — cloud-only. We detect via known export patterns.
//
// Each detected MCP server is mapped to a known service type (gmail,
// google_drive, slack, etc.) based on name patterns and tool signatures.

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DetectedIntegration {
  /** Unique key for this detection, e.g. "claude_code:gmail" */
  id: string;
  /** Human-readable name, e.g. "Gmail" */
  name: string;
  /** Service type matching ConnectorType where applicable */
  serviceType: string;
  /** Which AI tool has this connected */
  detectedVia: "claude_code" | "claude_desktop" | "claude_ai" | "chatgpt";
  /** Human-readable label for the AI tool */
  detectedViaLabel: string;
  /** Where the config was found */
  configPath: string;
  /** MCP server name as declared in config */
  mcpServerName: string;
  /** Transport type: stdio, http, sse */
  transport: "stdio" | "http" | "sse" | "unknown";
  /** Whether this maps to a known Cortex connector */
  hasConnector: boolean;
  /** Raw MCP server config (command, args, url, etc.) */
  serverConfig: Record<string, unknown>;
}

export interface DetectionResult {
  integrations: DetectedIntegration[];
  scannedPaths: string[];
  errors: string[];
}

// ─── Known Service Patterns ─────────────────────────────────────────────────
// Maps MCP server names/patterns to service types. These patterns match
// against the server name key in the MCP config object.

const SERVICE_PATTERNS: Array<{
  pattern: RegExp;
  serviceType: string;
  name: string;
}> = [
  { pattern: /\bgmail\b/i, serviceType: "gmail", name: "Gmail" },
  { pattern: /\bgoogle[_-]?drive\b/i, serviceType: "google_drive", name: "Google Drive" },
  { pattern: /\bgdrive\b/i, serviceType: "google_drive", name: "Google Drive" },
  { pattern: /\bnotion\b/i, serviceType: "notion", name: "Notion" },
  { pattern: /\bslack\b/i, serviceType: "slack", name: "Slack" },
  { pattern: /\bgithub\b/i, serviceType: "github", name: "GitHub" },
  { pattern: /\bgitlab\b/i, serviceType: "gitlab", name: "GitLab" },
  { pattern: /\blinear\b/i, serviceType: "linear", name: "Linear" },
  { pattern: /\bdiscord\b/i, serviceType: "discord", name: "Discord" },
  { pattern: /\btelegram\b/i, serviceType: "telegram", name: "Telegram" },
  { pattern: /\basana\b/i, serviceType: "asana", name: "Asana" },
  { pattern: /\bjira\b/i, serviceType: "jira", name: "Jira" },
  { pattern: /\bfigma\b/i, serviceType: "figma", name: "Figma" },
  { pattern: /\bfirebase\b/i, serviceType: "firebase", name: "Firebase" },
  { pattern: /\bplaywright\b/i, serviceType: "playwright", name: "Playwright" },
  { pattern: /\bimessage\b/i, serviceType: "imessage", name: "iMessage" },
  { pattern: /\bcalendar\b/i, serviceType: "calendar", name: "Google Calendar" },
  { pattern: /\bgoogle[_-]?calendar\b/i, serviceType: "calendar", name: "Google Calendar" },
  { pattern: /\btrello\b/i, serviceType: "trello", name: "Trello" },
  { pattern: /\bdropbox\b/i, serviceType: "dropbox", name: "Dropbox" },
  { pattern: /\bconfluence\b/i, serviceType: "confluence", name: "Confluence" },
  { pattern: /\boutlook\b/i, serviceType: "outlook", name: "Outlook" },
  { pattern: /\bgreptile\b/i, serviceType: "greptile", name: "Greptile" },
  { pattern: /\bcontext7\b/i, serviceType: "context7", name: "Context7" },
  { pattern: /\bterraform\b/i, serviceType: "terraform", name: "Terraform" },
];

// Connector types that have a corresponding Cortex connector implementation
const CONNECTABLE_SERVICES = new Set([
  "gmail",
  "google_drive",
  "notion",
  "slack",
  "granola",
]);

// ─── Config Readers ─────────────────────────────────────────────────────────

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    if (!existsSync(path)) return null;
    const content = await readFile(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Determine transport type from an MCP server config entry.
 */
function getTransport(config: Record<string, unknown>): "stdio" | "http" | "sse" | "unknown" {
  if (config.command || config.cmd) return "stdio";
  if (config.type === "http" || (config.url && typeof config.url === "string" && config.url.startsWith("http"))) return "http";
  if (config.type === "sse") return "sse";
  return "unknown";
}

/**
 * Identify a service type from an MCP server name.
 */
function identifyService(serverName: string): { serviceType: string; name: string } | null {
  for (const { pattern, serviceType, name } of SERVICE_PATTERNS) {
    if (pattern.test(serverName)) {
      return { serviceType, name };
    }
  }
  return null;
}

/**
 * Extract MCP servers from a config object. Handles both formats:
 *   { "mcpServers": { ... } }   — Claude Desktop / .mcp.json standard
 *   { "serverName": { ... } }   — some .mcp.json files use flat format
 */
function extractMcpServers(
  config: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  // Standard format: { mcpServers: { name: config } }
  if (config.mcpServers && typeof config.mcpServers === "object") {
    return config.mcpServers as Record<string, Record<string, unknown>>;
  }

  // Flat format: each key is a server name with a config object value
  // Filter out non-server keys by checking if values look like server configs
  const servers: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of Object.entries(config)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      // Must have either command (stdio) or url/type (http/sse)
      (("command" in (value as Record<string, unknown>)) ||
       ("cmd" in (value as Record<string, unknown>)) ||
       ("url" in (value as Record<string, unknown>)) ||
       ("type" in (value as Record<string, unknown>)))
    ) {
      servers[key] = value as Record<string, unknown>;
    }
  }
  return servers;
}

// ─── Scanners ───────────────────────────────────────────────────────────────

/**
 * Scan Claude Desktop config for MCP servers.
 */
async function scanClaudeDesktop(
  result: DetectionResult
): Promise<void> {
  const configPath = join(
    homedir(),
    "Library",
    "Application Support",
    "Claude",
    "claude_desktop_config.json"
  );
  result.scannedPaths.push(configPath);

  const config = await readJsonFile(configPath);
  if (!config) return;

  const servers = extractMcpServers(config);
  for (const [name, serverConfig] of Object.entries(servers)) {
    const service = identifyService(name);
    if (name.toLowerCase() === "cortex") continue;
    const integration: DetectedIntegration = {
      id: `claude_desktop:${name}`,
      name: service?.name || formatServerName(name),
      serviceType: service?.serviceType || name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      detectedVia: "claude_desktop",
      detectedViaLabel: "Claude Desktop",
      configPath,
      mcpServerName: name,
      transport: getTransport(serverConfig),
      hasConnector: CONNECTABLE_SERVICES.has(service?.serviceType || ""),
      serverConfig,
    };
    result.integrations.push(integration);
  }
}

/**
 * Scan Claude Code settings for enabled plugins that have MCP servers.
 */
async function scanClaudeCode(
  result: DetectionResult
): Promise<void> {
  const settingsPath = join(homedir(), ".claude", "settings.json");
  result.scannedPaths.push(settingsPath);

  const settings = await readJsonFile(settingsPath);
  if (!settings) return;

  // Check enabledPlugins to find which plugins are active
  const enabledPlugins = settings.enabledPlugins as Record<string, boolean> | undefined;
  if (!enabledPlugins) return;

  for (const [pluginKey, enabled] of Object.entries(enabledPlugins)) {
    if (!enabled) continue;

    // Plugin key format: "name@marketplace"
    const [pluginName, marketplace] = pluginKey.split("@");
    if (!pluginName || !marketplace) continue;

    // Check for MCP config in the plugin directory
    // Plugins can be in: plugins/marketplaces/{marketplace}/plugins/{name}/
    //                 or: plugins/marketplaces/{marketplace}/external_plugins/{name}/
    const pluginDirs = [
      join(homedir(), ".claude", "plugins", "marketplaces", marketplace, "plugins", pluginName),
      join(homedir(), ".claude", "plugins", "marketplaces", marketplace, "external_plugins", pluginName),
    ];

    for (const pluginDir of pluginDirs) {
      const mcpPath = join(pluginDir, ".mcp.json");
      if (!existsSync(mcpPath)) continue;

      result.scannedPaths.push(mcpPath);
      const mcpConfig = await readJsonFile(mcpPath);
      if (!mcpConfig) continue;

      const servers = extractMcpServers(mcpConfig);
      for (const [name, serverConfig] of Object.entries(servers)) {
        const service = identifyService(name);
        if (name.toLowerCase() === "cortex") continue;
        const integration: DetectedIntegration = {
          id: `claude_code:${name}`,
          name: service?.name || formatServerName(name),
          serviceType: service?.serviceType || name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
          detectedVia: "claude_code",
          detectedViaLabel: "Claude Code",
          configPath: mcpPath,
          mcpServerName: name,
          transport: getTransport(serverConfig),
          hasConnector: CONNECTABLE_SERVICES.has(service?.serviceType || ""),
          serverConfig,
        };
        result.integrations.push(integration);
      }
    }
  }
}

/**
 * Scan global ~/.mcp.json for user-level MCP servers.
 */
async function scanGlobalMcp(
  result: DetectionResult
): Promise<void> {
  const mcpPath = join(homedir(), ".mcp.json");
  result.scannedPaths.push(mcpPath);

  const config = await readJsonFile(mcpPath);
  if (!config) return;

  const servers = extractMcpServers(config);
  for (const [name, serverConfig] of Object.entries(servers)) {
    const service = identifyService(name);
    if (name.toLowerCase() === "cortex") continue;
    const integration: DetectedIntegration = {
      id: `claude_code:${name}`,
      name: service?.name || formatServerName(name),
      serviceType: service?.serviceType || name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      detectedVia: "claude_code",
      detectedViaLabel: "Claude Code",
      configPath: mcpPath,
      mcpServerName: name,
      transport: getTransport(serverConfig),
      hasConnector: CONNECTABLE_SERVICES.has(service?.serviceType || ""),
      serverConfig,
    };
    result.integrations.push(integration);
  }
}

/**
 * Scan for Claude.ai built-in integrations.
 * Claude.ai manages MCP integrations server-side, not in local config.
 * We detect their presence by checking if known Claude.ai MCP tools exist
 * in the environment (e.g., the conversation has Gmail, Google Drive tools).
 *
 * Since we can't directly query Claude.ai's server, we look for hints:
 * - CLAUDE_AI_INTEGRATIONS env var (set by users who know what they have)
 * - Known cookie/session files that indicate Claude.ai account
 */
async function scanClaudeAi(
  result: DetectionResult
): Promise<void> {
  // Check for user-declared Claude.ai integrations via env var
  // Format: CLAUDE_AI_INTEGRATIONS="gmail,google_drive,figma"
  const envIntegrations = process.env.CLAUDE_AI_INTEGRATIONS;
  if (envIntegrations) {
    const services = envIntegrations.split(",").map((s) => s.trim().toLowerCase());
    for (const serviceName of services) {
      const service = identifyService(serviceName);
      const integration: DetectedIntegration = {
        id: `claude_ai:${serviceName}`,
        name: service?.name || formatServerName(serviceName),
        serviceType: service?.serviceType || serviceName,
        detectedVia: "claude_ai",
        detectedViaLabel: "Claude.ai",
        configPath: "env:CLAUDE_AI_INTEGRATIONS",
        mcpServerName: serviceName,
        transport: "http",
        hasConnector: CONNECTABLE_SERVICES.has(service?.serviceType || serviceName),
        serverConfig: {},
      };
      result.integrations.push(integration);
    }
  }
}

/**
 * Scan project-level .mcp.json files in the current working directory
 * and parent directories.
 */
async function scanProjectMcp(
  result: DetectionResult
): Promise<void> {
  // Check CWD and parent directories for .mcp.json
  const candidates = [
    join(process.cwd(), ".mcp.json"),
  ];

  for (const mcpPath of candidates) {
    result.scannedPaths.push(mcpPath);
    const config = await readJsonFile(mcpPath);
    if (!config) continue;

    const servers = extractMcpServers(config);
    for (const [name, serverConfig] of Object.entries(servers)) {
      const service = identifyService(name);
      if (name.toLowerCase() === "cortex") continue;
      const integration: DetectedIntegration = {
        id: `claude_code:${name}`,
        name: service?.name || formatServerName(name),
        serviceType: service?.serviceType || name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        detectedVia: "claude_code",
        detectedViaLabel: "Claude Code (project)",
        configPath: mcpPath,
        mcpServerName: name,
        transport: getTransport(serverConfig),
        hasConnector: CONNECTABLE_SERVICES.has(service?.serviceType || ""),
        serverConfig,
      };
      result.integrations.push(integration);
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Scan all known AI tool configuration locations and return detected
 * integrations. This is the main entry point.
 */
export async function detectIntegrations(): Promise<DetectionResult> {
  const result: DetectionResult = {
    integrations: [],
    scannedPaths: [],
    errors: [],
  };

  // Run all scanners, catching individual failures
  const scanners = [
    { name: "Claude Desktop", fn: scanClaudeDesktop },
    { name: "Claude Code", fn: scanClaudeCode },
    { name: "Global MCP", fn: scanGlobalMcp },
    { name: "Claude.ai", fn: scanClaudeAi },
    { name: "Project MCP", fn: scanProjectMcp },
  ];

  for (const scanner of scanners) {
    try {
      await scanner.fn(result);
    } catch (err) {
      result.errors.push(
        `${scanner.name} scan failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Deduplicate by id (same server detected from multiple paths)
  const seen = new Set<string>();
  result.integrations = result.integrations.filter((integration) => {
    if (seen.has(integration.id)) return false;
    seen.add(integration.id);
    return true;
  });

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a snake_case or kebab-case server name to a readable label.
 */
function formatServerName(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
