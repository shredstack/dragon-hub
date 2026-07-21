"use client";

import { useState, useTransition } from "react";
import { saveEventPlanWrapUp } from "@/actions/event-plans";
import { Button } from "@/components/ui/button";
import { Loader2, NotebookPen, CheckCircle2 } from "lucide-react";

interface EventPlanWrapUpProps {
  eventPlanId: string;
  canEdit: boolean;
  /** False for one-off plans — there's no recurring event to feed. */
  hasCatalogEntry: boolean;
  catalogTitle?: string | null;
  initial: {
    whatWorked: string | null;
    whatToChange: string | null;
    actualCost: string | null;
    actualVolunteers: string | null;
    appliedToCatalog: boolean;
  } | null;
}

/**
 * The retrospective that keeps the recurring event honest.
 *
 * Shown once a plan is completed: what worked, what to change, and what it
 * actually cost — then merged into the recurring event so next year's lead
 * starts from real numbers instead of a guess someone typed years ago.
 */
export function EventPlanWrapUp({
  eventPlanId,
  canEdit,
  hasCatalogEntry,
  catalogTitle,
  initial,
}: EventPlanWrapUpProps) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(initial?.appliedToCatalog ?? false);

  const [form, setForm] = useState({
    whatWorked: initial?.whatWorked ?? "",
    whatToChange: initial?.whatToChange ?? "",
    actualCost: initial?.actualCost ?? "",
    actualVolunteers: initial?.actualVolunteers ?? "",
    applyToCatalog: hasCatalogEntry && !initial?.appliedToCatalog,
  });

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await saveEventPlanWrapUp(eventPlanId, form);
        setSaved(true);
        if (result.appliedToCatalog) setApplied(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not save the wrap-up."
        );
      }
    });
  }

  if (!canEdit) {
    if (!initial) return null;
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-medium">
          <NotebookPen className="h-4 w-4" /> Event Wrap-Up
        </h3>
        <dl className="space-y-3 text-sm">
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
        <NotebookPen className="h-4 w-4" /> Event Wrap-Up
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Write this while it&rsquo;s fresh. Whoever runs this next year sees it
        before they start.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">
            What worked well?
          </label>
          <textarea
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
          <label className="mb-1 block text-sm font-medium">
            What should change next time?
          </label>
          <textarea
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
            <label className="mb-1 block text-sm font-medium">
              What it actually cost
            </label>
            <input
              value={form.actualCost}
              onChange={(e) =>
                setForm((p) => ({ ...p, actualCost: e.target.value }))
              }
              placeholder="e.g., $640"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Volunteers it took
            </label>
            <input
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
          applied ? (
            <p className="flex items-center gap-2 rounded-md bg-muted p-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              Already added to {catalogTitle ?? "the recurring event"}. Later
              edits stay on this plan only.
            </p>
          ) : (
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
                Add these notes to {catalogTitle ?? "the recurring event"}
                <span className="block text-xs text-muted-foreground">
                  Appends to its tips and replaces the budget and volunteer
                  estimates with what actually happened.
                </span>
              </span>
            </label>
          )
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
            Save Wrap-Up
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
