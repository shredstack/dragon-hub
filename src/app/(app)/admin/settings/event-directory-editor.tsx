"use client";

import { useState, useTransition } from "react";
import { Eye, Loader2, PartyPopper, Smile } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { updateEventDirectorySettings } from "@/actions/school-membership";
import type { EventDirectorySettings } from "@/lib/event-directory-settings";

/**
 * The board's three switches for Our Events.
 *
 * Two rather than one for reactions, because "reactions at all" and "reactions
 * with names on them" are different appetites: a school can want the page to be
 * fun without wanting a leaderboard of who cares about what.
 *
 * Each switch carries one sentence of consequence, because the consequence is
 * the only part that isn't obvious from the label.
 */
const SWITCHES: {
  key: keyof EventDirectorySettings;
  label: string;
  icon: typeof PartyPopper;
  description: string;
  on: string;
  off: string;
}[] = [
  {
    key: "reactionsEnabled",
    label: "Reactions",
    icon: PartyPopper,
    description:
      "Let families tap ❤️ 🎉 🙌 on an event to say they love it.",
    on: "Families can react. Counts show on every event.",
    off: "Reactions are hidden — no hearts are deleted, and turning this back on brings them back.",
  },
  {
    key: "customEmojiEnabled",
    label: "Any emoji",
    icon: Smile,
    description: "The “+” that opens the full emoji picker.",
    on: "Families can react with any emoji they like.",
    off: "Only the short list of suggested reactions is offered.",
  },
  {
    key: "showReactorNames",
    label: "Show who reacted",
    icon: Eye,
    description: "Put names next to the reactions on an event's page.",
    on: "Everyone sees who reacted — “Amy, Sarah and 12 others love this”.",
    off: "Only counts are shown. Who raised a hand or asked to help is board-only either way.",
  },
];

export function EventDirectoryEditor({
  schoolId,
  initialSettings,
}: {
  schoolId: string;
  initialSettings: EventDirectorySettings;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: keyof EventDirectorySettings, value: boolean) => {
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setError(null);
    setPendingKey(key);

    startTransition(async () => {
      try {
        await updateEventDirectorySettings(schoolId, next);
      } catch (err) {
        setSettings(previous);
        setError(
          err instanceof Error ? err.message : "Couldn't save that setting."
        );
      } finally {
        setPendingKey(null);
      }
    });
  };

  return (
    <div className="border-border bg-card rounded-lg border p-6">
      <h2 className="text-lg font-semibold">Our Events</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        How your school&rsquo;s events page behaves for families. It always
        shows what each event is and lets people raise a hand; these decide how
        loud it gets.
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {SWITCHES.map((item) => {
          const on = settings[item.key];
          // "Any emoji" is meaningless with reactions off, so it says so rather
          // than sitting there looking live.
          const disabled =
            isPending ||
            (item.key !== "reactionsEnabled" && !settings.reactionsEnabled);

          return (
            <div
              key={item.key}
              className="border-border flex items-start justify-between gap-4 rounded-lg border p-4"
            >
              <div className="flex items-start gap-3">
                <div className="bg-dragon-blue-500/10 text-dragon-blue-500 rounded-lg p-2">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <label
                    htmlFor={`event-directory-${item.key}`}
                    className="font-medium"
                  >
                    {item.label}
                  </label>
                  <p className="text-muted-foreground text-sm">
                    {item.description}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {disabled && item.key !== "reactionsEnabled"
                      ? "Reactions are off, so this has no effect."
                      : on
                        ? item.on
                        : item.off}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isPending && pendingKey === item.key && (
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                )}
                <Switch
                  id={`event-directory-${item.key}`}
                  checked={on}
                  disabled={disabled}
                  onCheckedChange={(checked) => toggle(item.key, checked)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
