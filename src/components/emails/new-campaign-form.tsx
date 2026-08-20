"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, RotateCcw, Copy, FilePlus } from "lucide-react";
import {
  createEmailCampaign,
  cloneEmailCampaign,
  generateEmailDraft,
} from "@/actions/email-campaigns";
import { formatDateOnlyRange } from "@/lib/date-only";
import type { EmailCampaignStatus } from "@/types";

export interface CloneableCampaign {
  id: string;
  title: string;
  weekStart: string;
  weekEnd: string;
  status: EmailCampaignStatus;
}

interface NewCampaignFormProps {
  defaultWeekStart: string;
  defaultWeekEnd: string;
  /** Past emails offered as a starting point, newest first. */
  pastCampaigns: CloneableCampaign[];
}

/**
 * How the new email starts out. All three land in the same editor — the only
 * difference is what's in it on arrival.
 */
type StartMode = "clone" | "blank" | "ai";

function formatDateRange(weekStart: string, weekEnd: string): string {
  return formatDateOnlyRange(weekStart, weekEnd, { month: "long" });
}

function generateDefaultTitle(weekStart: string, weekEnd: string): string {
  return `PTA Member Update ${formatDateRange(weekStart, weekEnd)}`;
}

export function NewCampaignForm({
  defaultWeekStart,
  defaultWeekEnd,
  pastCampaigns,
}: NewCampaignFormProps) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [weekEnd, setWeekEnd] = useState(defaultWeekEnd);
  const [title, setTitle] = useState(generateDefaultTitle(defaultWeekStart, defaultWeekEnd));
  const [hasCustomTitle, setHasCustomTitle] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyMode, setBusyMode] = useState<StartMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Copying last week is the common case, so it's the default when there is
  // something to copy — and the most recent email is what she means by "last
  // week's".
  const [cloneSourceId, setCloneSourceId] = useState(
    pastCampaigns[0]?.id ?? ""
  );

  // Update title when dates change (only if user hasn't customized it)
  useEffect(() => {
    if (!hasCustomTitle) {
      setTitle(generateDefaultTitle(weekStart, weekEnd));
    }
  }, [weekStart, weekEnd, hasCustomTitle]);

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    setHasCustomTitle(newTitle !== generateDefaultTitle(weekStart, weekEnd));
  }

  function resetToDefaultTitle() {
    setTitle(generateDefaultTitle(weekStart, weekEnd));
    setHasCustomTitle(false);
  }

  async function handleCreate(mode: StartMode) {
    setIsSubmitting(true);
    setBusyMode(mode);
    setError(null);

    try {
      const campaign =
        mode === "clone"
          ? await cloneEmailCampaign(cloneSourceId, {
              title,
              weekStart,
              weekEnd,
            })
          : await createEmailCampaign({ title, weekStart, weekEnd });

      if (mode === "ai") {
        await generateEmailDraft(campaign.id);
      }

      router.push(`/emails/${campaign.id}`);
    } catch (err) {
      console.error("Failed to create campaign:", err);
      setError(
        err instanceof Error
          ? err.message
          : "That didn't work. Try again."
      );
      setIsSubmitting(false);
      setBusyMode(null);
    }
  }

  const canClone = pastCampaigns.length > 0 && Boolean(cloneSourceId);

  return (
    <Card className="p-6">
      <form className="space-y-6">
        <div>
          <label htmlFor="title" className="mb-2 block text-sm font-medium">
            Email Title
          </label>
          <div className="flex gap-2">
            <Input
              id="title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              disabled={isSubmitting}
              placeholder="Enter email title"
            />
            {hasCustomTitle && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={resetToDefaultTitle}
                disabled={isSubmitting}
                title="Reset to auto-generated title"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasCustomTitle
              ? "Using custom title. Click reset to use auto-generated title."
              : "Auto-generated from date range. Edit to customize."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="weekStart" className="mb-2 block text-sm font-medium">
              Start Date
            </label>
            <Input
              id="weekStart"
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label htmlFor="weekEnd" className="mb-2 block text-sm font-medium">
              End Date
            </label>
            <Input
              id="weekEnd"
              type="date"
              value={weekEnd}
              onChange={(e) => setWeekEnd(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          Defaults to next week. However you start, anything submitted for these
          dates is pulled in automatically, along with your recurring sections.
        </p>

        {pastCampaigns.length > 0 && (
          <div className="rounded-lg border border-border p-4">
            <label
              htmlFor="cloneSource"
              className="mb-2 block text-sm font-medium"
            >
              Start from a previous email
            </label>
            <select
              id="cloneSource"
              value={cloneSourceId}
              onChange={(e) => setCloneSourceId(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {pastCampaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.title}
                  {campaign.status === "sent" ? " (sent)" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Copies every section into a new email you can edit freely. The
              email you copy from is untouched.
            </p>

            <Button
              type="button"
              onClick={() => handleCreate("clone")}
              disabled={isSubmitting || !canClone}
              className="mt-3 w-full"
            >
              {busyMode === "clone" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copy this email
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleCreate("blank")}
            disabled={isSubmitting}
            className="flex-1"
          >
            {busyMode === "blank" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FilePlus className="h-4 w-4" />
            )}
            Start from scratch
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => handleCreate("ai")}
            disabled={isSubmitting}
            className="flex-1"
          >
            {busyMode === "ai" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Draft with AI
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {busyMode === "ai" && (
          <p className="text-center text-sm text-muted-foreground">
            Drafting the email... This may take a moment.
          </p>
        )}
      </form>
    </Card>
  );
}
