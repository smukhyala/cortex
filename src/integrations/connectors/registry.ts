import type { Connector, ConnectorInstance, ConnectorStatus, ScanResult } from "./types";
import { gmailConnector } from "./gmail";
import { googleDriveConnector } from "./google-drive";
import { notionConnector } from "./notion";
import { granolaConnector } from "./granola";

// ─── Connector Registry ─────────────────────────────────────────────────────
// Central registry for all available connectors. New connectors are registered
// here and become automatically available in the API and UI.
//
// Adding a new connector:
//   1. Create src/integrations/connectors/my-connector.ts
//   2. Implement the Connector interface
//   3. Import and add to CONNECTORS below
//   4. That's it — the registry, API, and UI pick it up automatically.

const CONNECTORS: Connector[] = [
  gmailConnector,
  googleDriveConnector,
  notionConnector,
  granolaConnector,
];

// In-memory config store. In production, this would be backed by the database.
// Keys are connector IDs, values are the user's saved configuration.
const configStore = new Map<string, Record<string, unknown>>();
const statusStore = new Map<string, { status: ConnectorStatus; error: string | null; lastScanAt: Date | null }>();

// ─── Registry API ───────────────────────────────────────────────────────────

/**
 * Get a connector by ID.
 */
export function getConnector(id: string): Connector | undefined {
  return CONNECTORS.find((c) => c.definition.id === id);
}

/**
 * List all registered connectors with their current status.
 */
export function listConnectors(): ConnectorInstance[] {
  return CONNECTORS.map((connector) => {
    const { definition } = connector;
    const saved = configStore.get(definition.id);
    const state = statusStore.get(definition.id);

    return {
      ...definition,
      status: state?.status ?? "available",
      config: saved ?? {},
      lastScanAt: state?.lastScanAt ?? null,
      error: state?.error ?? null,
    };
  });
}

/**
 * Save configuration for a connector and attempt to validate + test it.
 */
export async function configureConnector(
  id: string,
  config: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const connector = getConnector(id);
  if (!connector) {
    return { success: false, error: `Unknown connector: ${id}` };
  }

  // Validate config
  const validationError = connector.validateConfig(config);
  if (validationError) {
    statusStore.set(id, { status: "error", error: validationError, lastScanAt: null });
    return { success: false, error: validationError };
  }

  // Save config
  configStore.set(id, config);

  // Test connection
  try {
    const connected = await connector.testConnection(config);
    statusStore.set(id, {
      status: connected ? "connected" : "available",
      error: connected ? null : "Connection test failed — service may not be reachable yet.",
      lastScanAt: null,
    });

    return {
      success: true,
      error: connected ? undefined : "Configuration saved, but connection test failed. The connector may work when the service is available.",
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    statusStore.set(id, { status: "error", error: errorMsg, lastScanAt: null });
    return { success: false, error: errorMsg };
  }
}

/**
 * Remove configuration for a connector, resetting it to "available".
 */
export function disconnectConnector(id: string): boolean {
  const connector = getConnector(id);
  if (!connector) return false;

  configStore.delete(id);
  statusStore.delete(id);
  return true;
}

/**
 * Run a scan on a configured connector.
 */
export async function scanConnector(id: string): Promise<ScanResult> {
  const connector = getConnector(id);
  if (!connector) {
    throw new Error(`Unknown connector: ${id}`);
  }

  const config = configStore.get(id);
  if (!config) {
    throw new Error(`Connector ${id} is not configured. Call configureConnector() first.`);
  }

  try {
    const result = await connector.scan(config);
    statusStore.set(id, {
      status: "connected",
      error: null,
      lastScanAt: new Date(),
    });
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    statusStore.set(id, {
      status: "error",
      error: errorMsg,
      lastScanAt: statusStore.get(id)?.lastScanAt ?? null,
    });
    throw err;
  }
}

/**
 * Get the saved configuration for a connector (with sensitive fields masked).
 */
export function getConnectorConfig(id: string): Record<string, unknown> | null {
  const config = configStore.get(id);
  if (!config) return null;

  // Mask sensitive fields
  const masked = { ...config };
  for (const key of Object.keys(masked)) {
    if (
      key.toLowerCase().includes("password") ||
      key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("secret") ||
      key.toLowerCase().includes("key")
    ) {
      const value = masked[key];
      if (typeof value === "string" && value.length > 4) {
        masked[key] = value.slice(0, 4) + "..." + value.slice(-2);
      }
    }
  }
  return masked;
}
