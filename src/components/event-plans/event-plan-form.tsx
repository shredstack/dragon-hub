"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEventPlan, updateEventPlan } from "@/actions/event-plans";
import { createCatalogEntry } from "@/actions/event-catalog";
import { Button } from "@/components/ui/button";
import { TagPicker } from "@/components/ui/tag-picker";
import { EVENT_TYPES, monthLabel } from "@/lib/constants";
import { Repeat, Loader2 } from "lucide-react";

interface CatalogOption {
  id: string;
  title: string;
  category: string | null;
  typicalMonth: number | null;
  description: string | null;
}

interface EventPlanFormProps {
  /** The school's active year — new plans are filed under this. */
  currentSchoolYear: string;
  mode: "create" | "edit";
  /** Recurring events this plan can be filed under. */
  catalogOptions: CatalogOption[];
  availableTags?: { name: string; displayName: string }[];
  initialData?: {
    id: string;
    title: string;
    description: string | null;
    eventType: string | null;
    eventCatalogId: string | null;
    isOneOff: boolean;
    eventDate: string | null;
    location: string | null;
    budget: string | null;
    signupGeniusUrl: string | null;
    tags: string[] | null;
    schoolYear: string;
  };
}

/** Sentinel for "this event doesn't repeat" in the recurring-event dropdown. */
const ONE_OFF = "__one_off__";
/** Sentinel for "create a new recurring event from this title". */
const NEW_RECURRING = "__new__";

export function EventPlanForm({
  mode,
  initialData,
  currentSchoolYear,
  catalogOptions,
  availableTags = [],
}: EventPlanFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);

  const [catalogChoice, setCatalogChoice] = useState(
    initialData?.eventCatalogId ??
      (initialData?.isOneOff ? ONE_OFF : "")
  );

  const selected = catalogOptions.find((o) => o.id === catalogChoice);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const title = formData.get("title") as string;
    const data = {
      title,
      description: (formData.get("description") as string) || undefined,
      eventType: (formData.get("eventType") as string) || undefined,
      eventDate: (formData.get("eventDate") as string) || undefined,
      location: (formData.get("location") as string) || undefined,
      budget: (formData.get("budget") as string) || undefined,
      tags,
      // Always sent so clearing the field clears the stored link.
      signupGeniusUrl: (formData.get("signupGeniusUrl") as string) ?? "",
    };

    try {
      if (!catalogChoice) {
        setError(
          "Pick which recurring event this is, or mark it as a one-off event."
        );
        setLoading(false);
        return;
      }

      // "New recurring event" creates the catalog entry first, so the plan has
      // something to hang its future years from.
      let eventCatalogId: string | undefined;
      if (catalogChoice === NEW_RECURRING) {
        const entry = await createCatalogEntry({
          title,
          category: (formData.get("eventCategory") as string) || undefined,
          typicalMonth: data.eventDate
            ? new Date(data.eventDate).getMonth() + 1
            : null,
        });
        eventCatalogId = entry.id;
      } else if (catalogChoice !== ONE_OFF) {
        eventCatalogId = catalogChoice;
      }

      if (mode === "create") {
        const plan = await createEventPlan({
          ...data,
          eventCatalogId,
          isOneOff: catalogChoice === ONE_OFF,
          schoolYear: currentSchoolYear,
        });
        router.push(`/events/${plan.id}`);
        return;
      } else if (initialData) {
        await updateEventPlan(initialData.id, {
          ...data,
          eventCatalogId: eventCatalogId ?? null,
          isOneOff: catalogChoice === ONE_OFF,
        });
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

      <div className="rounded-lg border border-border bg-card p-4">
        <label className="mb-1 flex items-center gap-2 text-sm font-medium">
          <Repeat className="h-4 w-4" />
          Is this a recurring event?{" "}
          <span className="text-destructive">*</span>
        </label>
        <p className="mb-2 text-xs text-muted-foreground">
          Filing this under a recurring event is what lets next year&rsquo;s
          planner inherit your contacts, tasks, and notes.
        </p>
        <select
          value={catalogChoice}
          onChange={(e) => setCatalogChoice(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select...</option>
          {catalogOptions.length > 0 && (
            <optgroup label="Recurring events">
              {catalogOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                  {option.typicalMonth
                    ? ` — usually ${monthLabel(option.typicalMonth)}`
                    : ""}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Something else">
            <option value={NEW_RECURRING}>
              + New recurring event (use this title)
            </option>
            <option value={ONE_OFF}>
              One-off event — this won&rsquo;t happen again
            </option>
          </optgroup>
        </select>

        {selected?.description && (
          <p className="mt-2 text-xs text-muted-foreground">
            {selected.description}
          </p>
        )}
        {catalogChoice === NEW_RECURRING && (
          <p className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">
            A new recurring event will be created from this title. Add its
            contacts and tips later under Recurring Events in the PTA Board Hub.
          </p>
        )}
        {catalogChoice === ONE_OFF && (
          <p className="mt-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">
            One-off events don&rsquo;t carry anything forward. If this turns out
            to repeat, you can file it under a recurring event later.
          </p>
        )}
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

      <TagPicker
        value={tags}
        onChange={setTags}
        available={availableTags}
        helpText="Tags are shared across DragonHub and configured in the PTA Board Hub."
      />

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
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading
            ? mode === "create"
              ? "Creating..."
              : "Saving..."
            : mode === "create"
              ? "Create Event Plan"
              : "Save Changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
