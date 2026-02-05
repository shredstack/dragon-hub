"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEventPlan, updateEventPlan } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";
import { CURRENT_SCHOOL_YEAR, EVENT_TYPES } from "@/lib/constants";

interface EventPlanFormProps {
  mode: "create" | "edit";
  initialData?: {
    id: string;
    title: string;
    description: string | null;
    eventType: string | null;
    eventDate: string | null;
    location: string | null;
    budget: string | null;
    schoolYear: string;
  };
}

export function EventPlanForm({ mode, initialData }: EventPlanFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || undefined,
      eventType: (formData.get("eventType") as string) || undefined,
      eventDate: (formData.get("eventDate") as string) || undefined,
      location: (formData.get("location") as string) || undefined,
      budget: (formData.get("budget") as string) || undefined,
    };

    try {
      if (mode === "create") {
        const plan = await createEventPlan({
          ...data,
          schoolYear: CURRENT_SCHOOL_YEAR,
        });
        router.push(`/events/${plan.id}`);
        return;
      } else if (initialData) {
        await updateEventPlan(initialData.id, data);
        router.push(`/events/${initialData.id}`);
        return;
      }
    } catch {
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
