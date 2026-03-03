"use client";

import { useState, useTransition } from "react";
import {
  Search,
  Sparkles,
  FileText,
  ExternalLink,
  Loader2,
  DollarSign,
  Calendar,
  FileBox,
  Users,
  BookOpen,
} from "lucide-react";
import { askKnowledgeBase, type QAResponse } from "@/actions/knowledge-qa";
import Link from "next/link";

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

const SOURCE_ICONS: Record<string, typeof FileText> = {
  knowledge_article: BookOpen,
  budget_category: DollarSign,
  event_plan: Calendar,
  fundraiser: DollarSign,
  handoff_note: Users,
  drive_file: FileBox,
};

export function KnowledgeQA() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QAResponse | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    startTransition(async () => {
      const response = await askKnowledgeBase(query);
      setResult(response);
    });
  }

  function handleQuickQuestion(q: string) {
    setQuery(q);
    startTransition(async () => {
      const response = await askKnowledgeBase(q);
      setResult(response);
    });
  }

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
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Answer
            {result.confidence !== "no_data" && (
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-xs ${
                  result.confidence === "high"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : result.confidence === "medium"
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                }`}
              >
                {result.confidence} confidence
              </span>
            )}
          </div>

          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p className="whitespace-pre-wrap">{result.answer}</p>
          </div>

          {/* Sources */}
          {result.sources.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <FileText className="h-3 w-3" />
                Sources ({result.sources.length})
              </div>
              <ul className="space-y-2">
                {result.sources.map((source, i) => {
                  const Icon = SOURCE_ICONS[source.type] || FileText;
                  const isExternal = source.url?.startsWith("http");

                  return (
                    <li
                      key={i}
                      className="rounded-md border border-border bg-muted/50 p-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div>
                            <span className="font-medium">{source.title}</span>
                            <p className="mt-0.5 text-muted-foreground">
                              {source.snippet}
                            </p>
                          </div>
                        </div>
                        {source.url && (
                          <Link
                            href={source.url}
                            target={isExternal ? "_blank" : undefined}
                            rel={isExternal ? "noopener noreferrer" : undefined}
                            className="shrink-0 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
