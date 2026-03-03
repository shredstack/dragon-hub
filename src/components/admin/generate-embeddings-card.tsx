"use client";

import { useState, useEffect, useTransition } from "react";
import { Sparkles, Loader2, Check, AlertCircle } from "lucide-react";
import {
  generateMissingEmbeddings,
  getMissingEmbeddingCounts,
} from "@/actions/embeddings";

export function GenerateEmbeddingsCard() {
  const [counts, setCounts] = useState<{
    knowledgeArticles: number;
    budgetCategories: number;
    eventPlans: number;
    fundraisers: number;
    handoffNotes: number;
    driveFiles: number;
    total: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    processed: number;
    message: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCounts();
  }, []);

  async function loadCounts() {
    setIsLoading(true);
    try {
      const data = await getMissingEmbeddingCounts();
      setCounts(data);
    } catch (error) {
      console.error("Failed to load embedding counts:", error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleGenerate() {
    setResult(null);
    startTransition(async () => {
      try {
        const data = await generateMissingEmbeddings(50);
        setResult({
          success: true,
          processed: data.total,
          message: `Generated ${data.total} embeddings`,
        });
        // Reload counts after generation
        await loadCounts();
      } catch (error) {
        setResult({
          success: false,
          processed: 0,
          message: error instanceof Error ? error.message : "Failed to generate embeddings",
        });
      }
    });
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading embedding status...
        </div>
      </div>
    );
  }

  const hasRecordsToProcess = counts && counts.total > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium">AI Search Embeddings</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Generate embeddings to enable AI-powered Q&A in the Knowledge Base
          </p>

          {counts && (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              {counts.total === 0 ? (
                <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Check className="h-3 w-3" />
                  All records have embeddings
                </div>
              ) : (
                <>
                  <p className="font-medium text-foreground">
                    {counts.total} records need embeddings:
                  </p>
                  <ul className="ml-3 space-y-0.5">
                    {counts.knowledgeArticles > 0 && (
                      <li>{counts.knowledgeArticles} Knowledge articles</li>
                    )}
                    {counts.budgetCategories > 0 && (
                      <li>{counts.budgetCategories} Budget categories</li>
                    )}
                    {counts.eventPlans > 0 && (
                      <li>{counts.eventPlans} Event plans</li>
                    )}
                    {counts.fundraisers > 0 && (
                      <li>{counts.fundraisers} Fundraisers</li>
                    )}
                    {counts.handoffNotes > 0 && (
                      <li>{counts.handoffNotes} Handoff notes</li>
                    )}
                    {counts.driveFiles > 0 && (
                      <li>{counts.driveFiles} Drive files</li>
                    )}
                  </ul>
                </>
              )}
            </div>
          )}

          {result && (
            <div
              className={`mt-3 flex items-center gap-1 text-xs ${
                result.success
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {result.success ? (
                <Check className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {result.message}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={isPending || !hasRecordsToProcess}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Embeddings
              </>
            )}
          </button>

          {hasRecordsToProcess && !isPending && (
            <p className="mt-2 text-xs text-muted-foreground">
              Processes up to 50 records at a time. Run multiple times for large datasets.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
