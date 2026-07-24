"use client";

import { useState } from "react";
import {
  submitHuntItemAnswers,
  type PublicHuntItem,
  type ToggleResult,
} from "@/actions/scavenger-hunts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SmartLink } from "@/components/ui/smart-link";

/**
 * The yes/no question flow a player walks when they tap a question item's check
 * target. Questions are shown one at a time; a gated question answered anything
 * other than its `continueValue` ends the flow early (and still completes the
 * item). The gate is mirrored on the server — this is UX, not the source of
 * truth.
 */
export function QuestionFlowDialog({
  code,
  item,
  onClose,
  onCompleted,
}: {
  code: string;
  item: PublicHuntItem;
  onClose: () => void;
  onCompleted: (result: ToggleResult) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, "yes" | "no">>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const questions = item.questions;
  const current = questions[index];
  const isLast = index === questions.length - 1;

  const submit = async (finalAnswers: Record<string, "yes" | "no">) => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await submitHuntItemAnswers(code, item.id, finalAnswers);
      if (!result.success) {
        setError(result.error ?? "That didn't save. Please try again.");
        setIsSaving(false);
        return;
      }
      onCompleted(result);
    } catch (err) {
      console.error("Failed to submit answers:", err);
      setError("That didn't save. Check your signal and try again.");
      setIsSaving(false);
    }
  };

  const handleAnswer = async (value: "yes" | "no") => {
    if (isSaving) return;
    const next = { ...answers, [current.id]: value };
    setAnswers(next);

    // A gated question answered the wrong way ends the flow here; so does the
    // last question. Otherwise move on to the next one.
    const ends = (current.continueValue && value !== current.continueValue) || isLast;
    if (ends) {
      await submit(next);
    } else {
      setIndex((i) => i + 1);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <span className="mr-1" aria-hidden="true">
              {item.emoji}
            </span>
            {item.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {item.description && (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          )}

          {/* The attachment — the budget doc, framed in a popup so answering
              doesn't cost the player the hunt they're standing in. */}
          {item.linkUrl && (
            <SmartLink
              id={item.id}
              url={item.linkUrl}
              openMode={item.linkOpenMode}
              title={item.linkLabel || item.title}
              iconEmoji={item.emoji}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border border-dragon-blue-300 bg-dragon-blue-50 px-4 text-sm font-medium text-dragon-blue-700 hover:bg-dragon-blue-100"
            >
              📄 {item.linkLabel || "Review the document"}
            </SmartLink>
          )}

          {questions.length > 1 && (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Question {index + 1} of {questions.length}
            </p>
          )}

          <p className="text-lg font-medium">{current.prompt}</p>

          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-14 text-base"
              disabled={isSaving}
              onClick={() => handleAnswer("yes")}
            >
              👍 Yes
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-14 text-base"
              disabled={isSaving}
              onClick={() => handleAnswer("no")}
            >
              👎 No
            </Button>
          </div>

          {index > 0 && !isSaving && (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              className="text-sm text-muted-foreground underline"
            >
              ← Back
            </button>
          )}

          {item.saveResponses && (
            <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              Your answers are shared with the PTA board. Your name stays your
              code name — no personal details are saved. 🦄
            </p>
          )}

          {isSaving && (
            <p className="text-sm text-muted-foreground">Saving…</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
