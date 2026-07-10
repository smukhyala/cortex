"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Check, X, Pencil, ChevronDown, ChevronLeft, ChevronRight, AlertTriangle, Inbox } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

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
  identity: "bg-blue-50 text-blue-700",
  education_career: "bg-purple-50 text-purple-700",
  projects: "bg-emerald-50 text-emerald-700",
  research: "bg-yellow-50 text-yellow-700",
  preferences: "bg-orange-50 text-orange-700",
  goals: "bg-pink-50 text-pink-700",
  relationships: "bg-indigo-50 text-indigo-700",
  writing_voice: "bg-cyan-50 text-cyan-700",
  workflows: "bg-teal-50 text-teal-700",
  temporary: "bg-neutral-100 text-neutral-600",
};

function confidenceDot(c: number) {
  if (c >= 0.85) return "bg-lime";
  if (c >= 0.6) return "bg-amber-400";
  return "bg-red-400";
}

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState<{ item: ReviewItem; content: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/review");
      setItems(await res.json());
    } catch {
      toast.error("Failed to load review items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchItems();
    }, 0);
    return () => window.clearTimeout(timeout);
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
      <div className="space-y-8 maze-fade-up">
        <div>
          <p className="maze-eyebrow mb-4">Review</p>
          <h1>Review Queue</h1>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="maze-card h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-8 maze-fade-up">
        <div>
          <p className="maze-eyebrow mb-4">Review</p>
          <h1>Review Queue</h1>
        </div>
        <div className="maze-card flex flex-col items-center justify-center py-14 text-center">
          <div className="h-14 w-14 rounded-2xl bg-lime/10 flex items-center justify-center mb-5">
            <Inbox className="h-6 w-6 text-lime" />
          </div>
          <h3 className="text-base font-medium">All caught up</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
            No memories waiting for review. Upload a conversation export or sync a source.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 maze-fade-up">
      <div className="flex items-center justify-between" data-animate>
        <div>
          <p className="maze-eyebrow mb-4">Review</p>
          <h1>Review Queue</h1>
          <p className="maze-body mt-3">
            {items.length} item{items.length !== 1 ? "s" : ""} pending review
          </p>
        </div>
        {newMemoryItems.length > 0 && (
          <button onClick={handleBatchApprove} className="maze-btn maze-btn-lime">
            <Check className="h-3.5 w-3.5" />
            Approve All ({newMemoryItems.length})
          </button>
        )}
      </div>

      {/* Conflicts */}
      {conflictItems.length > 0 && (
        <section className="space-y-3" data-animate="1">
          <p className="maze-eyebrow">Conflicts ({conflictItems.length})</p>
          {conflictItems.map((item) => (
            <ConflictCard key={item.id} item={item} onAction={handleAction} />
          ))}
        </section>
      )}

      {/* New memories (paginated) */}
      {newMemoryItems.length > 0 && (() => {
        const totalPages = Math.max(1, Math.ceil(newMemoryItems.length / pageSize));
        const currentPage = Math.min(page, totalPages);
        const start = (currentPage - 1) * pageSize;
        const pageItems = newMemoryItems.slice(start, start + pageSize);

        return (
          <section className="space-y-3" data-animate="2">
            <div className="flex items-center justify-between">
              <p className="maze-eyebrow">New Memories ({newMemoryItems.length})</p>
              <div className="flex items-center gap-2">
                <button
                  className="maze-btn maze-btn-outline h-8 w-8 min-h-0 p-0"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[12px] text-muted-foreground">
                  {start + 1}-{Math.min(start + pageSize, newMemoryItems.length)} of {newMemoryItems.length}
                </span>
                <button
                  className="maze-btn maze-btn-outline h-8 w-8 min-h-0 p-0"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            {pageItems.map((item) => (
              <MemoryReviewCard
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                onApprove={() => handleAction(item.id, "approve")}
                onReject={() => handleAction(item.id, "reject")}
                onEdit={() => setEditDialog({ item, content: item.memory.content })}
              />
            ))}
          </section>
        );
      })()}

      {/* Edit modal */}
      {editDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditDialog(null)}>
          <div className="maze-card w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-medium mb-4">Edit & Approve</h3>
            <Textarea
              value={editDialog.content}
              onChange={(e) => setEditDialog((prev) => prev ? { ...prev, content: e.target.value } : null)}
              rows={4}
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <button className="maze-btn maze-btn-ghost h-9 text-[13px]" onClick={() => setEditDialog(null)}>Cancel</button>
              <button
                className="maze-btn h-9 text-[13px]"
                onClick={() => {
                  handleAction(editDialog.item.id, "approve", { editedContent: editDialog.content });
                  setEditDialog(null);
                }}
              >
                Save & Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemoryReviewCard({
  item, expanded, onToggle, onApprove, onReject, onEdit,
}: {
  item: ReviewItem;
  expanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  const catColor = CATEGORY_COLORS[item.memory.category] || "bg-neutral-100 text-neutral-600";
  const dotColor = confidenceDot(item.memory.confidence);

  return (
    <div className="maze-card overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2.5 flex-wrap">
              <span className={`maze-tag ${catColor}`}>
                {item.memory.category.replace("_", " ")}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                {Math.round(item.memory.confidence * 100)}%
              </span>
              {item.memory.sensitive && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-red-50 text-red-600">sensitive</span>
              )}
              <span className="text-[11px] text-muted-foreground">
                via {item.memory.source.name}
              </span>
            </div>
            <p className="text-[14px] leading-relaxed">{item.memory.content}</p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={onApprove} title="Approve" className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg">
              <Check className="h-4 w-4 text-emerald-600" />
            </button>
            <button onClick={onReject} title="Reject" className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg">
              <X className="h-4 w-4 text-red-500" />
            </button>
            <button onClick={onEdit} title="Edit" className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg">
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button onClick={onToggle} title="Details" className="maze-btn maze-btn-ghost h-8 w-8 p-0 min-h-0 rounded-lg">
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>
      </div>
      {expanded && item.memory.verbatimQuote && (
        <div className="px-5 pb-5 pt-0">
          <div className="pt-4 border-t border-border">
            <p className="maze-eyebrow mb-2">Source quote</p>
            <blockquote className="text-[13px] text-muted-foreground italic border-l-[3px] border-lime/40 pl-3 leading-relaxed">
              &ldquo;{item.memory.verbatimQuote}&rdquo;
            </blockquote>
          </div>
        </div>
      )}
    </div>
  );
}

function ConflictCard({
  item, onAction,
}: {
  item: ReviewItem;
  onAction: (id: string, action: string, extra?: Record<string, unknown>) => void;
}) {
  const conflict = item.conflict!;

  return (
    <div className="maze-card overflow-hidden border-l-[3px] border-l-amber-400">
      <div className="p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium tracking-tight">Conflict: {conflict.type}</p>
          </div>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">
            {conflict.suggestedAction.replace("_", " ")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">{conflict.reasoning}</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3.5 rounded-lg bg-muted/50">
            <p className="maze-eyebrow mb-1.5">Existing</p>
            <p className="text-[13px] leading-relaxed">{conflict.existingMemory.content}</p>
          </div>
          <div className="p-3.5 rounded-lg bg-lime-muted/50">
            <p className="maze-eyebrow mb-1.5">New</p>
            <p className="text-[13px] leading-relaxed">{item.memory.content}</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button className="maze-btn maze-btn-lime h-8 text-xs" onClick={() => onAction(item.id, "resolve_conflict", { resolution: "keep_new" })}>
            Keep New
          </button>
          <button className="maze-btn maze-btn-ghost h-8 text-xs border border-border" onClick={() => onAction(item.id, "resolve_conflict", { resolution: "keep_existing" })}>
            Keep Existing
          </button>
          {conflict.mergedContent && (
            <button className="maze-btn maze-btn-ghost h-8 text-xs border border-border" onClick={() => onAction(item.id, "resolve_conflict", { resolution: "merge", editedContent: conflict.mergedContent })}>
              Merge
            </button>
          )}
          <button className="maze-btn maze-btn-ghost h-8 text-xs" onClick={() => onAction(item.id, "resolve_conflict", { resolution: "dismiss" })}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
