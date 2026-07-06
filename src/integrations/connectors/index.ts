// ─── Connectors barrel file ─────────────────────────────────────────────────
export type {
  Connector,
  ConnectorDefinition,
  ConnectorInstance,
  ConnectorType,
  ConnectorSourceService,
  ConnectorStatus,
  ConfigField,
  ScannedItem,
  ScanResult,
} from "./types";

export {
  ConnectorTypeSchema,
  ConnectorSourceServiceSchema,
  ConnectorStatusSchema,
  ConnectorDefinitionSchema,
  ConnectorInstanceSchema,
  ScannedItemSchema,
  ScanResultSchema,
  ConfigFieldSchema,
} from "./types";

export {
  getConnector,
  listConnectors,
  configureConnector,
  disconnectConnector,
  scanConnector,
  getConnectorConfig,
} from "./registry";

export { gmailConnector, GMAIL_CONFIG_FIELDS } from "./gmail";
export { googleDriveConnector, GOOGLE_DRIVE_CONFIG_FIELDS } from "./google-drive";
export { notionConnector, NOTION_CONFIG_FIELDS } from "./notion";
export { granolaConnector, GRANOLA_CONFIG_FIELDS } from "./granola";

export { detectIntegrations } from "./auto-detect";
export type { DetectedIntegration, DetectionResult } from "./auto-detect";
