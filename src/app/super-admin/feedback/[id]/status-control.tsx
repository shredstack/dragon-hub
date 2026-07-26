"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setFeedbackStatus } from "@/actions/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  FEEDBACK_STATUSES,
  feedbackStatusLabel,
} from "@/lib/feedback-shared";
import type { FeedbackStatus } from "@/actions/feedback";

export function StatusControl({
  feedbackId,
  current,
}: {
  feedbackId: string;
  current: FeedbackStatus;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [saving, setSaving] = useState<FeedbackStatus | null>(null);

  const change = async (status: FeedbackStatus) => {
    if (status === current || saving) return;
    setSaving(status);
    try {
      const result = await setFeedbackStatus(feedbackId, status);
      if (!result.success) {
        addToast(result.error ?? "Couldn't update status.", "destructive");
        return;
      }
      addToast(
        status === "completed"
          ? "Marked completed — the submitter was emailed."
          : `Status set to ${feedbackStatusLabel(status)}.`,
        "success"
      );
      router.refresh();
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Couldn't update status.",
        "destructive"
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {FEEDBACK_STATUSES.map((s) => {
        const active = s === current;
        return (
          <button
            key={s}
            type="button"
            onClick={() => change(s)}
            disabled={!!saving}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            )}
          >
            {saving === s ? "Saving…" : feedbackStatusLabel(s)}
          </button>
        );
      })}
    </div>
  );
}
