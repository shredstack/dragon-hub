"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logVolunteerHours } from "@/actions/volunteer-hours";
import { VOLUNTEER_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";

interface Props {
  /** The caller's active committees, for the category picker. */
  committees: Array<{ id: string; name: string }>;
  /** Prefilled from `?committeeId=` on the workspace's "Log hours" link. */
  prefill: { eventName: string; category: string } | null;
}

export function SubmitHoursForm({ committees, prefill }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // Controlled only so the prefill survives a re-render; the user can still
  // change either field, since a committee name is rarely the event name.
  const [eventName, setEventName] = useState(prefill?.eventName ?? "");
  const [category, setCategory] = useState(prefill?.category ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    await logVolunteerHours({
      eventName: fd.get("eventName") as string,
      hours: fd.get("hours") as string,
      date: fd.get("date") as string,
      category: fd.get("category") as string,
      notes: (fd.get("notes") as string) || undefined,
    });

    router.push("/volunteer-hours");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border bg-card p-6"
    >
      <div>
        <label className="mb-1 block text-sm font-medium">Event Name</label>
        <input
          name="eventName"
          required
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Hours</label>
        <input
          name="hours"
          type="number"
          step="0.25"
          min="0.25"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Date</label>
        <input
          name="date"
          type="date"
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Category</label>
        <select
          name="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select category</option>
          {/* Committees lead: someone logging hours from a committee workspace
              is almost always logging them for that committee. `category` stays
              free text, so existing reports and exports keep working. */}
          {committees.length > 0 && (
            <optgroup label="Your committees">
              {committees.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="General">
            {VOLUNTEER_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Notes (optional)</label>
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Submitting..." : "Submit Hours"}
      </Button>
    </form>
  );
}
