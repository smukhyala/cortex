"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle, XCircle, Zap, Server, RefreshCw, User, HardDrive, Loader2, Mail, FileText, StickyNote, MessageSquare, Plug, Settings2, Unplug, ArrowLeft, Scan, Sparkles, ExternalLink, Pencil, Check, X, AlertTriangle } from "lucide-react";
import { FileUpload } from "@/components/features/file-upload";
import { SOURCE_TYPE_DISPLAY } from "@/contracts/source";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogMedia,
} from "@/components/ui/alert-dialog";

interface Source {
  id: string;
  type: string;
  name: string;
  status: string;
  config: string;
  lastSyncAt: string | null;
  accountLabel?: string;
  _count: { memories: number };
}

interface StatusData {
  connections: Record<string, { connected: boolean; label: string; description: string }>;
  stats: { memories: number; pending: number; sources: number; lastSync: string | null };
  cortexMcp?: {
    installed: number;
    total: number;
    needsRepair: boolean;
  };
}

interface Account {
  id: string | null;
  name: string;
  type: string;
  path: string;
  exists: boolean;
  registered: boolean;
  sourceId: string | null;
  memoryCount: number;
}

interface ConnectorData {
  id: string;
  name: string;
  type: string;
  sourceService: string;
  description: string;
  status: "available" | "connected" | "error";
  config: Record<string, unknown>;
  configSchema: Record<string, unknown>;
  lastScanAt: string | null;
  error: string | null;
}

interface DetectedIntegrationData {
  id: string;
  name: string;
  serviceType: string;
  detectedVia: string;
  detectedViaLabel: string;
  configPath: string;
  mcpServerName: string;
  transport: string;
  hasConnector: boolean;
}

interface CategoryDef {
  slug: string;
  label: string;
  color: string;
}

interface ExchangePolicy {
  destination: string;
  mode: "all" | "allow_only" | "block";
  allowedCategories: string[];
  blockedCategories: string[];
  naturalLanguageRule?: string;
}

interface ExchangeDestinationConfig {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  destination: string;
  policy: ExchangePolicy;
}

interface McpTargetStatus {
  target: "claude_desktop" | "claude_code";
  label: string;
  path: string;
  status: "installed" | "missing" | "drifted" | "invalid_json";
  error?: string;
}

interface McpConfigStatus {
  targets: McpTargetStatus[];
  summary: { installed: number; total: number; needsRepair: boolean };
  pokeHttp: { url: string; healthUrl: string };
}

const DETECTED_VIA_COLORS: Record<string, string> = {
  claude_code: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  claude_desktop: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  claude_ai: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  chatgpt: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

const CONNECTOR_ICONS: Record<string, typeof Mail> = {
  gmail: Mail,
  google_drive: FileText,
  notion: StickyNote,
  granola: MessageSquare,
};

const CONNECTOR_CONFIG_FIELDS: Record<string, Array<{
  key: string;
  label: string;
  type: "text" | "password" | "path" | "number" | "select";
  placeholder?: string;
  required: boolean;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
}>> = {
  gmail: [
    { key: "mode", label: "Connection Mode", type: "select", required: true, helpText: "MCP uses your AI tool's existing connection. IMAP requires an app password.", options: [{ label: "MCP Bridge (via Claude/ChatGPT)", value: "mcp" }, { label: "IMAP Direct", value: "imap" }] },
    { key: "email", label: "Email Address", type: "text", placeholder: "you@gmail.com", required: true },
    { key: "appPassword", label: "App Password", type: "password", placeholder: "xxxx xxxx xxxx xxxx", required: false, helpText: "Required for IMAP mode. Generate at myaccount.google.com/apppasswords" },
    { key: "labels", label: "Labels to Scan", type: "text", placeholder: "INBOX, SENT, STARRED", required: false, helpText: "Comma-separated Gmail labels. Defaults to SENT and STARRED." },
    { key: "maxResults", label: "Max Emails per Scan", type: "number", placeholder: "50", required: false, helpText: "Limit how many emails are scanned per run. Default: 50." },
  ],
  google_drive: [
    { key: "mode", label: "Connection Mode", type: "select", required: true, helpText: "MCP uses your AI tool's connection. Service Account requires a JSON key file.", options: [{ label: "MCP Bridge (via Claude/ChatGPT)", value: "mcp" }, { label: "Service Account", value: "service_account" }] },
    { key: "serviceAccountKeyPath", label: "Service Account Key Path", type: "path", placeholder: "/path/to/service-account.json", required: false, helpText: "Path to the Google Cloud service account JSON key. Only for Service Account mode." },
    { key: "folderIds", label: "Folder IDs to Scan", type: "text", placeholder: "folder-id-1, folder-id-2", required: false, helpText: "Comma-separated Google Drive folder IDs. Leave empty to scan all owned docs." },
    { key: "lookbackDays", label: "Lookback Period (days)", type: "number", placeholder: "30", required: false, helpText: "How far back to scan for modified documents. Default: 30 days." },
  ],
  notion: [
    { key: "apiToken", label: "Integration Token", type: "password", placeholder: "ntn_...", required: true, helpText: "Create an internal integration at notion.so/my-integrations, then share pages with it." },
    { key: "rootPageIds", label: "Root Page IDs", type: "text", placeholder: "page-id-1, page-id-2", required: false, helpText: "Comma-separated Notion page IDs to scan. Leave empty to scan all shared pages." },
    { key: "lookbackDays", label: "Lookback Period (days)", type: "number", placeholder: "30", required: false, helpText: "Only scan pages modified within this window. Default: 30 days." },
  ],
  granola: [
    { key: "directoryPath", label: "Notes Directory", type: "path", placeholder: "~/Documents/Granola", required: true, helpText: "Path to the directory where Granola saves meeting notes as markdown files." },
    { key: "filePattern", label: "File Pattern", type: "text", placeholder: "*.md", required: false, helpText: "Glob pattern for files to scan. Default: *.md" },
    { key: "lookbackDays", label: "Lookback Period (days)", type: "number", placeholder: "30", required: false, helpText: "Only scan files modified within this window. Default: 30 days." },
  ],
};

export default function SettingsPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [addDialog, setAddDialog] = useState(false);
  const [newSource, setNewSource] = useState({ type: "claude_code", name: "", path: "" });
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [addAccountDialog, setAddAccountDialog] = useState(false);
  const [addAccountStep, setAddAccountStep] = useState<"type" | "details">("type");
  const [uploadComplete, setUploadComplete] = useState(false);
  const [newAccount, setNewAccount] = useState({ name: "", type: "claude_code", path: "", key: "" });
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [registeringPath, setRegisteringPath] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<ConnectorData[]>([]);
  const [configDialog, setConfigDialog] = useState<ConnectorData | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [detectedIntegrations, setDetectedIntegrations] = useState<DetectedIntegrationData[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [hasDetected, setHasDetected] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");
  const [resetting, setResetting] = useState(false);
  const [policyCategories, setPolicyCategories] = useState<CategoryDef[]>([]);
  const [exchangeDestinations, setExchangeDestinations] = useState<ExchangeDestinationConfig[]>([]);
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, ExchangePolicy>>({});
  const [policyText, setPolicyText] = useState<Record<string, string>>({});
  const [savingPolicyId, setSavingPolicyId] = useState<string | null>(null);
  const [mcpConfig, setMcpConfig] = useState<McpConfigStatus | null>(null);
  const [repairingMcp, setRepairingMcp] = useState(false);
  const [bootstrapInstructions, setBootstrapInstructions] = useState("");
  const [claudeAiConnector, setClaudeAiConnector] = useState<{
    connectorName: string;
    localMcpUrl: string;
    publicMcpUrl: string | null;
    configured: boolean;
    setupInstructions: string[];
  } | null>(null);

  useEffect(() => {
    fetchSources();
    fetchStatus();
    fetchAccounts();
    fetchConnectors();
    fetchExchangePolicies();
    fetchMcpConfig();
    fetchBootstrapInstructions();
    detectIntegrations();
  }, []);

  async function fetchSources() {
    try {
      const res = await fetch("/api/sources");
      setSources(await res.json());
    } catch {
      toast.error("Failed to load sources");
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch("/api/status");
      setStatus(await res.json());
    } catch {}
  }

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/accounts");
      setAccounts(await res.json());
    } catch {
      toast.error("Failed to load accounts");
    }
  }

  async function fetchConnectors() {
    try {
      const res = await fetch("/api/connectors");
      setConnectors(await res.json());
    } catch {
      // Connectors are optional — don't show error on initial load
    }
  }

  async function fetchExchangePolicies() {
    try {
      const res = await fetch("/api/exchange/policies");
      const data = await res.json();
      setPolicyCategories(data.categories || []);
      setExchangeDestinations(data.destinations || []);
      setPolicyDrafts(
        Object.fromEntries(
          (data.destinations || []).map((item: ExchangeDestinationConfig) => [
            item.sourceId,
            item.policy,
          ])
        )
      );
      setPolicyText(
        Object.fromEntries(
          (data.destinations || []).map((item: ExchangeDestinationConfig) => [
            item.sourceId,
            item.policy.naturalLanguageRule || "",
          ])
        )
      );
    } catch {
      toast.error("Failed to load exchange policies");
    }
  }

  async function fetchMcpConfig() {
    try {
      const res = await fetch("/api/mcp/config");
      setMcpConfig(await res.json());
    } catch {
      // MCP setup is optional on first load.
    }
  }

  async function fetchBootstrapInstructions() {
    try {
      const res = await fetch("/api/bootstrap");
      const data = await res.json();
      setBootstrapInstructions(data.instructions || "");
      setClaudeAiConnector(data.claudeAi || null);
    } catch {
      // Optional helper text.
    }
  }

  async function handleRepairMcp() {
    setRepairingMcp(true);
    try {
      const res = await fetch("/api/mcp/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets: ["claude_desktop", "claude_code"], installBootstrap: true }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Cortex MCP repaired. Restart Claude Desktop/Claude Code if they were open.");
        setMcpConfig({
          targets: data.targets,
          summary: {
            installed: data.targets.filter((target: McpTargetStatus) => target.status === "installed").length,
            total: data.targets.length,
            needsRepair: data.targets.some((target: McpTargetStatus) => target.status !== "installed"),
          },
          pokeHttp: mcpConfig?.pokeHttp || { url: "http://localhost:3001/mcp", healthUrl: "http://localhost:3001/" },
        });
      } else {
        toast.error(data.error || "Failed to repair MCP config");
      }
    } catch {
      toast.error("Failed to repair MCP config");
    } finally {
      setRepairingMcp(false);
      fetchMcpConfig();
      fetchStatus();
    }
  }

  async function copyClaudeAiSetup() {
    if (!claudeAiConnector) return;
    const lines = [
      `Connector name: ${claudeAiConnector.connectorName}`,
      `MCP URL: ${claudeAiConnector.publicMcpUrl || "(set CORTEX_PUBLIC_MCP_URL first)"}`,
      "",
      "Instructions:",
      ...claudeAiConnector.setupInstructions.map((item) => `- ${item}`),
      "",
      bootstrapInstructions,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Claude.ai setup copied");
    } catch {
      toast.error("Could not copy Claude.ai setup");
    }
  }

  async function detectIntegrations() {
    setDetecting(true);
    try {
      const res = await fetch("/api/connectors/detect");
      const data = await res.json();
      setDetectedIntegrations(data.integrations || []);
      setHasDetected(true);
    } catch {
      // Detection is best-effort — don't show error
    } finally {
      setDetecting(false);
    }
  }

  function openConfigDialog(connector: ConnectorData) {
    // Pre-fill with existing config values
    const initial: Record<string, string> = {};
    const fields = CONNECTOR_CONFIG_FIELDS[connector.type] || [];
    for (const field of fields) {
      const existing = connector.config[field.key];
      initial[field.key] = existing != null ? String(existing) : "";
    }
    setConfigValues(initial);
    setConfigDialog(connector);
  }

  async function handleConfigureConnector() {
    if (!configDialog) return;
    setConfiguringId(configDialog.id);
    try {
      const config: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(configValues)) {
        if (value) config[key] = value;
      }

      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "configure", id: configDialog.id, config }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${configDialog.name} configured`);
        if (data.warning) toast.info(data.warning);
        setConfigDialog(null);
        fetchConnectors();
      } else {
        toast.error(data.error || "Configuration failed");
      }
    } catch {
      toast.error("Failed to configure connector");
    } finally {
      setConfiguringId(null);
    }
  }

  async function handleDisconnectConnector(id: string, name: string) {
    try {
      const res = await fetch("/api/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", id }),
      });
      if (res.ok) {
        toast.success(`${name} disconnected`);
        fetchConnectors();
      }
    } catch {
      toast.error("Failed to disconnect");
    }
  }

  async function handleRegisterAccount(account: Account) {
    setRegisteringPath(account.path);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: account.name, type: account.type, path: account.path }),
      });
      if (res.ok) {
        toast.success(`Registered "${account.name}"`);
        fetchAccounts();
        fetchSources();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to register account");
      }
    } catch {
      toast.error("Failed to register account");
    } finally {
      setRegisteringPath(null);
    }
  }

  async function handleScanAccount(sourceId: string) {
    setScanningId(sourceId);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Scan complete: ${data.extracted ?? 0} memories extracted`);
        fetchAccounts();
        fetchSources();
      } else {
        toast.error(data.error || "Scan failed");
      }
    } catch {
      toast.error("Scan failed");
    } finally {
      setScanningId(null);
    }
  }

  async function handleAddAccount() {
    if (!newAccount.name || !newAccount.type) {
      toast.error("Name and type are required");
      return;
    }
    if (newAccount.type === "claude_code" && !newAccount.path) {
      toast.error("Path is required for Claude Code accounts");
      return;
    }
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccount),
      });
      if (res.ok) {
        toast.success(`Account "${newAccount.name}" added`);
        setAddAccountDialog(false);
        setNewAccount({ name: "", type: "claude_code", path: "", key: "" });
        fetchAccounts();
        fetchSources();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to add account");
      }
    } catch {
      toast.error("Failed to add account");
    }
  }

  async function handleAddSource() {
    if (!newSource.name || !newSource.path) {
      toast.error("Name and path are required");
      return;
    }
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: newSource.type, name: newSource.name, config: { path: newSource.path } }),
      });
      if (res.ok) {
        toast.success("Source added");
        setAddDialog(false);
        setNewSource({ type: "claude_code", name: "", path: "" });
        fetchSources();
      }
    } catch {
      toast.error("Failed to add source");
    }
  }

  async function handleDeleteSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
    toast.success("Source removed");
  }

  async function handleSaveAccountLabel(id: string) {
    try {
      const res = await fetch("/api/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, accountLabel: editingLabelValue || null }),
      });
      if (res.ok) {
        toast.success("Account label updated");
        setEditingLabelId(null);
        fetchSources();
      } else {
        toast.error("Failed to update label");
      }
    } catch {
      toast.error("Failed to update label");
    }
  }

  async function handleWriteBack(filePath: string) {
    try {
      const res = await fetch("/api/writeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: filePath + "/CLAUDE.md" }),
      });
      const data = await res.json();
      if (res.ok) toast.success(`Wrote ${data.memoriesWritten} memories to CLAUDE.md`);
      else toast.error(data.error || "Write-back failed");
    } catch {
      toast.error("Write-back failed");
    }
  }

  async function handleResetAllMemories() {
    setResetting(true);
    try {
      const res = await fetch("/api/memories/reset", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Reset complete: ${data.archived} memories archived`);
        fetchSources();
        fetchAccounts();
        fetchStatus();
      } else {
        toast.error(data.error || "Reset failed");
      }
    } catch {
      toast.error("Reset failed");
    } finally {
      setResetting(false);
    }
  }

  function updatePolicyDraft(sourceId: string, updater: (policy: ExchangePolicy) => ExchangePolicy) {
    setPolicyDrafts((prev) => {
      const current = prev[sourceId];
      if (!current) return prev;
      return { ...prev, [sourceId]: updater(current) };
    });
  }

  function togglePolicyCategory(sourceId: string, category: string) {
    updatePolicyDraft(sourceId, (policy) => {
      const key = policy.mode === "allow_only" ? "allowedCategories" : "blockedCategories";
      const current = policy[key];
      const next = current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category];
      return { ...policy, [key]: next };
    });
  }

  async function savePolicy(destinationConfig: ExchangeDestinationConfig, useNaturalLanguage: boolean) {
    const draft = policyDrafts[destinationConfig.sourceId];
    if (!draft) return;

    setSavingPolicyId(destinationConfig.sourceId);
    try {
      const body = useNaturalLanguage
        ? {
            sourceId: destinationConfig.sourceId,
            destination: destinationConfig.destination,
            naturalLanguageRule: policyText[destinationConfig.sourceId] || "",
          }
        : {
            sourceId: destinationConfig.sourceId,
            destination: destinationConfig.destination,
            mode: draft.mode,
            allowedCategories: draft.allowedCategories,
            blockedCategories: draft.blockedCategories,
            naturalLanguageRule: policyText[destinationConfig.sourceId] || draft.naturalLanguageRule,
          };

      const res = await fetch("/api/exchange/policies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save policy");
        return;
      }

      toast.success(`Updated ${destinationConfig.sourceName} exchange policy`);
      await fetchExchangePolicies();
    } catch {
      toast.error("Failed to save policy");
    } finally {
      setSavingPolicyId(null);
    }
  }

  const connections = status?.connections;

  return (
    <div className="space-y-8 max-w-4xl">
      <div data-animate>
        <p className="maze-eyebrow mb-4">Configuration</p>
        <h1>Settings</h1>
        <p className="maze-body mt-3">Manage connections, sources, and preferences.</p>
      </div>

      {/* ── Connections ── */}
      <section data-animate="1">
        <p className="maze-eyebrow mb-4">Connections</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {connections && Object.entries(connections).map(([key, conn]) => (
            <div key={key} className="maze-card p-5 relative overflow-hidden">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${conn.connected ? "bg-lime/10" : "bg-muted"}`}>
                    {key === "anthropic" ? (
                      <Zap className={`h-4 w-4 ${conn.connected ? "text-lime" : "text-muted-foreground"}`} />
                    ) : (
                      <Server className={`h-4 w-4 ${conn.connected ? "text-lime" : "text-muted-foreground"}`} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium tracking-tight">{conn.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{conn.description}</p>
                  </div>
                </div>
                {conn.connected ? (
                  <CheckCircle className="h-4 w-4 text-lime shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
              </div>
              {conn.connected && (
                <>
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-lime maze-pulse" />
                    <span className="text-[11px] text-muted-foreground">Configured via .env</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-lime" />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Exchange Policies ── */}
      <section data-animate="2">
        <div className="mb-4">
          <p className="maze-eyebrow">Exchange Policies</p>
          <p className="text-xs text-muted-foreground mt-1">
            Control which memory folders flow into each service. Use natural language or select categories manually.
          </p>
        </div>

        {exchangeDestinations.length === 0 ? (
          <div className="maze-card p-5">
            <p className="text-sm text-muted-foreground">
              Add a Claude Code or Poke account to configure what Cortex shares with it.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {exchangeDestinations.map((destinationConfig) => {
              const draft = policyDrafts[destinationConfig.sourceId] || destinationConfig.policy;
              const activeCategories =
                draft.mode === "allow_only" ? draft.allowedCategories : draft.blockedCategories;
              return (
                <div key={destinationConfig.sourceId} className="maze-card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium tracking-tight">{destinationConfig.sourceName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {SOURCE_TYPE_DISPLAY[destinationConfig.sourceType] || destinationConfig.sourceType}
                      </p>
                    </div>
                    <span className="maze-tag bg-lime/10 text-lime">
                      {draft.mode === "all" ? "All categories" : draft.mode === "allow_only" ? "Allow selected" : "Block selected"}
                    </span>
                  </div>

                  <div>
                    <p className="maze-eyebrow mb-2">Natural Language Rule</p>
                    <Textarea
                      value={policyText[destinationConfig.sourceId] || ""}
                      onChange={(e) => setPolicyText((prev) => ({ ...prev, [destinationConfig.sourceId]: e.target.value }))}
                      rows={2}
                      placeholder='e.g. "Do not send school or research memories to Poke"'
                    />
                    <div className="flex justify-end mt-2">
                      <button
                        className="maze-btn maze-btn-outline h-8 text-xs"
                        onClick={() => savePolicy(destinationConfig, true)}
                        disabled={savingPolicyId === destinationConfig.sourceId || !(policyText[destinationConfig.sourceId] || "").trim()}
                      >
                        {savingPolicyId === destinationConfig.sourceId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Apply Rule
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="maze-eyebrow mb-2">Manual Folder Selection</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[
                        { value: "all", label: "Send all" },
                        { value: "allow_only", label: "Only selected" },
                        { value: "block", label: "Block selected" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          className={`maze-btn h-8 text-xs ${draft.mode === option.value ? "" : "maze-btn-outline"}`}
                          onClick={() => updatePolicyDraft(destinationConfig.sourceId, (policy) => ({ ...policy, mode: option.value as ExchangePolicy["mode"] }))}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {draft.mode !== "all" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {policyCategories.map((category) => (
                          <label key={category.slug} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[13px] cursor-pointer hover:bg-muted/50">
                            <input
                              type="checkbox"
                              checked={activeCategories.includes(category.slug)}
                              onChange={() => togglePolicyCategory(destinationConfig.sourceId, category.slug)}
                            />
                            <span>{category.label}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end mt-3">
                      <button
                        className="maze-btn h-8 text-xs"
                        onClick={() => savePolicy(destinationConfig, false)}
                        disabled={savingPolicyId === destinationConfig.sourceId}
                      >
                        {savingPolicyId === destinationConfig.sourceId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Save Manual Policy
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Detected Integrations ── */}
      <section data-animate="3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="maze-eyebrow">Detected Integrations</p>
            <p className="text-xs text-muted-foreground mt-1">Services auto-detected from your AI tool configurations.</p>
          </div>
          <button
            className="maze-btn maze-btn-ghost h-8 text-xs"
            onClick={detectIntegrations}
            disabled={detecting}
          >
            {detecting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Scan className="h-3.5 w-3.5 mr-1" />
                Re-scan
              </>
            )}
          </button>
        </div>

        {hasDetected && detectedIntegrations.length === 0 && (
          <div className="maze-card p-5">
            <p className="text-sm text-muted-foreground">
              No MCP integrations detected. If you have Claude Desktop or Claude Code with MCP servers configured, they will appear here automatically.
            </p>
            <p className="text-[11px] text-muted-foreground mt-2">
              Tip: Set <code className="bg-muted px-1 py-0.5 rounded font-mono text-[11px]">CLAUDE_AI_INTEGRATIONS=gmail,google_drive</code> in your .env to declare Claude.ai integrations.
            </p>
          </div>
        )}

        {detectedIntegrations.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {detectedIntegrations.map((integration) => {
              const Icon = CONNECTOR_ICONS[integration.serviceType] || Plug;
              const badgeColor = DETECTED_VIA_COLORS[integration.detectedVia] || "bg-muted text-muted-foreground border-border";
              // Check if there's a matching connector already configured
              const matchingConnector = connectors.find((c) => c.type === integration.serviceType);
              const isAlreadyConnected = matchingConnector?.status === "connected";

              return (
                <div key={integration.id} className="maze-card p-5 relative overflow-hidden">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium tracking-tight">{integration.name}</p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${badgeColor}`}>
                            <Sparkles className="h-2.5 w-2.5" />
                            {integration.detectedViaLabel}
                          </span>
                          <span className="text-[10px] text-muted-foreground px-1 py-0.5 rounded bg-muted font-mono">
                            {integration.transport}
                          </span>
                        </div>
                      </div>
                    </div>
                    {isAlreadyConnected ? (
                      <CheckCircle className="h-4 w-4 text-lime shrink-0" />
                    ) : integration.hasConnector ? (
                      <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
                    ) : (
                      <ExternalLink className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground mt-2 font-mono truncate" title={integration.configPath}>
                    {integration.configPath.replace(/^\/Users\/[^/]+/, "~")}
                  </p>

                  {integration.hasConnector && !isAlreadyConnected && (
                    <div className="mt-3">
                      <button
                        className="maze-btn h-8 text-xs w-full"
                        onClick={() => {
                          const connector = connectors.find((c) => c.type === integration.serviceType);
                          if (connector) {
                            // Pre-fill with MCP mode selected
                            const initial: Record<string, string> = {};
                            const fields = CONNECTOR_CONFIG_FIELDS[connector.type] || [];
                            for (const field of fields) {
                              if (field.key === "mode") {
                                initial[field.key] = "mcp";
                              } else {
                                const existing = connector.config[field.key];
                                initial[field.key] = existing != null ? String(existing) : "";
                              }
                            }
                            setConfigValues(initial);
                            setConfigDialog(connector);
                          }
                        }}
                      >
                        <Settings2 className="h-3.5 w-3.5 mr-1" />
                        Connect via {integration.detectedViaLabel}
                      </button>
                    </div>
                  )}

                  {isAlreadyConnected && (
                    <>
                      <div className="mt-3 flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-lime maze-pulse" />
                        <span className="text-[11px] text-muted-foreground">Already connected</span>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-lime" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Connectors ── */}
      <section data-animate="3">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="maze-eyebrow">Connectors</p>
            <p className="text-xs text-muted-foreground mt-1">Scan data from services your AI tools are connected to.</p>
          </div>
          <Plug className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {connectors.map((connector) => {
            const Icon = CONNECTOR_ICONS[connector.type] || Plug;
            const isConnected = connector.status === "connected";
            const isError = connector.status === "error";
            // Check if this connector was auto-detected
            const detection = detectedIntegrations.find((d) => d.serviceType === connector.type);

            return (
              <div key={connector.id} className="maze-card p-5 relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      isConnected ? "bg-lime/10" : isError ? "bg-red-500/10" : "bg-muted"
                    }`}>
                      <Icon className={`h-4 w-4 ${
                        isConnected ? "text-lime" : isError ? "text-red-500" : "text-muted-foreground"
                      }`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium tracking-tight">{connector.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{connector.description}</p>
                      {detection && !isConnected && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md border mt-1 ${DETECTED_VIA_COLORS[detection.detectedVia] || "bg-muted text-muted-foreground border-border"}`}>
                          <Sparkles className="h-2.5 w-2.5" />
                          Detected via {detection.detectedViaLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  {isConnected ? (
                    <CheckCircle className="h-4 w-4 text-lime shrink-0" />
                  ) : isError ? (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-border shrink-0" />
                  )}
                </div>

                {isError && connector.error && (
                  <p className="text-[11px] text-red-500 mt-2 line-clamp-2">{connector.error}</p>
                )}

                {isConnected && connector.lastScanAt && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-lime maze-pulse" />
                    <span className="text-[11px] text-muted-foreground">
                      Last scan: {new Date(connector.lastScanAt).toLocaleDateString()}
                    </span>
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    className="maze-btn maze-btn-outline h-8 text-xs flex-1"
                    onClick={() => openConfigDialog(connector)}
                  >
                    <Settings2 className="h-3.5 w-3.5 mr-1" />
                    Configure
                  </button>
                  {isConnected && (
                    <button
                      className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg"
                      onClick={() => handleDisconnectConnector(connector.id, connector.name)}
                      title="Disconnect"
                    >
                      <Unplug className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>

                {isConnected && (
                  <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-lime" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Accounts ── */}
      <section data-animate="4">
        <p className="maze-eyebrow mb-4">Accounts</p>
        <div className="maze-card divide-y divide-border">
          {accounts.map((account) => (
            <div key={account.path || account.id} className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${account.exists ? "bg-lime/10" : "bg-muted"}`}>
                  {account.type === "claude_code" ? (
                    <HardDrive className={`h-4 w-4 ${account.exists ? "text-lime" : "text-muted-foreground"}`} />
                  ) : (
                    <User className={`h-4 w-4 ${account.exists ? "text-lime" : "text-muted-foreground"}`} />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium tracking-tight">{account.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                    {account.path || SOURCE_TYPE_DISPLAY[account.type] || account.type}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {account.exists ? (
                      <span className="text-[11px] text-lime flex items-center gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-lime" /> Detected
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> Not found
                      </span>
                    )}
                    {account.registered && (
                      <span className="text-[11px] text-muted-foreground">{account.memoryCount} memories</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5">
                {!account.registered && account.exists && (
                  <button
                    className="maze-btn h-8 text-xs"
                    disabled={registeringPath === account.path}
                    onClick={() => handleRegisterAccount(account)}
                  >
                    {registeringPath === account.path ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Register"
                    )}
                  </button>
                )}
                {account.registered && account.sourceId && (
                  <button
                    className="maze-btn h-8 text-xs"
                    disabled={scanningId === account.sourceId}
                    onClick={() => handleScanAccount(account.sourceId!)}
                  >
                    {scanningId === account.sourceId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Scan
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="p-5">
            <button
              className="maze-btn maze-btn-ghost w-full border border-dashed border-border h-10 text-[13px] text-muted-foreground"
              onClick={() => { setAddAccountDialog(true); setAddAccountStep("type"); setUploadComplete(false); setNewAccount({ name: "", type: "claude_code", path: "", key: "" }); }}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Account
            </button>
          </div>
        </div>
      </section>

      {/* ── Sources ── */}
      <section data-animate="5">
        <p className="maze-eyebrow mb-4">Sources</p>
        <div className="maze-card divide-y divide-border">
          {sources.map((source) => {
            const config = JSON.parse(source.config || "{}");
            const displayType = SOURCE_TYPE_DISPLAY[source.type] || source.type;
            const isEditingLabel = editingLabelId === source.id;
            return (
              <div key={source.id} className="flex items-center justify-between p-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tracking-tight">{source.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-muted-foreground">
                      {displayType}
                      {source.accountLabel ? ` (${source.accountLabel})` : ""}
                      {config.path ? ` — ${config.path}` : ""}
                      {config.filePath ? ` — ${config.filePath}` : ""}
                    </p>
                    {isEditingLabel ? (
                      <span className="inline-flex items-center gap-1 ml-1">
                        <Input
                          className="h-6 w-40 text-xs px-1.5"
                          placeholder="e.g. personal@gmail.com"
                          value={editingLabelValue}
                          onChange={(e) => setEditingLabelValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveAccountLabel(source.id);
                            if (e.key === "Escape") setEditingLabelId(null);
                          }}
                          autoFocus
                        />
                        <button
                          className="maze-btn maze-btn-ghost h-6 w-6 p-0 min-h-0 rounded"
                          onClick={() => handleSaveAccountLabel(source.id)}
                        >
                          <Check className="h-3 w-3 text-lime" />
                        </button>
                        <button
                          className="maze-btn maze-btn-ghost h-6 w-6 p-0 min-h-0 rounded"
                          onClick={() => setEditingLabelId(null)}
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </span>
                    ) : (
                      <button
                        className="maze-btn maze-btn-ghost h-5 w-5 p-0 min-h-0 rounded"
                        onClick={() => {
                          setEditingLabelId(source.id);
                          setEditingLabelValue(source.accountLabel || "");
                        }}
                        title="Edit account label"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {source.type === "claude_code" && config.path && (
                    <button className="maze-btn h-8 text-xs" onClick={() => handleWriteBack(config.path)}>
                      Write Back
                    </button>
                  )}
                  <button className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg" onClick={() => handleDeleteSource(source.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="p-5">
            <button className="maze-btn maze-btn-ghost w-full border border-dashed border-border h-10 text-[13px] text-muted-foreground" onClick={() => setAddDialog(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Source
            </button>
          </div>
        </div>
      </section>

      {/* ── Preferences ── */}
      <section>
        <p className="maze-eyebrow mb-4">Preferences</p>
        <div className="maze-card divide-y divide-border">
          <label className="flex items-start gap-3 p-5 cursor-pointer">
            <input type="radio" name="mode" defaultChecked className="mt-1 accent-[var(--lime)]" />
            <div>
              <p className="text-sm font-medium tracking-tight">Review Queue</p>
              <p className="text-xs text-muted-foreground mt-0.5">All proposed memories require manual approval.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 p-5 cursor-pointer">
            <input type="radio" name="mode" className="mt-1 accent-[var(--lime)]" />
            <div>
              <p className="text-sm font-medium tracking-tight">Auto-Approve</p>
              <p className="text-xs text-muted-foreground mt-0.5">Refinements of approved memories are auto-merged. New facts still require review.</p>
            </div>
          </label>
        </div>
      </section>

      {/* ── MCP Server ── */}
      <section>
        <p className="maze-eyebrow mb-4">MCP Server</p>
        <div className="maze-card p-5 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Cortex exposes an MCP server that AI tools can connect to automatically. Claude and Poke can call{" "}
            <code className="text-[12px] bg-muted px-1.5 py-0.5 rounded font-mono">cortex_get_memories()</code>{" "}
            or <code className="text-[12px] bg-muted px-1.5 py-0.5 rounded font-mono">cortex_get_context()</code>{" "}
            to pull your latest context.
          </p>
          <div className="grid gap-2">
            {(mcpConfig?.targets || []).map((target) => (
              <div key={target.target} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium tracking-tight">{target.label}</p>
                    <span className={`text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full border ${
                      target.status === "installed"
                        ? "bg-lime/10 text-lime border-lime/20"
                        : target.status === "invalid_json"
                          ? "bg-red-500/10 text-red-500 border-red-500/20"
                          : "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                    }`}>
                      {target.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{target.path}</p>
                  {target.error && <p className="text-[11px] text-red-500 mt-1">{target.error}</p>}
                </div>
                {target.status === "installed" ? (
                  <CheckCircle className="h-4 w-4 text-lime shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
                )}
              </div>
            ))}
            {!mcpConfig && (
              <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                Loading MCP status...
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="maze-btn h-9 text-[13px]" onClick={handleRepairMcp} disabled={repairingMcp}>
              {repairingMcp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Repair Cortex MCP
            </button>
            <span className="text-xs text-muted-foreground">
              {mcpConfig?.summary.needsRepair ? "Repair will preserve unrelated config and update only the Cortex entry." : "Local MCP config is installed."}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p className="maze-eyebrow mb-1">Poke HTTP MCP</p>
              <p className="text-[13px] font-mono break-all">{mcpConfig?.pokeHttp.url || "http://localhost:3001/mcp"}</p>
              <p className="text-[11px] text-muted-foreground mt-1">Run <code>npm run mcp:http</code> for Poke or HTTP MCP clients.</p>
            </div>
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p className="maze-eyebrow mb-1">Claude.ai</p>
              <p className="text-[13px] text-muted-foreground">
                Hosted Claude needs a public HTTPS remote connector.
              </p>
              <p className={`text-[11px] mt-2 ${claudeAiConnector?.configured ? "text-lime" : "text-yellow-600"}`}>
                {claudeAiConnector?.configured
                  ? `Configured: ${claudeAiConnector.publicMcpUrl}`
                  : "Set CORTEX_PUBLIC_MCP_URL to your public /mcp tunnel URL."}
              </p>
              <button className="maze-btn maze-btn-ghost h-7 text-xs mt-2" onClick={copyClaudeAiSetup} disabled={!bootstrapInstructions}>
                Copy Claude.ai Setup
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Danger ── */}
      <section>
        <p className="maze-eyebrow mb-4 text-red-500">Danger Zone</p>
        <div className="maze-card p-5 border-l-[3px] border-l-red-400">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium tracking-tight">Reset All Memories</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Archive all memories, reviews, and conflicts. Sources are preserved.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <button className="maze-btn bg-red-500 text-white h-8 text-xs" disabled={resetting}>
                    {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reset"}
                  </button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogMedia className="bg-red-500/10">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  </AlertDialogMedia>
                  <AlertDialogTitle>Reset All Memories</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will archive all active and pending memories. Sources and configuration will be preserved. This action cannot be easily undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-500 text-white hover:bg-red-600"
                    onClick={handleResetAllMemories}
                  >
                    Reset All Memories
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </section>

      {/* ── Add Account Dialog ── */}
      {addAccountDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setAddAccountDialog(false); setAddAccountStep("type"); setUploadComplete(false); }}>
          <div className="maze-card w-full max-w-xl mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            {addAccountStep === "type" ? (
              <>
                <h3 className="text-base font-semibold mb-2">Add Account</h3>
                <p className="text-[13px] text-muted-foreground mb-5">Select where your AI conversations live.</p>
                <div className="space-y-2">
                  {[
                    { value: "claude_code", label: "Claude Code", desc: "Local filesystem (CLAUDE.md + projects/)", icon: HardDrive },
                    { value: "claude_export", label: "Claude.ai", desc: "Cloud conversations from claude.ai", icon: MessageSquare },
                    { value: "chatgpt_export", label: "ChatGPT", desc: "Cloud conversations from chat.openai.com", icon: MessageSquare },
                    { value: "poke", label: "Poke", desc: "Poke account via API key", icon: Zap },
                  ].map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          newAccount.type === opt.value
                            ? "border-lime bg-lime/5"
                            : "border-border hover:border-muted-foreground/25"
                        }`}
                        onClick={() => {
                          setNewAccount((p) => ({ ...p, type: opt.value }));
                          setAddAccountStep("details");
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-[13px] font-medium tracking-tight">{opt.label}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-end mt-6">
                  <button className="maze-btn maze-btn-ghost h-9 text-[13px]" onClick={() => { setAddAccountDialog(false); setAddAccountStep("type"); }}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-5">
                  <button
                    className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg"
                    onClick={() => { setAddAccountStep("type"); setUploadComplete(false); }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <h3 className="text-base font-semibold">
                    {newAccount.type === "claude_code" && "Add Claude Code Account"}
                    {newAccount.type === "claude_export" && "Import from Claude.ai"}
                    {newAccount.type === "chatgpt_export" && "Import from ChatGPT"}
                    {newAccount.type === "poke" && "Add Poke Account"}
                  </h3>
                </div>

                {/* Claude.ai export flow */}
                {newAccount.type === "claude_export" && (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-muted/50 p-4 space-y-2.5">
                      <p className="text-[13px] font-medium tracking-tight">How to export your Claude.ai data</p>
                      <ol className="text-[12px] text-muted-foreground space-y-1.5 list-decimal list-inside">
                        <li>Go to <span className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">claude.ai</span> and sign in</li>
                        <li>Open <span className="font-medium text-foreground">Settings</span></li>
                        <li>Click <span className="font-medium text-foreground">Export data</span></li>
                        <li>Download the JSON file from the email you receive</li>
                        <li>Upload it below</li>
                      </ol>
                    </div>
                    <FileUpload
                      compact
                      accept=".json"
                      sourceType="claude_export"
                      sourceName={newAccount.name || "Claude.ai Export"}
                      onUploadComplete={(result) => {
                        if (result.success) {
                          setUploadComplete(true);
                          fetchSources();
                          fetchAccounts();
                        }
                      }}
                    />
                    {uploadComplete && (
                      <div className="flex justify-end">
                        <button className="maze-btn h-9 text-[13px]" onClick={() => { setAddAccountDialog(false); setAddAccountStep("type"); setUploadComplete(false); }}>Done</button>
                      </div>
                    )}
                  </div>
                )}

                {/* ChatGPT export flow */}
                {newAccount.type === "chatgpt_export" && (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-muted/50 p-4 space-y-2.5">
                      <p className="text-[13px] font-medium tracking-tight">How to export your ChatGPT data</p>
                      <ol className="text-[12px] text-muted-foreground space-y-1.5 list-decimal list-inside">
                        <li>Go to <span className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">chat.openai.com</span> and sign in</li>
                        <li>Open <span className="font-medium text-foreground">Settings</span></li>
                        <li>Go to <span className="font-medium text-foreground">Data Controls</span></li>
                        <li>Click <span className="font-medium text-foreground">Export data</span></li>
                        <li>Download the .zip file from the email you receive</li>
                        <li>Upload it below</li>
                      </ol>
                    </div>
                    <FileUpload
                      compact
                      accept=".json,.zip"
                      sourceType="chatgpt_export"
                      sourceName={newAccount.name || "ChatGPT Export"}
                      onUploadComplete={(result) => {
                        if (result.success) {
                          setUploadComplete(true);
                          fetchSources();
                          fetchAccounts();
                        }
                      }}
                    />
                    {uploadComplete && (
                      <div className="flex justify-end">
                        <button className="maze-btn h-9 text-[13px]" onClick={() => { setAddAccountDialog(false); setAddAccountStep("type"); setUploadComplete(false); }}>Done</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Claude Code — local path */}
                {newAccount.type === "claude_code" && (
                  <div className="space-y-4">
                    <div>
                      <p className="maze-eyebrow mb-2">Name</p>
                      <Input
                        placeholder="e.g. Work Claude Code"
                        value={newAccount.name}
                        onChange={(e) => setNewAccount((p) => ({ ...p, name: e.target.value }))}
                        className="h-10"
                      />
                    </div>
                    <div>
                      <p className="maze-eyebrow mb-2">Directory Path</p>
                      <Input
                        placeholder="/Users/you/.claude"
                        value={newAccount.path}
                        onChange={(e) => setNewAccount((p) => ({ ...p, path: e.target.value }))}
                        className="h-10"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Path to a Claude Code configuration directory (contains CLAUDE.md and projects/).
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button className="maze-btn maze-btn-ghost h-9 text-[13px]" onClick={() => { setAddAccountDialog(false); setAddAccountStep("type"); }}>Cancel</button>
                      <button className="maze-btn h-9 text-[13px]" onClick={handleAddAccount}>Add Account</button>
                    </div>
                  </div>
                )}

                {/* Poke — API key */}
                {newAccount.type === "poke" && (
                  <div className="space-y-4">
                    <div>
                      <p className="maze-eyebrow mb-2">Name</p>
                      <Input
                        placeholder="e.g. My Poke"
                        value={newAccount.name}
                        onChange={(e) => setNewAccount((p) => ({ ...p, name: e.target.value }))}
                        className="h-10"
                      />
                    </div>
                    <div>
                      <p className="maze-eyebrow mb-2">API Key</p>
                      <Input
                        placeholder="eyJhbGci..."
                        value={newAccount.key}
                        onChange={(e) => setNewAccount((p) => ({ ...p, key: e.target.value }))}
                        className="h-10"
                        type="password"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        JWT token from your Poke account settings.
                      </p>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button className="maze-btn maze-btn-ghost h-9 text-[13px]" onClick={() => { setAddAccountDialog(false); setAddAccountStep("type"); }}>Cancel</button>
                      <button className="maze-btn h-9 text-[13px]" onClick={handleAddAccount}>Add Account</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Configure Connector Dialog ── */}
      {configDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfigDialog(null)}>
          <div className="maze-card w-full max-w-md mx-4 p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-5">
              {(() => { const Icon = CONNECTOR_ICONS[configDialog.type] || Plug; return <Icon className="h-5 w-5 text-muted-foreground" />; })()}
              <h3 className="text-base font-semibold">Configure {configDialog.name}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-5">{configDialog.description}</p>
            <div className="space-y-4">
              {(CONNECTOR_CONFIG_FIELDS[configDialog.type] || []).map((field) => (
                <div key={field.key}>
                  <p className="maze-eyebrow mb-2">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </p>
                  {field.type === "select" && field.options ? (
                    <div className="space-y-2">
                      {field.options.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`connector-${field.key}`}
                            value={opt.value}
                            checked={configValues[field.key] === opt.value}
                            onChange={() => setConfigValues((p) => ({ ...p, [field.key]: opt.value }))}
                            className="accent-[var(--lime)]"
                          />
                          <span className="text-[13px]">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Input
                      type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                      placeholder={field.placeholder}
                      value={configValues[field.key] || ""}
                      onChange={(e) => setConfigValues((p) => ({ ...p, [field.key]: e.target.value }))}
                      className="h-10"
                    />
                  )}
                  {field.helpText && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">{field.helpText}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className="maze-btn maze-btn-ghost h-9 text-[13px]" onClick={() => setConfigDialog(null)}>Cancel</button>
              <button
                className="maze-btn h-9 text-[13px]"
                disabled={configuringId === configDialog.id}
                onClick={handleConfigureConnector}
              >
                {configuringId === configDialog.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Save & Connect"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Source Dialog ── */}
      {addDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setAddDialog(false)}>
          <div className="maze-card w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-5">Add Source</h3>
            <div className="space-y-4">
              <div>
                <p className="maze-eyebrow mb-2">Source Type</p>
                <div className="space-y-2">
                  {[
                    { value: "claude_code", label: "Claude Code (filesystem)" },
                    { value: "chatgpt_export", label: "ChatGPT Export" },
                    { value: "claude_export", label: "Claude.ai Export" },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="sourceType"
                        value={opt.value}
                        checked={newSource.type === opt.value}
                        onChange={() => setNewSource((p) => ({ ...p, type: opt.value }))}
                        className="accent-[var(--lime)]"
                      />
                      <span className="text-[13px]">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="maze-eyebrow mb-2">Name</p>
                <Input
                  placeholder="My Claude Code"
                  value={newSource.name}
                  onChange={(e) => setNewSource((p) => ({ ...p, name: e.target.value }))}
                  className="h-10"
                />
              </div>
              <div>
                <p className="maze-eyebrow mb-2">{newSource.type === "claude_code" ? "Directory Path" : "File Path"}</p>
                <Input
                  placeholder={newSource.type === "claude_code" ? "/Users/you/.claude" : "/path/to/export.json"}
                  value={newSource.path}
                  onChange={(e) => setNewSource((p) => ({ ...p, path: e.target.value }))}
                  className="h-10"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button className="maze-btn maze-btn-ghost h-9 text-[13px]" onClick={() => setAddDialog(false)}>Cancel</button>
              <button className="maze-btn h-9 text-[13px]" onClick={handleAddSource}>Add Source</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
