"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Sparkles, ThumbsUp, Pencil } from "lucide-react";
import type { EmailReviewResult, EmailReviewNote } from "@/lib/ai/email-review";

interface EmailReviewPanelProps {
  result: EmailReviewResult | null;
  isReviewing: boolean;
  error: string | null;
  onClose: () => void;
  /** Opens the section a note points at, so the fix is one click away. */
  onOpenSection?: (sectionIndex: number) => void;
}

const SEVERITY_STYLES: Record<EmailReviewNote["severity"], string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-700",
};

const SEVERITY_LABELS: Record<EmailReviewNote["severity"], string> = {
  high: "Worth fixing",
  medium: "Suggestion",
  low: "Minor",
};

/**
 * The readability review, as notes the secretary can take or leave.
 *
 * Every note is advisory — there is deliberately no "apply this" button. The
 * email is hers; the model's job is to point, not to edit.
 */
export function EmailReviewPanel({
  result,
  isReviewing,
  error,
  onClose,
  onOpenSection,
}: EmailReviewPanelProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Readability review
          </DialogTitle>
          <DialogDescription>
            Suggestions only — nothing here changes your email. Take the ones
            you agree with.
          </DialogDescription>
        </DialogHeader>

        {isReviewing && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Reading your draft...
          </div>
        )}

        {error && !isReviewing && (
          <p className="py-8 text-center text-sm text-destructive">{error}</p>
        )}

        {result && !isReviewing && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium">Overall</span>
                <Badge variant="secondary">
                  {result.readabilityScore}/5 readability
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{result.summary}</p>
            </div>

            {result.strengths.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Working well
                </h3>
                <ul className="space-y-1">
                  {result.strengths.map((strength, i) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      • {strength}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.notes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                Nothing to flag — this reads well.
              </p>
            ) : (
              <div>
                <h3 className="mb-2 text-sm font-medium">
                  Suggestions ({result.notes.length})
                </h3>
                <div className="space-y-3">
                  {result.notes.map((note, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-border bg-card p-3"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={`text-xs ${SEVERITY_STYLES[note.severity]}`}
                        >
                          {SEVERITY_LABELS[note.severity]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {note.sectionTitle
                            ? note.sectionTitle
                            : "Whole email"}
                        </span>
                        {note.sectionIndex !== null && onOpenSection && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-6 px-2 text-xs"
                            onClick={() => onOpenSection(note.sectionIndex!)}
                          >
                            <Pencil className="h-3 w-3" />
                            Open
                          </Button>
                        )}
                      </div>
                      <p className="text-sm">{note.issue}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Try:</span>{" "}
                        {note.suggestion}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
