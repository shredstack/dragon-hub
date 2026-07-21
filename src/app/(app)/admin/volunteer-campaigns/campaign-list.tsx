"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCampaign, type CampaignStatus } from "@/actions/volunteer-campaigns";
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

interface CampaignRow {
  id: string;
  title: string;
  schoolYear: string;
  status: CampaignStatus | string;
  showOnRoomParentSignup: boolean;
  eventCount: number;
  interestCount: number;
}

const STATUS_VARIANT: Record<string, "default" | "success" | "secondary"> = {
  draft: "secondary",
  active: "success",
  closed: "default",
};

export function CampaignList({ campaigns }: { campaigns: CampaignRow[] }) {
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
      const campaign = await createCampaign({ title, intro });
      router.push(`/admin/volunteer-campaigns/${campaign.id}`);
    } catch (err) {
      console.error("Failed to create campaign:", err);
      setError("Couldn't create the campaign. Please try again.");
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setIsCreating(true)}>New Campaign</Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No campaigns yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create one for the school year, add the events you want volunteers
            for, and print the QR code for Back to School Night.
          </p>
          <Button className="mt-4" onClick={() => setIsCreating(true)}>
            Create Your First Campaign
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/admin/volunteer-campaigns/${campaign.id}`}
              className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-dragon-blue-300"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{campaign.title}</p>
                <Badge variant={STATUS_VARIANT[campaign.status] ?? "default"}>
                  {campaign.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {campaign.schoolYear}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span>
                  {campaign.eventCount} event
                  {campaign.eventCount === 1 ? "" : "s"}
                </span>
                <span>·</span>
                <span>
                  {campaign.interestCount} interested
                </span>
              </div>
              {campaign.showOnRoomParentSignup && (
                <Badge variant="secondary" className="mt-3">
                  On room parent sign-up
                </Badge>
              )}
            </Link>
          ))}
        </div>
      )}

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Volunteer Campaign</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="campaign-title">Campaign Name *</Label>
              <Input
                id="campaign-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="2026-2027 PTA Volunteer Interest"
              />
            </div>
            <div>
              <Label htmlFor="campaign-intro">Intro Message</Label>
              <Textarea
                id="campaign-intro"
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                placeholder="We'd love your help this year! Check any events you might be interested in — this isn't a commitment."
                rows={3}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              You&apos;ll add events and publish it on the next screen. New
              campaigns start as drafts, so nothing is visible to parents yet.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreating(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isSaving || !title.trim()}>
              {isSaving ? "Creating..." : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
