"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  Lock,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  getSavedQas,
  deleteSavedQa,
  updateSavedQa,
  type SavedQa,
} from "@/actions/saved-qa";
import { QaSources, ConfidenceBadge } from "@/components/knowledge/qa-sources";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export function SavedQaList({ refreshKey }: { refreshKey?: number }) {
  const [items, setItems] = useState<SavedQa[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const { addToast } = useToast();
  const [isMutating, startMutation] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getSavedQas());
    } catch (error) {
      console.error("Failed to load saved Q&As:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(item: SavedQa) {
    const ok = await confirm({
      title: "Delete this saved Q&A?",
      description:
        item.visibility === "shared"
          ? "It will disappear for everyone on the board. The answer can be asked again, but this saved copy is gone."
          : "The answer can be asked again, but this saved copy is gone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;

    try {
      await deleteSavedQa(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      addToast("Saved Q&A deleted", "success");
    } catch (error) {
      console.error("Failed to delete saved Q&A:", error);
      addToast("Couldn't delete that Q&A. Please try again.", "destructive");
    } finally {
      closeConfirm();
    }
  }

  function handleToggleVisibility(item: SavedQa) {
    const next = item.visibility === "shared" ? "private" : "shared";
    startMutation(async () => {
      try {
        await updateSavedQa(item.id, { visibility: next });
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, visibility: next } : i))
        );
        addToast(
          next === "shared"
            ? "Shared with your board"
            : "Now visible only to you",
          "success"
        );
      } catch (error) {
        console.error("Failed to change visibility:", error);
        addToast("Couldn't change who can see this.", "destructive");
      }
    });
  }

  const term = query.trim().toLowerCase();
  const filtered = term
    ? items.filter(
        (i) =>
          i.question.toLowerCase().includes(term) ||
          i.answer.toLowerCase().includes(term) ||
          i.title?.toLowerCase().includes(term)
      )
    : items;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-4 py-16 text-center">
        <Bookmark className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="font-medium">No saved Q&amp;As yet</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Ask a question with &ldquo;Ask DragonHub&rdquo; above, then choose
          &ldquo;Save &amp; share&rdquo; to keep the answer here so nobody has
          to ask it again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search saved Q&As..."
          className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No saved Q&amp;As match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const isOpen = expanded.has(item.id);
            return (
              <li
                key={item.id}
                className="rounded-lg border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-2 p-4 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.title || item.question}</p>
                    {!isOpen && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {item.answer}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {item.visibility === "shared" ? (
                          <>
                            <Globe className="h-3 w-3" />
                            Shared
                          </>
                        ) : (
                          <>
                            <Lock className="h-3 w-3" />
                            Only me
                          </>
                        )}
                      </span>
                      {item.creatorName && <span>· Saved by {item.creatorName}</span>}
                      {item.createdAt && (
                        <span>
                          · {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      )}
                      <ConfidenceBadge confidence={item.confidence} />
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-4 border-t border-border px-4 pb-4 pt-3">
                    {item.title && (
                      <p className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        {item.question}
                      </p>
                    )}
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <p className="whitespace-pre-wrap">{item.answer}</p>
                    </div>

                    <QaSources sources={item.sources} />

                    {item.canManage && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                        <button
                          type="button"
                          onClick={() => handleToggleVisibility(item)}
                          disabled={isMutating}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                        >
                          {isMutating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : item.visibility === "shared" ? (
                            <Lock className="h-3.5 w-3.5" />
                          ) : (
                            <Globe className="h-3.5 w-3.5" />
                          )}
                          {item.visibility === "shared"
                            ? "Make private"
                            : "Share with board"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {confirmDialog}
    </div>
  );
}
