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
  identity: "bg-blue-50 text-blue-700 border-blue-200",
  education_career: "bg-purple-50 text-purple-700 border-purple-200",
  projects: "bg-emerald-50 text-emerald-700 border-emerald-200",
  research: "bg-yellow-50 text-yellow-700 border-yellow-200",
  preferences: "bg-orange-50 text-orange-700 border-orange-200",
  goals: "bg-pink-50 text-pink-700 border-pink-200",
  relationships: "bg-indigo-50 text-indigo-700 border-indigo-200",
  writing_voice: "bg-cyan-50 text-cyan-700 border-cyan-200",
  workflows: "bg-teal-50 text-teal-700 border-teal-200",
  temporary: "bg-gray-50 text-gray-600 border-gray-200",
};

function confidenceLabel(c: number) {
  if (c >= 0.85) return { text: "High", class: "bg-lime-muted text-lime-foreground" };
  if (c >= 0.6) return { text: "Medium", class: "bg-amber-50 text-amber-700" };
  return { text: "Low", class: "bg-red-50 text-red-700" };
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
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
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
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lime/10 mb-5">
              <Inbox className="h-6 w-6 text-lime-foreground" />
            </div>
            <h3 className="text-base font-semibold">All caught up</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              No memories waiting for review. Upload a conversation export or sync a source to get started.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {items.length} item{items.length !== 1 ? "s" : ""} pending review
          </p>
        </div>
        {newMemoryItems.length > 0 && (
          <Button onClick={handleBatchApprove} size="sm" className="bg-lime text-lime-foreground hover:bg-lime/90 h-8 text-xs">
            <Check className="mr-1 h-3.5 w-3.5" />
            Approve All ({newMemoryItems.length})
          </Button>
        )}
      </div>

      {conflictItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Conflicts ({conflictItems.length})
          </h2>
          {conflictItems.map((item) => (
            <ConflictCard key={item.id} item={item} onAction={handleAction} />
          ))}
        </div>
      )}

      {newMemoryItems.length > 0 && (
        <div className="space-y-3">
          {conflictItems.length > 0 && (
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
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
  const catColor = CATEGORY_COLORS[item.memory.category] || "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <Collapsible>
      <Card className="group transition-shadow hover:shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <Badge className={`${catColor} text-[10px] font-medium`} variant="outline">
                  {item.memory.category.replace("_", " ")}
                </Badge>
                <Badge className={`${conf.class} text-[10px] font-medium`} variant="outline">
                  {conf.text} ({Math.round(item.memory.confidence * 100)}%)
                </Badge>
                {item.memory.sensitive && (
                  <Badge variant="destructive" className="text-[10px]">Sensitive</Badge>
                )}
                <span className="text-[11px] text-muted-foreground">
                  via {item.memory.source.name}
                </span>
              </div>
              <p className="text-[13px] font-medium leading-relaxed">{item.memory.content}</p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Button size="sm" variant="ghost" onClick={onApprove} title="Approve" className="h-8 w-8 p-0">
                <Check className="h-4 w-4 text-emerald-600" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onReject} title="Reject" className="h-8 w-8 p-0">
                <X className="h-4 w-4 text-red-500" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onEdit} title="Edit & Approve" className="h-8 w-8 p-0">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <CollapsibleTrigger
                render={
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            </div>
          </div>
          <CollapsibleContent className="mt-3 pt-3 border-t">
            {item.memory.verbatimQuote && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Source quote</p>
                <blockquote className="text-[13px] text-muted-foreground italic border-l-2 border-lime/40 pl-3">
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
    <Card className="border-amber-200/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-sm font-medium">
              Conflict: {conflict.type}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">{conflict.reasoning}</p>
          </div>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
            {conflict.suggestedAction.replace("_", " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border bg-muted/30">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Existing</p>
            <p className="text-[13px]">{conflict.existingMemory.content}</p>
          </div>
          <div className="p-3 rounded-lg border border-lime/20 bg-lime-muted/30">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">New</p>
            <p className="text-[13px]">{item.memory.content}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            className="h-8 text-xs bg-lime text-lime-foreground hover:bg-lime/90"
            onClick={() =>
              onAction(item.id, "resolve_conflict", { resolution: "keep_new" })
            }
          >
            Keep New
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
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
              className="h-8 text-xs"
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
            className="h-8 text-xs"
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
