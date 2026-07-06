import { z } from "zod";

// ─── Connector Types ────────────────────────────────────────────────────────
// A "Connector" represents an external service that an AI tool has access to.
// For example, Claude.ai connected to Gmail via MCP, or ChatGPT with Google Drive.
// Connectors scan data from these services to extract memories about the user.

export const ConnectorTypeSchema = z.enum([
  "gmail",
  "google_drive",
  "notion",
  "slack",
  "granola",
  "custom",
]);
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>;

export const ConnectorSourceServiceSchema = z.enum([
  "claude",
  "chatgpt",
  "poke",
  "standalone",
]);
export type ConnectorSourceService = z.infer<typeof ConnectorSourceServiceSchema>;

export const ConnectorStatusSchema = z.enum([
  "available",
  "connected",
  "error",
]);
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;

// ─── Connector Definition ───────────────────────────────────────────────────
// Static metadata about what a connector is and what it needs.

export const ConnectorDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ConnectorTypeSchema,
  sourceService: ConnectorSourceServiceSchema,
  description: z.string(),
  configSchema: z.record(z.string(), z.unknown()),
});
export type ConnectorDefinition = z.infer<typeof ConnectorDefinitionSchema>;

// ─── Connector Instance ─────────────────────────────────────────────────────
// A configured connector with runtime status and saved config.

export const ConnectorInstanceSchema = ConnectorDefinitionSchema.extend({
  status: ConnectorStatusSchema,
  config: z.record(z.string(), z.unknown()),
  lastScanAt: z.coerce.date().nullable(),
  error: z.string().nullable(),
});
export type ConnectorInstance = z.infer<typeof ConnectorInstanceSchema>;

// ─── Scanned Item ───────────────────────────────────────────────────────────
// The normalized output from a connector scan. Each item is a piece of content
// that can be fed into the extraction pipeline to produce memories.

export const ScannedItemSchema = z.object({
  externalId: z.string(),
  title: z.string().nullable(),
  content: z.string(),
  contentHash: z.string(),
  sourceDate: z.coerce.date().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ScannedItem = z.infer<typeof ScannedItemSchema>;

// ─── Scan Result ────────────────────────────────────────────────────────────

export const ScanResultSchema = z.object({
  connectorId: z.string(),
  items: z.array(ScannedItemSchema),
  scannedAt: z.coerce.date(),
  itemsScanned: z.number(),
  errors: z.array(z.string()),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

// ─── Connector Interface ────────────────────────────────────────────────────
// Every connector must implement this interface. The registry uses it to
// discover connectors and the pipeline uses scan() to pull data.

export interface Connector {
  /** Static definition: id, name, type, configSchema, etc. */
  definition: ConnectorDefinition;

  /**
   * Validate that the provided config is sufficient to connect.
   * Returns null if valid, or an error message if not.
   */
  validateConfig(config: Record<string, unknown>): string | null;

  /**
   * Test the connection with the given config.
   * Returns true if the connector can reach the service, false otherwise.
   */
  testConnection(config: Record<string, unknown>): Promise<boolean>;

  /**
   * Scan the service for content that may contain user memories.
   * The connector decides what to scan (recent emails, notes, docs, etc.)
   * and returns normalized ScannedItems.
   */
  scan(config: Record<string, unknown>): Promise<ScanResult>;
}

// ─── Config Field Schema ────────────────────────────────────────────────────
// Used by the UI to render config forms for each connector.

export const ConfigFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "password", "path", "number", "select"]),
  placeholder: z.string().optional(),
  required: z.boolean().default(true),
  helpText: z.string().optional(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
});
export type ConfigField = z.infer<typeof ConfigFieldSchema>;
