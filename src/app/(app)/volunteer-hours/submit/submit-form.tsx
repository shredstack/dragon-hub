"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logVolunteerHours } from "@/actions/volunteer-hours";
import { VOLUNTEER_CATEGORIES } from "@/lib/constants";
import {
  DEFAULT_ACTIVITIES,
  OTHER_ACTIVITY_VALUE,
  isKnownVolunteerCategory,
  type VolunteerActivityOption,
  type VolunteerActivityOptions,
} from "@/lib/volunteer-activities-shared";
import { Button } from "@/components/ui/button";
import { CategorySelect } from "@/components/ui/category-select";

interface Props {
  /** What this person could be logging hours against. */
  options: VolunteerActivityOptions;
  /** Prefilled from `?committeeId=` on the workspace's "Log hours" link. */
  prefill: { activity: string; category: string } | null;
}

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function SubmitHoursForm({ options, prefill }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activity, setActivity] = useState(prefill?.activity ?? "");
  // Only read when `activity` is the "Other" sentinel — keeping it separate
  // means picking Other, typing, then changing your mind doesn't leave the
  // typed text lurking in the submitted value.
  const [otherName, setOtherName] = useState("");
  const [category, setCategory] = useState(prefill?.category ?? "");
  // Once someone sets the category themselves, changing the activity stops
  // overwriting it. The suggestion is a shortcut, not a correction.
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups: Array<{ label: string; items: VolunteerActivityOption[] }> = [
    { label: "PTA events", items: options.events },
    { label: "Your classrooms", items: options.classrooms },
    { label: "Your committees", items: options.committees },
    { label: "General", items: DEFAULT_ACTIVITIES },
  ].filter((g) => g.items.length > 0);

  function handleActivityChange(value: string) {
    setActivity(value);
    setError(null);
    if (categoryTouched || value === OTHER_ACTIVITY_VALUE) return;

    const suggested = [
      ...options.events,
      ...options.classrooms,
      ...options.committees,
      ...DEFAULT_ACTIVITIES,
    ].find((o) => o.value === value)?.suggestedCategory;

    if (suggested && isKnownVolunteerCategory(suggested)) setCategory(suggested);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const eventName =
      activity === OTHER_ACTIVITY_VALUE ? otherName.trim() : activity;
    if (!eventName) {
      setError("Tell us what these hours were for.");
      return;
    }

    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      await logVolunteerHours({
        eventName,
        hours: fd.get("hours") as string,
        date: fd.get("date") as string,
        category: fd.get("category") as string,
        notes: (fd.get("notes") as string) || undefined,
      });
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error ? err.message : "Could not log those hours."
      );
      return;
    }

    router.push("/volunteer-hours");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-6"
    >
      <div>
        <label className="mb-1 block text-sm font-medium">
          Event or Activity
        </label>
        <select
          required
          value={activity}
          onChange={(e) => handleActivityChange(e.target.value)}
          className={inputClass}
        >
          <option value="">Select an event or activity</option>
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={`${group.label}:${item.value}`} value={item.value}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
          {/* The escape hatch. A PTA's year always contains something nobody
              set up in advance, and hours for it should still be loggable. */}
          <option value={OTHER_ACTIVITY_VALUE}>Other (not listed)</option>
        </select>
      </div>

      {activity === OTHER_ACTIVITY_VALUE && (
        <div>
          <label className="mb-1 block text-sm font-medium">
            What was it?
          </label>
          <input
            value={otherName}
            onChange={(e) => {
              setOtherName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Playground mulch delivery"
            className={inputClass}
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">Hours</label>
        <input
          name="hours"
          type="number"
          step="0.25"
          min="0.25"
          required
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Date</label>
        <input name="date" type="date" required className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Category</label>
        {/* Kind of work, not which event — the event is the field above. This
            list used to also carry the caller's committees, back when the event
            name was free text and there was nowhere else to record one. */}
        <CategorySelect
          set={VOLUNTEER_CATEGORIES}
          name="category"
          required
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setCategoryTouched(true);
          }}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Notes (optional)</label>
        <textarea name="notes" rows={3} className={inputClass} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Submitting..." : "Submit Hours"}
      </Button>
    </form>
  );
}
