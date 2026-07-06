import { createHash } from "crypto";
import type { Connector, ConnectorDefinition, ConfigField, ScanResult } from "./types";

// ─── Notion Connector ───────────────────────────────────────────────────────
//
// Scans Notion pages and databases for user context.
// Notion is commonly used as a personal wiki, project tracker, and journal.
//
// Connection: Requires a Notion integration token. The user creates an
// internal integration at https://www.notion.so/my-integrations, then shares
// specific pages/databases with that integration.
//
// What gets scanned:
//   - Pages shared with the integration (journal entries, notes, specs)
//   - Database entries (project trackers, reading lists, habit logs)
//   - Recently edited content (configurable lookback period)
//
// Notion API returns blocks, which we flatten to plain text for extraction.

export const NOTION_CONFIG_FIELDS: ConfigField[] = [
  {
    key: "apiToken",
    label: "Integration Token",
    type: "password",
    placeholder: "ntn_...",
    required: true,
    helpText:
      "Create an internal integration at notion.so/my-integrations, then share pages with it.",
  },
  {
    key: "rootPageIds",
    label: "Root Page IDs",
    type: "text",
    placeholder: "page-id-1, page-id-2",
    required: false,
    helpText:
      "Comma-separated Notion page IDs to scan. Leave empty to scan all shared pages.",
  },
  {
    key: "includeDatabases",
    label: "Include Databases",
    type: "select",
    required: false,
    helpText: "Whether to scan database entries in addition to pages.",
    options: [
      { label: "Yes", value: "true" },
      { label: "No", value: "false" },
    ],
  },
  {
    key: "lookbackDays",
    label: "Lookback Period (days)",
    type: "number",
    placeholder: "30",
    required: false,
    helpText: "Only scan pages modified within this window. Default: 30 days.",
  },
];

const definition: ConnectorDefinition = {
  id: "notion",
  name: "Notion",
  type: "notion",
  sourceService: "standalone",
  description:
    "Preview connector. Notion scanning is not implemented yet.",
  configSchema: Object.fromEntries(
    NOTION_CONFIG_FIELDS.map((f) => [f.key, { type: f.type, required: f.required }])
  ),
};

export const notionConnector: Connector = {
  definition,

  validateConfig(config) {
    const token = config.apiToken as string | undefined;
    if (!token || !token.startsWith("ntn_")) {
      return "A valid Notion integration token is required (starts with ntn_).";
    }
    return null;
  },

  async testConnection() {
    // Implementation would use the Notion API:
    //
    //   const notion = new Client({ auth: config.apiToken });
    //   const response = await notion.users.me({});
    //   return !!response.id;
    //
    console.log("[notion] Connection test — not yet implemented");
    return false;
  },

  async scan(config): Promise<ScanResult> {
    const lookbackDays = (config.lookbackDays as number) || 30;

    // Stub implementation.
    // When fully implemented, this would:
    //
    // 1. Connect to Notion API with the integration token
    // 2. Search for pages modified within the lookback window
    // 3. For each page, retrieve all blocks and flatten to text
    // 4. For databases, retrieve entries and serialize properties + content
    // 5. Hash content for dedup
    // 6. Return as ScannedItems

    console.log(`[notion] Scanning — lookback: ${lookbackDays} days`);

    return {
      connectorId: "notion",
      items: [],
      scannedAt: new Date(),
      itemsScanned: 0,
      errors: ["Notion scanning not yet implemented"],
    };
  },
};

export function hashNotionPage(pageId: string, content: string): string {
  return createHash("sha256")
    .update(`${pageId}|${content}`)
    .digest("hex");
}
