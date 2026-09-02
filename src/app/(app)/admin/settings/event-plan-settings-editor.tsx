"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, Loader2, Stamp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { updateEventPlanSettings } from "@/actions/school-membership";
import {
  MAX_APPROVAL_THRESHOLD,
  type EventPlanSettings,
} from "@/lib/event-plan-settings";

/**
 * The two rules that decide when an event plan is signed off and when it stops
 * being a working document.
 *
 * Both used to be hard-coded — two board votes, and nothing that ever closed a
 * plan out — and between them they produced a plan list full of parties that
 * had already happened and still said "Pending Approval".
 */
export function EventPlanSettingsEditor({
  schoolId,
  initialSettings,
}: {
  schoolId: string;
  initialSettings: EventPlanSettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const save = (next: EventPlanSettings) => {
    const previous = settings;
    setSettings(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateEventPlanSettings(schoolId, next);
      } catch (err) {
        setSettings(previous);
        setError(
          err instanceof Error ? err.message : "Couldn't save that setting."
        );
      }
    });
  };

  return (
    <div className="border-border bg-card rounded-lg border p-6">
      <h2 className="text-lg font-semibold">Event plans</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        How a plan gets signed off, and what happens to it once the event has
        come and gone.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div className="border-border flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <div className="bg-dragon-blue-500/10 text-dragon-blue-500 rounded-lg p-2">
              <Stamp className="h-5 w-5" />
            </div>
            <div>
              <label htmlFor="approval-threshold" className="font-medium">
                Approvals a plan needs
              </label>
              <p className="text-muted-foreground text-sm">
                Board votes before a submitted plan counts as approved.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {settings.approvalThreshold === 1
                  ? "One board member signs a plan off. Changing this doesn't re-open plans already approved."
                  : `${settings.approvalThreshold} board members have to vote before a plan is approved.`}
              </p>
            </div>
          </div>
          <select
            id="approval-threshold"
            value={settings.approvalThreshold}
            disabled={isPending}
            onChange={(e) =>
              save({ ...settings, approvalThreshold: Number(e.target.value) })
            }
            className="border-input bg-background shrink-0 rounded-md border px-3 py-2 text-sm"
          >
            {Array.from({ length: MAX_APPROVAL_THRESHOLD }, (_, i) => i + 1).map(
              (n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              )
            )}
          </select>
        </div>

        <div className="border-border flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <div className="bg-dragon-blue-500/10 text-dragon-blue-500 rounded-lg p-2">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <div>
              <label htmlFor="auto-complete-past" className="font-medium">
                Close out past events
              </label>
              <p className="text-muted-foreground text-sm">
                Mark a plan completed once its event date has passed.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {settings.autoCompletePastEvents
                  ? "Plans the board has already seen close themselves out the day after the event. Drafts are never touched — someone has to say those happened."
                  : "Nothing closes on its own; a lead or board member marks each plan completed."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isPending && (
              <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
            )}
            <Switch
              id="auto-complete-past"
              checked={settings.autoCompletePastEvents}
              disabled={isPending}
              onCheckedChange={(checked) =>
                save({ ...settings, autoCompletePastEvents: checked })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
