"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { EligibilityNotice } from "@/components/volunteer/eligibility-notice";
import { LinkOpenModeField } from "@/components/ui/link-open-mode-field";
import { updateVolunteerEligibility } from "@/actions/volunteer-signups";
import {
  DEFAULT_VOLUNTEER_ELIGIBILITY,
  isSafeEligibilityUrl,
  normalizeEligibilityUrl,
  type VolunteerEligibilityInfo,
} from "@/lib/volunteer-eligibility";
import { defaultOpenModeFor } from "@/lib/links-shared";
import { Loader2, RotateCcw } from "lucide-react";

interface Props {
  initialEligibility: VolunteerEligibilityInfo;
}

export function EligibilityEditor({ initialEligibility }: Props) {
  const { addToast } = useToast();
  const [info, setInfo] = useState(initialEligibility);
  const [saved, setSaved] = useState(initialEligibility);
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = JSON.stringify(info) !== JSON.stringify(saved);

  function set<K extends keyof VolunteerEligibilityInfo>(
    key: K,
    value: VolunteerEligibilityInfo[K]
  ) {
    setInfo((prev) => ({ ...prev, [key]: value }));
  }

  // Pasting a district URL picks the open mode, the same way it does on the
  // dashboard links screen — most district sites refuse to be framed, and a
  // board member has no way to know which do.
  function setUrl(url: string) {
    setInfo((prev) => ({ ...prev, url, openMode: defaultOpenModeFor(url) }));
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const result = await updateVolunteerEligibility(info);
      if (!result.success) {
        addToast(result.error, "destructive");
        return;
      }
      setInfo(result.eligibility);
      setSaved(result.eligibility);
      addToast(
        result.eligibility.url
          ? "Volunteer eligibility reminder updated"
          : "Reminder turned off — no link is set",
        "success"
      );
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "Could not save changes",
        "destructive"
      );
    } finally {
      setIsSaving(false);
    }
  }

  // The preview mirrors the public confirmation screen, so what shows here is
  // literally what a parent sees. An unparseable URL previews as "off" the same
  // way the real surfaces treat it.
  const previewUrl = normalizeEligibilityUrl(info.url);
  const preview =
    previewUrl && isSafeEligibilityUrl(previewUrl)
      ? { ...info, url: previewUrl }
      : null;

  return (
    <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
      <div className="space-y-5">
        <div>
          <Label htmlFor="eligibility-url" className="mb-2 block">
            District volunteer application link
          </Label>
          <Input
            id="eligibility-url"
            value={info.url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourdistrict.org/volunteer"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Leave blank to hide the reminder everywhere. Nothing else on this
            page shows to parents until a link is set.
          </p>
        </div>

        <div>
          <Label htmlFor="eligibility-label" className="mb-2 block">
            Link text
          </Label>
          <Input
            id="eligibility-label"
            value={info.linkLabel}
            onChange={(e) => set("linkLabel", e.target.value)}
            placeholder={DEFAULT_VOLUNTEER_ELIGIBILITY.linkLabel}
          />
        </div>

        <LinkOpenModeField
          value={info.openMode}
          onChange={(openMode) => set("openMode", openMode)}
        />

        <div>
          <Label htmlFor="eligibility-note" className="mb-2 block">
            Message
          </Label>
          <Textarea
            id="eligibility-note"
            rows={5}
            value={info.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder={DEFAULT_VOLUNTEER_ELIGIBILITY.note}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Explain that the district requires this once every school year, even
            for returning volunteers.
          </p>
        </div>

        <div>
          <Label htmlFor="eligibility-deadline" className="mb-2 block">
            Deadline (optional)
          </Label>
          <Input
            id="eligibility-deadline"
            value={info.deadline}
            onChange={(e) => set("deadline", e.target.value)}
            placeholder="Renew by September 15 to help at fall parties."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setInfo({
                ...DEFAULT_VOLUNTEER_ELIGIBILITY,
                url: info.url,
                openMode: info.openMode,
              })
            }
            disabled={isSaving}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset wording
          </Button>
          {isDirty && (
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          What parents see
        </h2>
        <div className="rounded-lg border border-border bg-muted p-4">
          {preview ? (
            <EligibilityNotice eligibility={preview} />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Add a link above to preview the reminder.
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          This appears on the confirmation screen after someone signs up through
          the room parent QR code or a volunteer campaign, and in the welcome
          email they receive.
        </p>
      </div>
    </div>
  );
}
