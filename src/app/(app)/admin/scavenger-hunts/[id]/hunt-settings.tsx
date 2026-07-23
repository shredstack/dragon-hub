"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  archiveHunt,
  deleteHunt,
  getHuntHistoryCounts,
  updateHunt,
  type HuntStatus,
} from "@/actions/scavenger-hunts";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface Hunt {
  id: string;
  title: string;
  intro: string | null;
  completionMessage: string | null;
  status: HuntStatus | string;
  showOnSignupSuccess: boolean;
  collectFinisherContact: boolean;
  ctaCampaignId: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
}

interface CampaignOption {
  id: string;
  title: string;
  status: string;
}

const STATUSES: Array<{ value: HuntStatus; label: string; hint: string }> = [
  { value: "draft", label: "Draft", hint: "Only you can see it" },
  { value: "active", label: "Active", hint: "Families can play" },
  { value: "closed", label: "Closed", hint: "Link stops accepting play" },
];

/**
 * yyyy-MM-ddTHH:mm for a datetime-local input, or "" when unset.
 *
 * Built from local-time parts, not `toISOString()`: a hunt opening at 5pm
 * Pacific is stored as midnight UTC the next day, and the UTC form would show
 * the board member the wrong evening entirely.
 */
function toDateTimeInput(value: Date | null): string {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** A datetime-local value is already local time; make the instant explicit. */
function fromDateTimeInput(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function HuntSettings({
  hunt,
  campaigns,
}: {
  hunt: Hunt;
  campaigns: CampaignOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(hunt.title);
  const [intro, setIntro] = useState(hunt.intro ?? "");
  const [completionMessage, setCompletionMessage] = useState(
    hunt.completionMessage ?? ""
  );
  const [status, setStatus] = useState<HuntStatus>(hunt.status as HuntStatus);
  const [showOnSignup, setShowOnSignup] = useState(hunt.showOnSignupSuccess);
  const [collectContact, setCollectContact] = useState(
    hunt.collectFinisherContact
  );
  const [ctaCampaignId, setCtaCampaignId] = useState(hunt.ctaCampaignId ?? "");
  const [opensAt, setOpensAt] = useState(toDateTimeInput(hunt.opensAt));
  const [closesAt, setClosesAt] = useState(toDateTimeInput(hunt.closesAt));
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateHunt(hunt.id, {
        title,
        intro,
        completionMessage,
        status,
        showOnSignupSuccess: showOnSignup,
        collectFinisherContact: collectContact,
        ctaCampaignId: ctaCampaignId || null,
        opensAt: fromDateTimeInput(opensAt),
        closesAt: fromDateTimeInput(closesAt),
      });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save hunt:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong saving these settings. Please try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    const ok = await confirm({
      title: `Archive "${hunt.title}"?`,
      description:
        "The hunt closes and its QR code stops working. Everyone who played stays on the results page, and you can restore it later.",
      confirmLabel: "Archive hunt",
      tone: "default",
    });
    if (!ok) return;

    setError(null);
    try {
      await archiveHunt(hunt.id);
      router.push("/admin/scavenger-hunts");
    } catch (err) {
      console.error("Failed to archive hunt:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong archiving this hunt. Please try again."
      );
    } finally {
      closeConfirm();
    }
  };

  const handleDelete = async () => {
    setError(null);

    // Ask the server what is attached before describing the damage — the same
    // counts decide whether it will allow the delete at all.
    const history = await getHuntHistoryCounts(hunt.id);

    if (!history.isEmpty) {
      await confirm({
        title: `"${hunt.title}" can't be deleted`,
        description: "It already has history attached:",
        consequences: history.lines,
        alternative:
          "Archive it instead — the hunt closes and its QR code stops working, but everyone who played stays on the results page.",
        confirmLabel: "Archive instead",
        cancelLabel: "Keep hunt",
        tone: "default",
      }).then(async (archive) => {
        closeConfirm();
        if (archive) await handleArchive();
      });
      return;
    }

    const ok = await confirm({
      title: `Delete "${hunt.title}"?`,
      description:
        "Nobody has played yet, so nothing is lost. This removes the hunt and its items for good.",
      confirmLabel: "Delete hunt",
      confirmPhrase: hunt.title,
    });
    if (!ok) return;

    try {
      await deleteHunt(hunt.id);
      router.push("/admin/scavenger-hunts");
    } catch (err) {
      console.error("Failed to delete hunt:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong deleting this hunt. Please try again."
      );
    } finally {
      closeConfirm();
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">Hunt Settings</h2>

      <div className="space-y-4">
        <div>
          <Label htmlFor="title">Hunt Name</Label>
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
            placeholder="Shown at the top of the hunt page, before anyone starts."
          />
        </div>

        <div>
          <Label htmlFor="completion-message">Finish Message</Label>
          <Textarea
            id="completion-message"
            value={completionMessage}
            onChange={(e) => setCompletionMessage(e.target.value)}
            rows={2}
            placeholder="Show this screen at the PTA table to pick up your prize!"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Shown after the last item is checked off. This is where the prize
            instructions go — you can change it during the event.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="opens-at">Opens</Label>
            <Input
              id="opens-at"
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. Before this, the QR code shows a &ldquo;not open
              yet&rdquo; page.
            </p>
          </div>
          <div>
            <Label htmlFor="closes-at">Closes</Label>
            <Input
              id="closes-at"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. Leave blank to keep it open indefinitely.
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
            <p className="font-medium">Promote on the sign-up success screen</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Adds a &ldquo;play the scavenger hunt&rdquo; link after someone
              finishes the room parent sign-up, so one Back to School Night scan
              leads into the other.
            </p>
          </div>
          <Switch checked={showOnSignup} onCheckedChange={setShowOnSignup} />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <p className="font-medium">Ask finishers for a name and email</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional for the player, and only shown once they finish — it&apos;s
              how you find someone to hand a prize to. Never asks for a
              student&apos;s name.
            </p>
          </div>
          <Switch checked={collectContact} onCheckedChange={setCollectContact} />
        </div>

        <div className="rounded-lg border border-border p-4">
          <Label htmlFor="cta-campaign" className="font-medium">
            Where finishers go next
          </Label>
          <p className="mb-2 mt-1 text-sm text-muted-foreground">
            After the celebration, finishers get a button into this volunteer
            campaign — the hunt&apos;s real goal. Signing up there also emails
            them a one-tap login into DragonHub, so it works even for players who
            never gave you their email. Leave it blank for no button.
          </p>
          <select
            id="cta-campaign"
            value={ctaCampaignId}
            onChange={(e) => setCtaCampaignId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">No button — just the celebration</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.status !== "active" ? ` (${c.status} — won't show yet)` : ""}
              </option>
            ))}
          </select>
          {campaigns.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              No volunteer campaigns yet. Create one under{" "}
              <Link
                href="/admin/volunteer-campaigns"
                className="text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
              >
                Volunteer Campaigns
              </Link>{" "}
              first, then point this hunt at it.
            </p>
          )}
          {/* The public finish screen hides the button unless the chosen
              campaign is actually open, so a draft pick is a no-op until it
              goes live rather than a dead link. */}
          {ctaCampaignId &&
            campaigns.find((c) => c.id === ctaCampaignId)?.status !==
              "active" && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                This campaign isn&apos;t active, so finishers won&apos;t see the
                button until you set it to Active on its own page.
              </p>
            )}
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
          <Button variant="outline" className="ml-auto" onClick={handleArchive}>
            Archive Hunt
          </Button>
          <Button
            variant="outline"
            className="text-red-600 hover:text-red-700"
            onClick={handleDelete}
          >
            Delete Hunt
          </Button>
        </div>
      </div>

      {confirmDialog}
    </div>
  );
}
