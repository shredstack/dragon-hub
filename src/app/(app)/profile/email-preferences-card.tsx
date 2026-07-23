"use client";

import { useEffect, useState } from "react";
import {
  getMyEmailPreferences,
  updateMyEmailPreferences,
} from "@/actions/email-preferences";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * The signed-in half of the unsubscribe story. The emailed link works without a
 * session; this is for the person who goes looking for the setting instead.
 *
 * Fetches its own state rather than being threaded through the profile form —
 * an email preference isn't part of the profile record, and coupling them would
 * mean a failed preference read blocks editing your name.
 */
export function EmailPreferencesCard() {
  const [committeeDigest, setCommitteeDigest] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyEmailPreferences()
      .then((p) => setCommitteeDigest(p.committeeDigest))
      .catch(() => setError("Couldn't load your email preferences."));
  }, []);

  const handleChange = async (next: boolean) => {
    const previous = committeeDigest;
    setCommitteeDigest(next);
    setError(null);
    try {
      await updateMyEmailPreferences(next);
    } catch {
      setCommitteeDigest(previous);
      setError("Couldn't save that. Please try again.");
    }
  };

  if (committeeDigest === null && !error) return null;

  return (
    <div className="mt-6 space-y-4 rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Email</h2>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="profile-digest" className="text-sm font-medium">
            Weekly committee digest
          </Label>
          <p className="text-xs text-muted-foreground">
            A Sunday summary of messages, tasks due this week, and who joined —
            one email covering every committee you&apos;re on.
          </p>
        </div>
        <Switch
          id="profile-digest"
          checked={committeeDigest ?? true}
          onCheckedChange={handleChange}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
