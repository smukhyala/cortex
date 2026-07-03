"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Check, X, Pencil, ChevronDown, AlertTriangle, Inbox } from "lucide-react";

interface ReviewItem {
  id: string;
  type: "new_memory" | "conflict";
  title: string;
  status: string;
  createdAt: string;
  memory: {
    id: string;
    content: string;
    category: string;
    confidence: number;
    verbatimQuote: string | null;
    sensitive: boolean;
    source: { name: string; type: string };
  };
  conflict: {
    id: string;
    type: string;
    reasoning: string;
    suggestedAction: string;
    mergedContent: string | null;
    existingMemory: { id: string; content: string; category: string };
  } | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  identity: "bg-blue-100 text-blue-800",
  education_career: "bg-purple-100 text-purple-800",
  projects: "bg-green-100 text-green-800",
  research: "bg-yellow-100 text-yellow-800",
  preferences: "bg-orange-100 text-orange-800",
  goals: "bg-pink-100 text-pink-800",
  relationships: "bg-indigo-100 text-indigo-800",
  writing_voice: "bg-cyan-100 text-cyan-800",
  workflows: "bg-teal-100 text-teal-800",
  temporary: "bg-gray-100 text-gray-800",
};

function confidenceLabel(c: number) {
  if (c >= 0.85) return { text: "High", class: "bg-green-100 text-green-800" };
  if (c >= 0.6) return { text: "Medium", class: "bg-amber-100 text-amber-800" };
  return { text: "Low", class: "bg-red-100 text-red-800" };
}

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState<{ item: ReviewItem; content: string } | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/review");
      const data = await res.json();
      setItems(data);
    } catch {
      toast.error("Failed to load review items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleAction(itemId: string, action: string, extra?: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/review/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) throw new Error("Failed");

      setItems((prev) => prev.filter((i) => i.id !== itemId));
      toast.success(action === "approve" ? "Memory approved" : action === "reject" ? "Memory rejected" : "Conflict resolved");
    } catch {
      toast.error("Action failed");
    }
  }

  async function handleBatchApprove() {
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_all" }),
      });
      const data = await res.json();
      toast.success(`Approved ${data.approved} memories`);
      fetchItems();
    } catch {
      toast.error("Batch approve failed");
    }
  }

  const newMemoryItems = items.filter((i) => i.type === "new_memory");
  const conflictItems = items.filter((i) => i.type === "conflict");

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Review Queue</h1>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-24 p-4" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Review Queue</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">All caught up</h3>
            <p className="text-sm text-muted-foreground mt-1">
              No memories waiting for review. Upload a conversation export or sync a source.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review Queue</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length !== 1 ? "s" : ""} pending review
          </p>
        </div>
        {newMemoryItems.length > 0 && (
          <Button onClick={handleBatchApprove} variant="outline" size="sm">
            <Check className="mr-1 h-4 w-4" />
            Approve All ({newMemoryItems.length})
          </Button>
        )}
      </div>

      {/* Conflicts first */}
      {conflictItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Conflicts ({conflictItems.length})
          </h2>
          {conflictItems.map((item) => (
            <ConflictCard key={item.id} item={item} onAction={handleAction} />
          ))}
        </div>
      )}

      {/* New memories */}
      {newMemoryItems.length > 0 && (
        <div className="space-y-3">
          {conflictItems.length > 0 && (
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              New Memories ({newMemoryItems.length})
            </h2>
          )}
          {newMemoryItems.map((item) => (
            <MemoryReviewCard
              key={item.id}
              item={item}
              onApprove={() => handleAction(item.id, "approve")}
              onReject={() => handleAction(item.id, "reject")}
              onEdit={() => setEditDialog({ item, content: item.memory.content })}
            />
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      {editDialog && (
        <Dialog open onOpenChange={() => setEditDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit & Approve</DialogTitle>
            </DialogHeader>
            <Textarea
              value={editDialog.content}
              onChange={(e) =>
                setEditDialog((prev) => prev ? { ...prev, content: e.target.value } : null)
              }
              rows={4}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialog(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  handleAction(editDialog.item.id, "approve", {
                    editedContent: editDialog.content,
                  });
                  setEditDialog(null);
                }}
              >
                Save & Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function MemoryReviewCard({
  item,
  onApprove,
  onReject,
  onEdit,
}: {
  item: ReviewItem;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  const conf = confidenceLabel(item.memory.confidence);
  const catColor = CATEGORY_COLORS[item.memory.category] || "bg-gray-100 text-gray-800";

  return (
    <Collapsible>
      <Card className="group">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge className={catColor} variant="outline">
                  {item.memory.category.replace("_", " ")}
                </Badge>
                <Badge className={conf.class} variant="outline">
                  {conf.text} ({Math.round(item.memory.confidence * 100)}%)
                </Badge>
                {item.memory.sensitive && (
                  <Badge variant="destructive">Sensitive</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  via {item.memory.source.name}
                </span>
              </div>
              <p className="text-sm font-medium">{item.memory.content}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={onApprove} title="Approve">
                <Check className="h-4 w-4 text-green-600" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onReject} title="Reject">
                <X className="h-4 w-4 text-red-600" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onEdit} title="Edit & Approve">
                <Pencil className="h-4 w-4" />
              </Button>
              <CollapsibleTrigger
                render={
                  <Button size="sm" variant="ghost">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          </div>
          <CollapsibleContent className="mt-3 pt-3 border-t">
            {item.memory.verbatimQuote && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Source quote:</p>
                <blockquote className="text-sm text-muted-foreground italic border-l-2 pl-3">
                  &ldquo;{item.memory.verbatimQuote}&rdquo;
                </blockquote>
              </div>
            )}
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}

function ConflictCard({
  item,
  onAction,
}: {
  item: ReviewItem;
  onAction: (id: string, action: string, extra?: Record<string, unknown>) => void;
}) {
  const conflict = item.conflict!;

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <CardTitle className="text-sm font-medium">
            Conflict: {conflict.type}
          </CardTitle>
          <Badge variant="outline" className="bg-amber-50 text-amber-700">
            {conflict.suggestedAction.replace("_", " ")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{conflict.reasoning}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border bg-muted/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">Existing</p>
            <p className="text-sm">{conflict.existingMemory.content}</p>
          </div>
          <div className="p-3 rounded-lg border bg-blue-50">
            <p className="text-xs font-medium text-muted-foreground mb-1">New</p>
            <p className="text-sm">{item.memory.content}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() =>
              onAction(item.id, "resolve_conflict", { resolution: "keep_new" })
            }
          >
            Keep New
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onAction(item.id, "resolve_conflict", { resolution: "keep_existing" })
            }
          >
            Keep Existing
          </Button>
          {conflict.mergedContent && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                onAction(item.id, "resolve_conflict", {
                  resolution: "merge",
                  editedContent: conflict.mergedContent,
                })
              }
            >
              Merge
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onAction(item.id, "resolve_conflict", { resolution: "dismiss" })
            }
          >
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
