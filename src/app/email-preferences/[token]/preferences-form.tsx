"use client";

import { useState } from "react";
import { updateEmailPreferenceByToken } from "@/actions/email-preferences";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function PreferencesForm({
  token,
  committeeDigest,
}: {
  token: string;
  committeeDigest: boolean;
}) {
  const [enabled, setEnabled] = useState(committeeDigest);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (next: boolean) => {
    // Optimistic: the switch is the whole interface, and a lag between tap and
    // move reads as broken.
    setEnabled(next);
    setSaved(false);
    setError(null);
    try {
      const ok = await updateEmailPreferenceByToken(token, next);
      if (!ok) {
        setEnabled(!next);
        setError("That link is no longer valid.");
        return;
      }
      setSaved(true);
    } catch {
      setEnabled(!next);
      setError("Couldn't save that. Please try again.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="digest-toggle" className="text-sm font-medium">
            Weekly committee digest
          </Label>
          <p className="text-xs text-muted-foreground">
            A Sunday summary of messages, tasks due, and who joined — one email
            covering every committee you&apos;re on.
          </p>
        </div>
        <Switch
          id="digest-toggle"
          checked={enabled}
          onCheckedChange={handleChange}
        />
      </div>

      {saved && (
        <p className="text-sm text-green-700">
          {enabled
            ? "You'll keep getting the weekly digest."
            : "You're unsubscribed. You won't get the weekly digest any more."}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
