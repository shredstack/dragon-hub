"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { duplicateHunt } from "@/actions/scavenger-hunts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * "Run this hunt again" — used from both the hunt list and a hunt's own
 * settings, so the promise it makes about what carries over is written once.
 *
 * It lands the board on the copy rather than back where they started, because
 * the next thing after copying is always editing the copy.
 */
export function DuplicateHuntDialog({
  huntId,
  huntTitle,
  open,
  onOpenChange,
}: {
  huntId: string;
  huntTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(`${huntTitle} (Copy)`);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The list renders one dialog for whichever card was clicked, so the default
  // name has to follow the target rather than stay on the first one opened.
  useEffect(() => {
    if (open) {
      setTitle(`${huntTitle} (Copy)`);
      setError(null);
    }
  }, [open, huntTitle]);

  const handleDuplicate = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const copy = await duplicateHunt(huntId, title);
      router.push(`/admin/scavenger-hunts/${copy.id}`);
    } catch (err) {
      console.error("Failed to duplicate hunt:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't copy the hunt. Please try again."
      );
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate &ldquo;{huntTitle}&rdquo;</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="duplicate-hunt-title">New Hunt Name *</Label>
            <Input
              id="duplicate-hunt-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Back to School Night Hunt 2026"
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">What carries over</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>Every item, in order — with its emoji, image, link and questions</li>
              <li>The intro and finish messages</li>
              <li>The finisher settings and where finishers go next</li>
              <li>Which recurring event it&apos;s filed under</li>
            </ul>
            <p className="mt-3 font-medium text-foreground">What starts fresh</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>An empty leaderboard — no players, scores or finishers</li>
              <li>A new QR code, so the old poster keeps pointing at the old hunt</li>
              <li>Draft status, with no open or close time set</li>
            </ul>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDuplicate}
            disabled={isSaving || !title.trim()}
          >
            {isSaving ? "Copying..." : "Create Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
