"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logVolunteerHours } from "@/actions/volunteer-hours";
import { VOLUNTEER_CATEGORIES } from "@/lib/constants";
import { Button } from "@/components/ui/button";

export default function SubmitVolunteerHoursPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Log Volunteer Hours</h1>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Event Name</label>
          <input name="eventName" required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Hours</label>
          <input name="hours" type="number" step="0.25" min="0.25" required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Date</label>
          <input name="date" type="date" required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Category</label>
          <select name="category" required className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">Select category</option>
            {VOLUNTEER_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Notes (optional)</label>
          <textarea name="notes" rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Submitting..." : "Submit Hours"}
        </Button>
      </form>
    </div>
  );
}
