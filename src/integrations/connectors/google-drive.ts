import { createHash } from "crypto";
import type { Connector, ConnectorDefinition, ConfigField, ScanResult } from "./types";

// ─── Google Drive Connector ─────────────────────────────────────────────────
//
// Scans Google Drive documents for knowledge about the user.
// Targets docs that the user has authored or recently edited.
//
// Connection modes:
//   - MCP Bridge: Uses ChatGPT or Claude's existing Google Drive integration
//   - Service Account: Direct API access via a Google Cloud service account
//   - OAuth: Browser-based OAuth flow (requires client ID/secret)
//
// What gets scanned:
//   - Google Docs owned by the user (project notes, specs, journals)
//   - Recently modified documents (last 30 days by default)
//   - Specific folders if configured
//
// What does NOT get scanned:
//   - Shared-with-me docs (unless explicitly configured)
//   - Spreadsheets/Slides (typically less personal context)
//   - Files over 100KB (likely data dumps, not personal writing)

export const GOOGLE_DRIVE_CONFIG_FIELDS: ConfigField[] = [
  {
    key: "mode",
    label: "Connection Mode",
    type: "select",
    required: true,
    helpText: "MCP uses your AI tool's connection. Service Account requires a JSON key file.",
    options: [
      { label: "MCP Bridge (via Claude/ChatGPT)", value: "mcp" },
      { label: "Service Account", value: "service_account" },
    ],
  },
  {
    key: "serviceAccountKeyPath",
    label: "Service Account Key Path",
    type: "path",
    placeholder: "/path/to/service-account.json",
    required: false,
    helpText: "Path to the Google Cloud service account JSON key. Only for Service Account mode.",
  },
  {
    key: "folderIds",
    label: "Folder IDs to Scan",
    type: "text",
    placeholder: "folder-id-1, folder-id-2",
    required: false,
    helpText: "Comma-separated Google Drive folder IDs. Leave empty to scan all owned docs.",
  },
  {
    key: "fileTypes",
    label: "File Types",
    type: "text",
    placeholder: "document, spreadsheet",
    required: false,
    helpText: "Comma-separated MIME type shortcuts. Default: document only.",
  },
  {
    key: "lookbackDays",
    label: "Lookback Period (days)",
    type: "number",
    placeholder: "30",
    required: false,
    helpText: "How far back to scan for modified documents. Default: 30 days.",
  },
];

const definition: ConnectorDefinition = {
  id: "google_drive",
  name: "Google Drive",
  type: "google_drive",
  sourceService: "standalone",
  description:
    "Preview connector. Google Drive scanning is not implemented yet.",
  configSchema: Object.fromEntries(
    GOOGLE_DRIVE_CONFIG_FIELDS.map((f) => [f.key, { type: f.type, required: f.required }])
  ),
};

export const googleDriveConnector: Connector = {
  definition,

  validateConfig(config) {
    const mode = config.mode as string | undefined;

    if (mode === "service_account") {
      const keyPath = config.serviceAccountKeyPath as string | undefined;
      if (!keyPath) {
        return "Service Account mode requires a path to the JSON key file.";
      }
    }

    return null;
  },

  async testConnection(config) {
    const mode = (config.mode as string) || "mcp";

    if (mode === "mcp") {
      // Would verify the MCP bridge can list files from Drive.
      console.log("[google-drive] MCP connection test — not yet implemented");
      return false;
    }

    // Service account mode: load the key and attempt to list files
    // Implementation would use googleapis:
    //
    //   const auth = new google.auth.GoogleAuth({
    //     keyFile: config.serviceAccountKeyPath,
    //     scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    //   });
    //   const drive = google.drive({ version: 'v3', auth });
    //   await drive.files.list({ pageSize: 1 });
    //   return true;
    //
    console.log("[google-drive] Service Account connection test — not yet implemented");
    return false;
  },

  async scan(config): Promise<ScanResult> {
    const mode = (config.mode as string) || "mcp";
    const lookbackDays = (config.lookbackDays as number) || 30;

    // Stub implementation.
    // When fully implemented, this would:
    //
    // 1. Authenticate via MCP bridge or service account
    // 2. List recently modified Google Docs (within lookbackDays)
    // 3. Filter by configured folders and file types
    // 4. Export each doc as plain text
    // 5. Hash content for dedup
    // 6. Return as ScannedItems

    console.log(
      `[google-drive] Scanning — mode: ${mode}, lookback: ${lookbackDays} days`
    );

    return {
      connectorId: "google_drive",
      items: [],
      scannedAt: new Date(),
      itemsScanned: 0,
      errors: [`Google Drive ${mode} scanning not yet implemented`],
    };
  },
};

export function hashDocContent(title: string, content: string): string {
  return createHash("sha256")
    .update(`${title}|${content}`)
    .digest("hex");
}
