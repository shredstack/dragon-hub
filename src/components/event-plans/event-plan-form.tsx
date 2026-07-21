"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEventPlan, updateEventPlan } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";
import { EVENT_TYPES } from "@/lib/constants";

interface EventPlanFormProps {
  /** The school's active year — new plans are filed under this. */
  currentSchoolYear: string;
  mode: "create" | "edit";
  initialData?: {
    id: string;
    title: string;
    description: string | null;
    eventType: string | null;
    eventDate: string | null;
    location: string | null;
    budget: string | null;
    signupGeniusUrl: string | null;
    schoolYear: string;
  };
}

export function EventPlanForm({
  mode,
  initialData,
  currentSchoolYear,
}: EventPlanFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || undefined,
      eventType: (formData.get("eventType") as string) || undefined,
      eventDate: (formData.get("eventDate") as string) || undefined,
      location: (formData.get("location") as string) || undefined,
      budget: (formData.get("budget") as string) || undefined,
      // Always sent so clearing the field clears the stored link.
      signupGeniusUrl: (formData.get("signupGeniusUrl") as string) ?? "",
    };

    try {
      if (mode === "create") {
        const plan = await createEventPlan({
          ...data,
          schoolYear: currentSchoolYear,
        });
        router.push(`/events/${plan.id}`);
        return;
      } else if (initialData) {
        await updateEventPlan(initialData.id, data);
        router.push(`/events/${initialData.id}`);
        return;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save this event plan."
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div>
        <label className="mb-1 block text-sm font-medium">
          Event Title <span className="text-destructive">*</span>
        </label>
        <input
          name="title"
          required
          defaultValue={initialData?.title ?? ""}
          placeholder="e.g., Fall Festival, Spring Carnival"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Description</label>
        <textarea
          name="description"
          rows={4}
          defaultValue={initialData?.description ?? ""}
          placeholder="Describe the event, its goals, and what's involved..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Event Type</label>
          <select
            name="eventType"
            defaultValue={initialData?.eventType ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Select type...</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type} className="capitalize">
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Event Date</label>
          <input
            name="eventDate"
            type="date"
            defaultValue={
              initialData?.eventDate
                ? new Date(initialData.eventDate).toISOString().split("T")[0]
                : ""
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Location</label>
          <input
            name="location"
            defaultValue={initialData?.location ?? ""}
            placeholder="e.g., School Gymnasium"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Budget / Estimated Cost
          </label>
          <input
            name="budget"
            defaultValue={initialData?.budget ?? ""}
            placeholder="e.g., $500"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          SignUpGenius Link
        </label>
        <input
          name="signupGeniusUrl"
          type="url"
          defaultValue={initialData?.signupGeniusUrl ?? ""}
          placeholder="https://www.signupgenius.com/go/..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Add this once time slots are open. Volunteers who said they were
          interested in this event will see a link to claim a slot.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create Event Plan"
              : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
