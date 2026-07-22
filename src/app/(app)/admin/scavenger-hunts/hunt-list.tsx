"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createHunt, type HuntStatus } from "@/actions/scavenger-hunts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface HuntRow {
  id: string;
  title: string;
  schoolYear: string;
  status: HuntStatus | string;
  showOnSignupSuccess: boolean;
  itemCount: number;
  playerCount: number;
  finisherCount: number;
}

const STATUS_VARIANT: Record<string, "default" | "success" | "secondary"> = {
  draft: "secondary",
  active: "success",
  closed: "default",
};

export function HuntList({ hunts }: { hunts: HuntRow[] }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const hunt = await createHunt({ title, intro });
      router.push(`/admin/scavenger-hunts/${hunt.id}`);
    } catch (err) {
      console.error("Failed to create hunt:", err);
      setError("Couldn't create the hunt. Please try again.");
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setIsCreating(true)}>New Hunt</Button>
      </div>

      {hunts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No hunts yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create one for Back to School Night, add the things families should
            go find, and print the QR code for the welcome table.
          </p>
          <Button className="mt-4" onClick={() => setIsCreating(true)}>
            Create Your First Hunt
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hunts.map((hunt) => (
            <Link
              key={hunt.id}
              href={`/admin/scavenger-hunts/${hunt.id}`}
              className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-dragon-blue-300"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{hunt.title}</p>
                <Badge variant={STATUS_VARIANT[hunt.status] ?? "default"}>
                  {hunt.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {hunt.schoolYear}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span>
                  {hunt.itemCount} item{hunt.itemCount === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span>{hunt.playerCount} playing</span>
                <span>·</span>
                <span>{hunt.finisherCount} finished</span>
              </div>
              {hunt.showOnSignupSuccess && (
                <Badge variant="secondary" className="mt-3">
                  On sign-up success screen
                </Badge>
              )}
            </Link>
          ))}
        </div>
      )}

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Scavenger Hunt</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="hunt-title">Hunt Name *</Label>
              <Input
                id="hunt-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Back to School Night Hunt"
              />
            </div>
            <div>
              <Label htmlFor="hunt-intro">Intro Message</Label>
              <Textarea
                id="hunt-intro"
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                placeholder="Find all 12 and show your screen at the PTA table for a prize!"
                rows={3}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              You&apos;ll add the items and publish it on the next screen. New
              hunts start as drafts, so nothing is visible to families yet.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving || !title.trim()}>
              {isSaving ? "Creating..." : "Create Hunt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
