"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, RotateCcw } from "lucide-react";
import { createEmailCampaign, generateEmailDraft } from "@/actions/email-campaigns";

interface NewCampaignFormProps {
  defaultWeekStart: string;
  defaultWeekEnd: string;
}

function formatDateRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  const startMonth = start.toLocaleDateString("en-US", { month: "long" });
  const endMonth = end.toLocaleDateString("en-US", { month: "long" });
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay}-${endDay}`;
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
}

function generateDefaultTitle(weekStart: string, weekEnd: string): string {
  return `PTA Member Update ${formatDateRange(weekStart, weekEnd)}`;
}

export function NewCampaignForm({
  defaultWeekStart,
  defaultWeekEnd,
}: NewCampaignFormProps) {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [weekEnd, setWeekEnd] = useState(defaultWeekEnd);
  const [title, setTitle] = useState(generateDefaultTitle(defaultWeekStart, defaultWeekEnd));
  const [hasCustomTitle, setHasCustomTitle] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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

  async function handleSubmit(e: React.FormEvent, generateDraft: boolean) {
    e.preventDefault();
    setIsSubmitting(true);
    if (generateDraft) setIsGenerating(true);

    try {
      // Create the campaign
      const campaign = await createEmailCampaign({
        title,
        weekStart,
        weekEnd,
      });

      // Optionally generate AI draft
      if (generateDraft) {
        await generateEmailDraft(campaign.id);
      }

      router.push(`/emails/${campaign.id}`);
    } catch (error) {
      console.error("Failed to create campaign:", error);
      setIsSubmitting(false);
      setIsGenerating(false);
    }
  }

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

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={(e) => handleSubmit(e, false)}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting && !isGenerating && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Create Empty Email
          </Button>

          <Button
            type="button"
            onClick={(e) => handleSubmit(e, true)}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Create & Generate with AI
          </Button>
        </div>

        {isGenerating && (
          <p className="text-center text-sm text-muted-foreground">
            Generating email draft... This may take a moment.
          </p>
        )}
      </form>
    </Card>
  );
}
