import { createHash } from "crypto";
import type { Connector, ConnectorDefinition, ConfigField, ScanResult } from "./types";

// ─── Gmail Connector ────────────────────────────────────────────────────────
//
// Scans Gmail for emails that may contain information about the user.
// This connector works in two modes:
//
// 1. MCP Mode (preferred): When Claude.ai or another AI tool has Gmail
//    connected via MCP, this connector can use the MCP bridge to read
//    emails. The AI tool acts as the OAuth proxy — no credentials needed
//    in Cortex itself.
//
// 2. IMAP Mode (fallback): Direct IMAP access using app-specific passwords.
//    Requires the user to generate an app password from their Google account.
//    This mode does NOT require OAuth — just email + app password.
//
// What gets scanned:
//   - Sent emails (reveals user's communication patterns, projects, contacts)
//   - Starred/important emails (signals what matters to the user)
//   - Specific label queries (e.g., "label:receipts" for purchase history)
//
// What does NOT get scanned:
//   - Spam/trash
//   - Promotional emails (unless explicitly configured)
//   - Email bodies over 10KB (likely newsletters/automated)
//
// Privacy: Only email metadata + snippets are extracted. Full bodies are
// only read when the snippet suggests personal context. All data stays local.

export const GMAIL_CONFIG_FIELDS: ConfigField[] = [
  {
    key: "mode",
    label: "Connection Mode",
    type: "select",
    required: true,
    helpText: "MCP mode uses your AI tool's existing connection. IMAP requires an app password.",
    options: [
      { label: "MCP Bridge (via Claude/ChatGPT)", value: "mcp" },
      { label: "IMAP Direct", value: "imap" },
    ],
  },
  {
    key: "email",
    label: "Email Address",
    type: "text",
    placeholder: "you@gmail.com",
    required: true,
  },
  {
    key: "appPassword",
    label: "App Password",
    type: "password",
    placeholder: "xxxx xxxx xxxx xxxx",
    required: false,
    helpText: "Required for IMAP mode. Generate at myaccount.google.com/apppasswords",
  },
  {
    key: "labels",
    label: "Labels to Scan",
    type: "text",
    placeholder: "INBOX, SENT, STARRED",
    required: false,
    helpText: "Comma-separated Gmail labels. Defaults to SENT and STARRED.",
  },
  {
    key: "maxResults",
    label: "Max Emails per Scan",
    type: "number",
    placeholder: "50",
    required: false,
    helpText: "Limit how many emails are scanned per run. Default: 50.",
  },
];

const definition: ConnectorDefinition = {
  id: "gmail",
  name: "Gmail",
  type: "gmail",
  sourceService: "standalone",
  description:
    "Scan sent and starred emails for context about projects, contacts, and communication patterns.",
  configSchema: Object.fromEntries(
    GMAIL_CONFIG_FIELDS.map((f) => [f.key, { type: f.type, required: f.required }])
  ),
};

export const gmailConnector: Connector = {
  definition,

  validateConfig(config) {
    const mode = config.mode as string | undefined;
    const email = config.email as string | undefined;

    if (!email || !email.includes("@")) {
      return "A valid email address is required.";
    }

    if (mode === "imap") {
      const appPassword = config.appPassword as string | undefined;
      if (!appPassword || appPassword.replace(/\s/g, "").length < 12) {
        return "IMAP mode requires a valid app password. Generate one at myaccount.google.com/apppasswords";
      }
    }

    return null;
  },

  async testConnection(config) {
    const mode = (config.mode as string) || "mcp";

    if (mode === "mcp") {
      // In MCP mode, we'd verify the MCP bridge can reach Gmail.
      // This would call the MCP server's Gmail tools to check access.
      // Stub: return false until MCP bridge is implemented.
      console.log("[gmail] MCP connection test — not yet implemented");
      return false;
    }

    // IMAP mode: attempt to connect to imap.gmail.com
    // Implementation would use node's tls module or an IMAP library like imapflow:
    //
    //   const client = new ImapFlow({
    //     host: 'imap.gmail.com',
    //     port: 993,
    //     secure: true,
    //     auth: { user: config.email, pass: config.appPassword },
    //   });
    //   await client.connect();
    //   await client.logout();
    //   return true;
    //
    console.log("[gmail] IMAP connection test — not yet implemented");
    return false;
  },

  async scan(config): Promise<ScanResult> {
    const mode = (config.mode as string) || "mcp";
    const email = config.email as string;
    const labels = ((config.labels as string) || "SENT,STARRED")
      .split(",")
      .map((l) => l.trim());
    const maxResults = (config.maxResults as number) || 50;

    // Stub implementation — returns empty results.
    // When fully implemented, this would:
    //
    // 1. Connect via IMAP or MCP bridge
    // 2. For each label, fetch the most recent `maxResults` messages
    // 3. Extract subject, snippet, sender/recipient, date
    // 4. For sent emails, extract the body text (user's own words)
    // 5. Hash content for dedup
    // 6. Return as ScannedItems for the extraction pipeline

    console.log(
      `[gmail] Scanning ${email} — labels: ${labels.join(", ")}, max: ${maxResults}, mode: ${mode}`
    );

    return {
      connectorId: "gmail",
      items: [],
      scannedAt: new Date(),
      itemsScanned: 0,
      errors: [`Gmail ${mode} scanning not yet implemented`],
    };
  },
};

// ─── Utility: hash email content ────────────────────────────────────────────
export function hashEmailContent(subject: string, body: string, date: string): string {
  return createHash("sha256")
    .update(`${subject}|${body}|${date}`)
    .digest("hex");
}
