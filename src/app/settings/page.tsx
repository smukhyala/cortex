"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Trash2, FolderOpen } from "lucide-react";

interface Source {
  id: string;
  type: string;
  name: string;
  status: string;
  config: string;
  lastSyncAt: string | null;
  _count: { memories: number };
}

export default function SettingsPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [addDialog, setAddDialog] = useState(false);
  const [newSource, setNewSource] = useState({ type: "claude_code", name: "", path: "" });

  useEffect(() => {
    fetchSources();
  }, []);

  async function fetchSources() {
    try {
      const res = await fetch("/api/sources");
      setSources(await res.json());
    } catch {
      toast.error("Failed to load sources");
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
        body: JSON.stringify({
          type: newSource.type,
          name: newSource.name,
          config: { path: newSource.path },
        }),
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
    try {
      toast.success("Source removed");
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("Failed to remove source");
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
      if (res.ok) {
        toast.success(`Wrote ${data.memoriesWritten} memories to CLAUDE.md`);
      } else {
        toast.error(data.error || "Write-back failed");
      }
    } catch {
      toast.error("Write-back failed");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Sources */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected Sources</CardTitle>
          <CardDescription>Manage where Cortex reads conversation data from</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sources.map((source) => {
            const config = JSON.parse(source.config || "{}");
            return (
              <div
                key={source.id}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div>
                  <p className="text-sm font-medium">{source.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {source.type.replace("_", " ")}
                    {config.path ? ` — ${config.path}` : ""}
                    {config.filePath ? ` — ${config.filePath}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  {source.type === "claude_code" && config.path && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleWriteBack(config.path)}
                      title="Write memories to CLAUDE.md"
                    >
                      Write Back
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteSource(source.id)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            );
          })}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setAddDialog(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Source
          </Button>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Keys</CardTitle>
          <CardDescription>
            Keys are stored in your local .env file. Never transmitted externally.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="anthropic-key">Anthropic API Key</Label>
            <Input
              id="anthropic-key"
              type="password"
              placeholder="sk-ant-..."
              defaultValue={process.env.NEXT_PUBLIC_ANTHROPIC_KEY_SET ? "••••••••" : ""}
              disabled
            />
            <p className="text-xs text-muted-foreground">
              Set via ANTHROPIC_API_KEY in your .env file
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="poke-key">Poke API Key</Label>
            <Input
              id="poke-key"
              type="password"
              placeholder="pk_..."
              disabled
            />
            <p className="text-xs text-muted-foreground">
              Set via POKE_API_KEY in your .env file. Get it from Poke Kitchen.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Update Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Update Mode</CardTitle>
          <CardDescription>Control how new memories are processed</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup defaultValue="review">
            <div className="flex items-start space-x-3 p-3 rounded-lg border">
              <RadioGroupItem value="review" id="review" className="mt-0.5" />
              <Label htmlFor="review" className="cursor-pointer">
                <p className="font-medium">Review Queue</p>
                <p className="text-sm text-muted-foreground">
                  All proposed memories require manual approval before being added.
                </p>
              </Label>
            </div>
            <div className="flex items-start space-x-3 p-3 rounded-lg border mt-2">
              <RadioGroupItem value="auto" id="auto" className="mt-0.5" />
              <Label htmlFor="auto" className="cursor-pointer">
                <p className="font-medium">Auto-Approve</p>
                <p className="text-sm text-muted-foreground">
                  Refinements of already-approved memories are auto-merged. New facts and conflicts still require review.
                </p>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* MCP Server */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">MCP Server</CardTitle>
          <CardDescription>
            Allow Poke and Claude to pull your memories on demand
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cortex exposes an MCP server that AI tools can connect to. When running,
            Poke and Claude can call <code className="text-xs bg-muted px-1 py-0.5 rounded">cortex_get_memories()</code> to
            pull your latest context.
          </p>
          <div className="p-3 rounded-lg bg-muted text-sm font-mono">
            <p className="text-xs text-muted-foreground mb-1">Connection URL:</p>
            <p>http://localhost:3001/mcp</p>
          </div>
          <p className="text-xs text-muted-foreground">
            In Poke Kitchen: Integrations &rarr; New MCP Server &rarr; paste the URL above.
          </p>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-base text-red-600">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Reset All Memories</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete all memories, reviews, and conflicts. Sources are preserved.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" size="sm">
                    Reset
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all memories, review items, and conflicts.
                    Your connected sources will not be affected. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      toast.info("Reset functionality coming soon");
                    }}
                  >
                    Yes, Reset Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Add Source Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Source</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <RadioGroup
                value={newSource.type}
                onValueChange={(v) => setNewSource((p) => ({ ...p, type: v }))}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="claude_code" id="s-claude-code" />
                  <Label htmlFor="s-claude-code">Claude Code (filesystem)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="chatgpt_export" id="s-chatgpt" />
                  <Label htmlFor="s-chatgpt">ChatGPT Export</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="claude_export" id="s-claude" />
                  <Label htmlFor="s-claude">Claude.ai Export</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-name">Name</Label>
              <Input
                id="source-name"
                placeholder="My Claude Code"
                value={newSource.name}
                onChange={(e) => setNewSource((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-path">
                {newSource.type === "claude_code"
                  ? "Directory Path"
                  : "File Path (after upload)"}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="source-path"
                  placeholder={
                    newSource.type === "claude_code"
                      ? "/Users/you/.claude"
                      : "/path/to/export.json"
                  }
                  value={newSource.path}
                  onChange={(e) => setNewSource((p) => ({ ...p, path: e.target.value }))}
                />
                <Button variant="outline" size="icon" title="Browse">
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSource}>Add Source</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
