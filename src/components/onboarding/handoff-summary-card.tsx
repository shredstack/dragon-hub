"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { generateHandoffSummary } from "@/actions/handoff-notes";
import type { HandoffSummaryView } from "@/actions/handoff-notes";
import type { PtaBoardPosition } from "@/types";
import { ListChecks, Loader2, RefreshCw, Sparkles, Repeat } from "lucide-react";

interface HandoffSummaryCardProps {
  position: PtaBoardPosition;
  positionLabel: string;
  summary: HandoffSummaryView | null;
  /** How many notes exist for this position — nothing to summarize at zero. */
  noteCount: number;
}

/**
 * The "read every year in two minutes" view: unique points distilled from all
 * handoff notes ever written for this position, with the years that made each
 * point so a reader can tell one-off remarks from standing advice.
 */
export function HandoffSummaryCard({
  position,
  positionLabel,
  summary,
  noteCount,
}: HandoffSummaryCardProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    const result = await generateHandoffSummary(position);
    setIsGenerating(false);

    if (!result.success) {
      setError(result.error ?? "Failed to build summary");
      return;
    }
    router.refresh();
  };

  if (noteCount === 0) return null;

  const generateButton = (
    <Button
      type="button"
      variant={summary ? "ghost" : "secondary"}
      size="sm"
      onClick={handleGenerate}
      disabled={isGenerating}
    >
      {isGenerating ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Summarizing...
        </>
      ) : (
        <>
          {summary ? (
            <RefreshCw className="mr-2 h-4 w-4" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {summary ? "Regenerate" : "Summarize All Notes"}
        </>
      )}
    </Button>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary">
              <ListChecks className="h-4 w-4" />
            </div>
            <div>
              <p className="font-semibold">
                Everything past {positionLabel}s have said
              </p>
              <p className="text-sm text-muted-foreground">
                {summary
                  ? `${summary.noteCount} note${summary.noteCount === 1 ? "" : "s"}${
                      summary.yearRange ? ` · ${summary.yearRange}` : ""
                    }`
                  : `Distill ${noteCount} note${noteCount === 1 ? "" : "s"} into a bullet briefing you can skim.`}
              </p>
            </div>
          </div>
          <div className="self-end sm:self-start">{generateButton}</div>
        </div>
        {summary?.isStale && (
          <p className="mt-2 text-sm text-amber-600 dark:text-amber-500">
            Notes have changed since this summary was built — regenerate to fold
            them in.
          </p>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </CardHeader>

      {summary && (
        <CardContent className="space-y-5 pt-0">
          {summary.content.overview && (
            <p className="text-sm text-muted-foreground">
              {summary.content.overview}
            </p>
          )}

          {summary.content.sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <p className="text-sm font-medium">{section.title}</p>
              <ul className="space-y-2">
                {section.bullets.map((bullet, index) => (
                  <li
                    key={`${section.title}-${index}`}
                    className="flex gap-2 text-sm"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60"
                      aria-hidden
                    />
                    <span className="text-muted-foreground">
                      {bullet.text}
                      {bullet.years.length > 0 && (
                        <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
                          {bullet.recurring && (
                            <Badge variant="secondary" className="gap-1">
                              <Repeat className="h-3 w-3" />
                              {bullet.years.length} years
                            </Badge>
                          )}
                          {!bullet.recurring && (
                            <Badge variant="outline">{bullet.years[0]}</Badge>
                          )}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {summary.generatedAt && (
            <p className="text-xs text-muted-foreground">
              AI summary built{" "}
              {new Date(summary.generatedAt).toLocaleDateString()}. Always check
              the original notes below for the full detail.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
