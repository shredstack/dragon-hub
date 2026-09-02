"use client";

import { useState, useTransition } from "react";
import { saveEventPlanWrapUp } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Loader2, NotebookPen, CheckCircle2, Lightbulb } from "lucide-react";

interface EventPlanWrapUpProps {
  eventPlanId: string;
  canEdit: boolean;
  /** False for one-off plans — there's no recurring event to feed. */
  hasCatalogEntry: boolean;
  catalogTitle?: string | null;
  /** Changes the copy only: before the event these are notes, after, a record. */
  isCompleted: boolean;
  initial: {
    whatWorked: string | null;
    whatToChange: string | null;
    /** One per line, ready for the textarea. */
    tips: string[];
    actualCost: string | null;
    actualVolunteers: string | null;
    appliedToCatalog: boolean;
  } | null;
}

/**
 * The notebook that keeps the recurring event honest.
 *
 * Open for the whole life of the plan, not just after it is marked complete:
 * the tip worth writing down ("book the bounce house by March — they were
 * nearly sold out") occurs to someone in March, and a form that only appears in
 * June collects nothing. What goes in here is merged into the recurring event,
 * so next year's lead starts from real numbers and real advice instead of a
 * guess someone typed years ago.
 */
export function EventPlanWrapUp({
  eventPlanId,
  canEdit,
  hasCatalogEntry,
  catalogTitle,
  isCompleted,
  initial,
}: EventPlanWrapUpProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(initial?.appliedToCatalog ?? false);

  const [form, setForm] = useState({
    whatWorked: initial?.whatWorked ?? "",
    whatToChange: initial?.whatToChange ?? "",
    tips: (initial?.tips ?? []).join("\n"),
    actualCost: initial?.actualCost ?? "",
    actualVolunteers: initial?.actualVolunteers ?? "",
    // Ticked by default, including on a plan that has already applied once:
    // re-applying replaces what this plan contributed rather than stacking a
    // second copy, so the safe default is "keep the recurring event current".
    applyToCatalog: hasCatalogEntry,
  });

  const eventName = catalogTitle ?? "the recurring event";

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await saveEventPlanWrapUp(eventPlanId, form);
        setSaved(true);
        if (result.appliedToCatalog) setApplied(true);
        // The plan's overview renders the catalog's tips read-through, so a
        // save that just changed them leaves a stale list behind it.
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not save these notes."
        );
      }
    });
  }

  if (!canEdit) {
    if (!initial) return null;
    const tips = initial.tips;
    const hasAnything =
      tips.length > 0 ||
      initial.whatWorked ||
      initial.whatToChange ||
      initial.actualCost ||
      initial.actualVolunteers;
    if (!hasAnything) return null;

    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-medium">
          <NotebookPen className="h-4 w-4" /> Notes from this year
        </h3>
        <dl className="space-y-3 text-sm">
          {tips.length > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">Tips</dt>
              <dd>
                <ul className="list-inside list-disc space-y-1">
                  {tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {initial.whatWorked && (
            <div>
              <dt className="text-xs text-muted-foreground">What worked</dt>
              <dd className="whitespace-pre-wrap">{initial.whatWorked}</dd>
            </div>
          )}
          {initial.whatToChange && (
            <div>
              <dt className="text-xs text-muted-foreground">
                What to change next time
              </dt>
              <dd className="whitespace-pre-wrap">{initial.whatToChange}</dd>
            </div>
          )}
          {initial.actualCost && (
            <div>
              <dt className="text-xs text-muted-foreground">Actual cost</dt>
              <dd>{initial.actualCost}</dd>
            </div>
          )}
          {initial.actualVolunteers && (
            <div>
              <dt className="text-xs text-muted-foreground">
                Volunteers it took
              </dt>
              <dd>{initial.actualVolunteers}</dd>
            </div>
          )}
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="flex items-center gap-2 font-medium">
        <NotebookPen className="h-4 w-4" />
        {isCompleted ? "Event Wrap-Up" : "Notes & Wrap-Up"}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {isCompleted
          ? "Write this while it's fresh. Whoever runs this next year sees it before they start."
          : "Write things down as you go — you don't have to wait until the event is over. Whoever runs this next year sees it before they start."}
      </p>

      <div className="mt-4 space-y-4">
        {/* First, because it is the one that carries forward as advice rather
            than as a paragraph of narrative — and the one people actually
            think of mid-year. */}
        <div>
          <label
            htmlFor="wrap-up-tips"
            className="mb-1 flex items-center gap-1.5 text-sm font-medium"
          >
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
            Tips for next year (one per line)
          </label>
          <textarea
            id="wrap-up-tips"
            rows={4}
            value={form.tips}
            onChange={(e) => setForm((p) => ({ ...p, tips: e.target.value }))}
            placeholder={
              "Book the bounce house by March — they were nearly sold out.\nAsk the office for the cafeteria key the week before.\nTwo people at check-in isn't enough after 5pm."
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Each line becomes its own tip on {eventName}, stamped with this
            school year.
          </p>
        </div>

        <div>
          <label htmlFor="wrap-up-worked" className="mb-1 block text-sm font-medium">
            What worked well?
          </label>
          <textarea
            id="wrap-up-worked"
            rows={3}
            value={form.whatWorked}
            onChange={(e) =>
              setForm((p) => ({ ...p, whatWorked: e.target.value }))
            }
            placeholder="e.g., Ordering cookies two weeks out got us the bulk rate. Setting up the night before saved the morning."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="wrap-up-change" className="mb-1 block text-sm font-medium">
            What should change next time?
          </label>
          <textarea
            id="wrap-up-change"
            rows={3}
            value={form.whatToChange}
            onChange={(e) =>
              setForm((p) => ({ ...p, whatToChange: e.target.value }))
            }
            placeholder="e.g., We needed two more volunteers at check-in. Book the bounce house by March — they were nearly sold out."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wrap-up-cost" className="mb-1 block text-sm font-medium">
              What it actually cost
            </label>
            <input
              id="wrap-up-cost"
              value={form.actualCost}
              onChange={(e) =>
                setForm((p) => ({ ...p, actualCost: e.target.value }))
              }
              placeholder="e.g., $640"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="wrap-up-volunteers"
              className="mb-1 block text-sm font-medium"
            >
              Volunteers it took
            </label>
            <input
              id="wrap-up-volunteers"
              value={form.actualVolunteers}
              onChange={(e) =>
                setForm((p) => ({ ...p, actualVolunteers: e.target.value }))
              }
              placeholder="e.g., 14 volunteers"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {hasCatalogEntry ? (
          <label className="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
            <input
              type="checkbox"
              checked={form.applyToCatalog}
              onChange={(e) =>
                setForm((p) => ({ ...p, applyToCatalog: e.target.checked }))
              }
              className="mt-1"
            />
            <span>
              Keep {eventName} up to date with these notes
              <span className="block text-xs text-muted-foreground">
                {applied
                  ? "Already added. Saving again replaces this year's tips there rather than adding a second copy, and refreshes the budget and volunteer estimates."
                  : "Adds each tip to its list and replaces the budget and volunteer estimates with what actually happened."}
              </span>
            </span>
          </label>
        ) : (
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            This plan isn&rsquo;t filed under a recurring event, so these notes
            stay here. Link it to one to carry them forward.
          </p>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Notes
          </Button>
          {saved && !isPending && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
