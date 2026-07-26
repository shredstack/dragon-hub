"use client";

import { useState } from "react";
import Link from "next/link";
import { Bug, ImagePlus, Lightbulb, MessageSquarePlus, X } from "lucide-react";
import { submitFeedback, type FeedbackType } from "@/actions/feedback";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PageContext {
  pageUrl: string;
  pageTitle: string;
  dialogContext: string;
  userAgent: string;
}

/**
 * Snapshot of where the user is, taken the instant they click the button —
 * before our own dialog opens, so it never mistakes itself for "the popup they
 * were on." `dialogContext` reads the accessible name of any dialog currently
 * open (Radix wires `aria-labelledby` to the DialogTitle), which is as close to
 * "the exact popup" as the DOM can tell us.
 */
function capturePageContext(): PageContext {
  if (typeof window === "undefined") {
    return { pageUrl: "", pageTitle: "", dialogContext: "", userAgent: "" };
  }
  const { pathname, search, hash } = window.location;

  let dialogContext = "";
  const openDialog = document.querySelector('[role="dialog"]');
  if (openDialog) {
    const labelledBy = openDialog.getAttribute("aria-labelledby");
    const labelEl = labelledBy ? document.getElementById(labelledBy) : null;
    dialogContext =
      labelEl?.textContent?.trim() ||
      openDialog.getAttribute("aria-label")?.trim() ||
      "";
  }

  return {
    pageUrl: `${pathname}${search}${hash}`,
    pageTitle: document.title,
    dialogContext,
    userAgent: navigator.userAgent,
  };
}

const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export function FeedbackWidget() {
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<PageContext | null>(null);
  const [type, setType] = useState<FeedbackType>("bug");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const openWidget = () => {
    // Capture BEFORE the dialog mounts so we read the page/popup underneath it.
    setContext(capturePageContext());
    setType("bug");
    setBody("");
    setFile(null);
    setError(null);
    setOpen(true);
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (picked && picked.size > MAX_SCREENSHOT_BYTES) {
      setError("That image is over 10MB. Please attach a smaller screenshot.");
      return;
    }
    setError(null);
    setFile(picked);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!body.trim()) {
      setError("Please describe the bug or improvement.");
      return;
    }

    setIsSaving(true);
    try {
      let screenshotUrl: string | undefined;
      if (file) {
        const res = await fetch("/api/upload/feedback-screenshot", {
          method: "POST",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't upload that screenshot.");
          return;
        }
        screenshotUrl = data.url;
      }

      const result = await submitFeedback({
        type,
        body: body.trim(),
        pageUrl: context?.pageUrl ?? "",
        pageTitle: context?.pageTitle,
        dialogContext: context?.dialogContext || undefined,
        userAgent: context?.userAgent,
        screenshotUrl,
      });

      if (!result.success) {
        setError(result.error ?? "Couldn't send your feedback.");
        return;
      }

      setOpen(false);
      addToast("Thanks! Your feedback was sent.", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your feedback.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Bottom-left so it never sits under the toaster (bottom-right, z-50). */}
      <button
        type="button"
        onClick={openWidget}
        aria-label="Send feedback"
        className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Report a bug or suggest an improvement. We&apos;ll record the page
              you&apos;re on so we can find it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>What kind of feedback?</Label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType("bug")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors",
                    type === "bug"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <Bug className="h-4 w-4" />
                  Bug
                </button>
                <button
                  type="button"
                  onClick={() => setType("improvement")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors",
                    type === "improvement"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <Lightbulb className="h-4 w-4" />
                  Improvement
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="feedback-body">
                {type === "bug"
                  ? "What went wrong?"
                  : "What would you improve?"}
              </Label>
              <Textarea
                id="feedback-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                placeholder={
                  type === "bug"
                    ? "Tell us what you expected and what happened instead."
                    : "Describe your idea — the more detail, the better."
                }
              />
            </div>

            <div>
              <Label htmlFor="feedback-screenshot">Screenshot (optional)</Label>
              <div className="mt-1.5">
                {file ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2 text-sm">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label="Remove screenshot"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="feedback-screenshot"
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground hover:bg-muted"
                  >
                    <ImagePlus className="h-4 w-4" />
                    Attach a screenshot
                  </label>
                )}
                <input
                  id="feedback-screenshot"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={onPickFile}
                />
              </div>
            </div>

            {context?.pageUrl && (
              <p className="text-xs text-muted-foreground">
                Sent from: <span className="font-mono">{context.pageUrl}</span>
                {context.dialogContext ? ` · ${context.dialogContext}` : ""}
              </p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <Link
              href="/feedback"
              onClick={() => setOpen(false)}
              className="text-sm text-primary hover:underline"
            >
              View your feedback →
            </Link>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSaving || !body.trim()}>
                {isSaving ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
