"use client";

import { useState, useTransition } from "react";
import {
  Search,
  Sparkles,
  Loader2,
  Bookmark,
  BookmarkCheck,
  Globe,
  Lock,
} from "lucide-react";
import { askKnowledgeBase, type QAResponse } from "@/actions/knowledge-qa";
import { saveQa, type SavedQaVisibility } from "@/actions/saved-qa";
import { QaSources, ConfidenceBadge } from "@/components/knowledge/qa-sources";
import { useToast } from "@/components/ui/toast";

const QUICK_QUESTIONS = [
  {
    label: "Budget history",
    query: "What are our budget categories and allocations this year?",
  },
  {
    label: "Past events",
    query: "What events have we run in the past year?",
  },
  {
    label: "Fundraiser results",
    query: "How much did our fundraisers raise?",
  },
  {
    label: "Board tips",
    query: "What tips and advice did previous board members leave?",
  },
];

export function KnowledgeQA({ onSaved }: { onSaved?: () => void } = {}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QAResponse | null>(null);
  // The question that produced `result` — `query` keeps changing as the user
  // types the next one, and a saved entry must record what was actually asked.
  const [askedQuestion, setAskedQuestion] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const { addToast } = useToast();

  function runQuestion(question: string) {
    startTransition(async () => {
      const response = await askKnowledgeBase(question);
      setAskedQuestion(question);
      setSavedId(null);
      setResult(response);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    runQuestion(query);
  }

  function handleQuickQuestion(q: string) {
    setQuery(q);
    runQuestion(q);
  }

  function handleSave(visibility: SavedQaVisibility) {
    if (!result || !askedQuestion) return;

    startSaving(async () => {
      try {
        const saved = await saveQa({
          question: askedQuestion,
          answer: result.answer,
          sources: result.sources,
          confidence: result.confidence,
          visibility,
        });
        setSavedId(saved?.id ?? null);
        addToast(
          visibility === "shared"
            ? "Saved and shared with your board"
            : "Saved to your Q&As",
          "success"
        );
        onSaved?.();
      } catch (error) {
        console.error("Failed to save Q&A:", error);
        addToast("Couldn't save that answer. Please try again.", "destructive");
      }
    });
  }

  // Nothing to keep if the search came up empty — saving a "couldn't find
  // anything" reply would just clutter the tab.
  const canSave = Boolean(result) && result?.confidence !== "no_data";

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="rounded-lg border border-border bg-card p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Ask DragonHub
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What was the budget for Fall Festival last year?"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={isPending}
            />
            <button
              type="submit"
              disabled={isPending || !query.trim()}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Quick Questions */}
          <div className="flex flex-wrap gap-2">
            {QUICK_QUESTIONS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => handleQuickQuestion(q.query)}
                disabled={isPending}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        </form>
      </div>

      {/* Loading State */}
      {isPending && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching DragonHub for relevant information...
          </div>
        </div>
      )}

      {/* Answer Display */}
      {result && !isPending && (
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Answer
            <span className="ml-auto">
              <ConfidenceBadge confidence={result.confidence} />
            </span>
          </div>

          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p className="whitespace-pre-wrap">{result.answer}</p>
          </div>

          <QaSources sources={result.sources} />

          {/* Save controls — "save and share" is the primary action because a
              kept answer is most useful to the people who'd ask it next. */}
          {canSave && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              {savedId ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                  <BookmarkCheck className="h-3.5 w-3.5" />
                  Saved to Saved Q&amp;As
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleSave("shared")}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    Save &amp; share
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSave("private")}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Save for me
                  </button>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Bookmark className="h-3 w-3" />
                    Shared answers show up for everyone on the board
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
