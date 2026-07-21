"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCampaign,
  updateCampaign,
  type CampaignStatus,
} from "@/actions/volunteer-campaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface Campaign {
  id: string;
  title: string;
  intro: string | null;
  status: CampaignStatus | string;
  showOnRoomParentSignup: boolean;
  contactEmail: string | null;
  closesAt: Date | null;
}

const STATUSES: Array<{ value: CampaignStatus; label: string; hint: string }> = [
  { value: "draft", label: "Draft", hint: "Only you can see it" },
  { value: "active", label: "Active", hint: "Parents can sign up" },
  { value: "closed", label: "Closed", hint: "Link stops accepting responses" },
];

/**
 * yyyy-MM-dd for a date input, or "" when unset.
 *
 * Built from local-time parts, not `toISOString()`: a campaign closing at
 * 11:59pm on the 30th Pacific is stored as 06:59 UTC on the 31st, and the UTC
 * form would show the board member the wrong day.
 */
function toDateInput(value: Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * End of the given yyyy-MM-dd in the board member's own timezone, as a UTC
 * instant. Appending a bare "T23:59:59" instead would be read in the server's
 * timezone (UTC on Vercel), closing a Pacific school's campaign at 4:59pm.
 */
function endOfLocalDay(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

export function CampaignSettings({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [title, setTitle] = useState(campaign.title);
  const [intro, setIntro] = useState(campaign.intro ?? "");
  const [status, setStatus] = useState<CampaignStatus>(
    campaign.status as CampaignStatus
  );
  const [showOnRoomParent, setShowOnRoomParent] = useState(
    campaign.showOnRoomParentSignup
  );
  const [contactEmail, setContactEmail] = useState(campaign.contactEmail ?? "");
  const [closesAt, setClosesAt] = useState(toDateInput(campaign.closesAt));
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateCampaign(campaign.id, {
        title,
        intro,
        status,
        showOnRoomParentSignup: showOnRoomParent,
        contactEmail,
        // End-of-day local, so a campaign closing "on the 30th" stays open
        // through the 30th where the school actually is.
        closesAt: closesAt ? endOfLocalDay(closesAt) : null,
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save campaign:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong saving these settings. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        "Delete this campaign? Every event and every volunteer response on it will be permanently removed."
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteCampaign(campaign.id);
      router.push("/admin/volunteer-campaigns");
    } catch (err) {
      console.error("Failed to delete campaign:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong deleting this campaign. Please try again."
      );
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Campaign Settings</h2>

      <div className="space-y-4">
        <div>
          <Label htmlFor="title">Campaign Name</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="intro">Intro Message</Label>
          <Textarea
            id="intro"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            rows={3}
            placeholder="Shown at the top of the sign-up page."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-email">Questions Go To</Label>
            <Input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="volunteers@ourpta.org"
            />
          </div>
          <div>
            <Label htmlFor="closes-at">Closes On</Label>
            <Input
              id="closes-at"
              type="date"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. Leave blank to keep it open all year.
            </p>
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Status</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {STATUSES.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors ${
                  status === option.value
                    ? "border-dragon-blue-500 bg-dragon-blue-50"
                    : "border-border hover:border-dragon-blue-300"
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  checked={status === option.value}
                  onChange={() => setStatus(option.value)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <p className="font-medium">Add to room parent sign-up page</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Shows these events underneath the room parent section, so one Back
              to School Night scan captures both. Room parent sign-up stays first
              on the page. Only one campaign at a time can do this.
            </p>
          </div>
          <Switch
            checked={showOnRoomParent}
            onCheckedChange={setShowOnRoomParent}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={isSaving || !title.trim()}>
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
          {saved && <span className="text-sm text-green-700">Saved</span>}
          <Button
            variant="outline"
            className="ml-auto text-red-600 hover:text-red-700"
            onClick={handleDelete}
          >
            Delete Campaign
          </Button>
        </div>
      </div>
    </div>
  );
}
