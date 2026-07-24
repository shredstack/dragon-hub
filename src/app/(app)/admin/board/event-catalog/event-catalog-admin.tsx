"use client";

import {
  positionLabel,
  type BoardPosition,
  type BoardPositionLabels,
} from "@/lib/board-positions-shared";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Wand2,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Users,
  Calendar,
  DollarSign,
  Loader2,
  History,
  Archive,
  ArchiveRestore,
  Link2Off,
} from "lucide-react";
import {
  deleteCatalogEntry,
  generateCatalogFromEventPlans,
  setCatalogEntryActive,
} from "@/actions/event-catalog";
import { parseStoredList } from "@/lib/utils";
import { EventCatalogForm } from "@/components/onboarding/event-catalog-form";
import { EventContactsPanel } from "@/components/contacts/event-contacts-panel";
import type { EventCatalogEntry } from "@/types";
import {
  EVENT_CATEGORIES,
  monthLabel,
} from "@/lib/constants";

interface EventCatalogAdminProps {
  entries: EventCatalogEntry[];
  /** Active positions for the form picker. */
  positions: BoardPosition[];
  /** slug -> label including retired ones, so old entries still render. */
  positionLabels: BoardPositionLabels;
  yearsByCatalogId: Record<string, number>;
  availableTags: { name: string; displayName: string }[];
  unlinkedPlans: { id: string; title: string; schoolYear: string }[];
}

export function EventCatalogAdmin({
  entries,
  positions,
  positionLabels,
  yearsByCatalogId,
  availableTags,
  unlinkedPlans,
}: EventCatalogAdminProps) {
  const [isPending, startTransition] = useTransition();
  const [editingEntry, setEditingEntry] = useState<EventCatalogEntry | null>(
    null
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<{
    created: number;
    linked: number;
  } | null>(null);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  /**
   * A recurring event that has been run is the thread tying each year's plan to
   * the next, so once anything is linked the server refuses the delete outright
   * and retiring is the only way out. Offer that directly rather than letting
   * someone confirm a delete that is going to fail.
   */
  const handleDelete = async (entry: EventCatalogEntry) => {
    const years = yearsByCatalogId[entry.id] ?? 0;

    if (years > 0) {
      const retire = await confirm({
        title: `"${entry.title}" can't be deleted`,
        description: `It has ${years} year${years === 1 ? "" : "s"} of event plans linked to it.`,
        alternative:
          "Retire it instead — it disappears from the planning picker but every year stays linked, so it can be brought back if the event returns.",
        confirmLabel: "Retire event",
        cancelLabel: "Keep as is",
        tone: "default",
      });
      closeConfirm();
      if (retire && entry.isActive) {
        startTransition(async () => {
          await setCatalogEntryActive(entry.id, false);
        });
      }
      return;
    }

    const ok = await confirm({
      title: `Delete "${entry.title}"?`,
      description:
        "No event plans are linked to it yet, so nothing is lost. This removes the recurring event for good.",
      confirmLabel: "Delete event",
    });
    if (!ok) return;

    startTransition(async () => {
      try {
        await deleteCatalogEntry(entry.id);
      } finally {
        closeConfirm();
      }
    });
  };

  const handleToggleActive = (entry: EventCatalogEntry) => {
    startTransition(async () => {
      await setCatalogEntryActive(entry.id, !entry.isActive);
    });
  };

  const handleGenerate = () => {
    startTransition(async () => {
      const result = await generateCatalogFromEventPlans();
      setGenerateResult({ created: result.created, linked: result.linked });
      setTimeout(() => setGenerateResult(null), 6000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Plans with no recurring event — the year-over-year gaps */}
      {unlinkedPlans.length > 0 && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 font-medium text-purple-800 dark:text-purple-200">
                <Link2Off className="h-4 w-4" />
                {unlinkedPlans.length} event plan
                {unlinkedPlans.length === 1 ? "" : "s"} not linked to a recurring
                event
              </h3>
              <p className="mt-1 text-sm text-purple-700 dark:text-purple-300">
                Their history won&rsquo;t carry to next year until they&rsquo;re
                filed under a recurring event. This matches plans to existing
                entries by name and creates entries for the rest.
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-purple-700 dark:text-purple-300">
                {unlinkedPlans.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <Link href={`/events/${p.id}`} className="hover:underline">
                      {p.title} ({p.schoolYear})
                    </Link>
                  </li>
                ))}
                {unlinkedPlans.length > 5 && (
                  <li>and {unlinkedPlans.length - 5} more…</li>
                )}
              </ul>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isPending}
              variant="outline"
              className="shrink-0 border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Match &amp; Generate
            </Button>
          </div>
          {generateResult && (
            <div className="mt-3 rounded bg-purple-100 p-2 text-sm text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              {generateResult.created === 0 && generateResult.linked === 0
                ? "Nothing to do — every completed plan is already filed."
                : `Created ${generateResult.created} new entr${generateResult.created === 1 ? "y" : "ies"}, linked ${generateResult.linked} existing plan${generateResult.linked === 1 ? "" : "s"}.`}
            </div>
          )}
        </div>
      )}

      {/* Add form only. Editing happens inline on the row itself — an edit form
          up here is off-screen for any entry below the fold, so the pencil
          looked like it did nothing. */}
      <EventCatalogForm
        key="new"
        availableTags={availableTags}
        positions={positions}
        showToggleButton
      />

      {/* Entries list */}
      <div className="space-y-4">
        <h3 className="font-semibold">Recurring Events ({entries.length})</h3>

        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              No recurring events yet. Add the ones your PTA runs every year, or
              generate them from completed event plans.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const years = yearsByCatalogId[entry.id] ?? 0;

              // The key remounts the form when the target changes — its fields
              // are seeded from editingEntry via useState, which only runs on
              // mount, so without it an edit would open holding the previous
              // entry's values.
              if (editingEntry?.id === entry.id) {
                return (
                  <EventCatalogForm
                    key={entry.id}
                    editingEntry={editingEntry}
                    availableTags={availableTags}
                    positions={positions}
                    onSuccess={() => setEditingEntry(null)}
                    onCancel={() => setEditingEntry(null)}
                    showToggleButton={false}
                  />
                );
              }

              return (
                <div
                  key={entry.id}
                  className={`overflow-hidden rounded-lg border bg-card ${
                    entry.isActive ? "" : "opacity-60"
                  }`}
                >
                  <div
                    className="flex cursor-pointer items-start justify-between gap-3 p-4"
                    onClick={() =>
                      setExpandedId(expandedId === entry.id ? null : entry.id)
                    }
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{entry.title}</span>
                        {entry.category && (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {EVENT_CATEGORIES[
                              entry.category as keyof typeof EVENT_CATEGORIES
                            ] ?? entry.category}
                          </span>
                        )}
                        {entry.typicalMonth && (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {monthLabel(entry.typicalMonth)}
                          </span>
                        )}
                        {years > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-dragon-blue-100 px-2 py-0.5 text-xs text-dragon-blue-700 dark:bg-dragon-blue-900 dark:text-dragon-blue-300">
                            <History className="h-3 w-3" />
                            {years} year{years === 1 ? "" : "s"}
                          </span>
                        )}
                        {!entry.isActive && (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Retired
                          </span>
                        )}
                        {entry.aiGenerated && (
                          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                            AI Generated
                          </span>
                        )}
                      </div>
                      {entry.description && (
                        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                          {entry.description}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        title={entry.isActive ? "Retire" : "Restore"}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(entry);
                        }}
                      >
                        {entry.isActive ? (
                          <Archive className="h-4 w-4" />
                        ) : (
                          <ArchiveRestore className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEntry(entry);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(entry);
                        }}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {expandedId === entry.id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {expandedId === entry.id && (
                    <div className="border-t bg-muted/30 p-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        {(entry.typicalMonth || entry.timingNote) && (
                          <div className="flex items-start gap-2">
                            <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Timing
                              </p>
                              <p className="text-sm">
                                {[monthLabel(entry.typicalMonth), entry.timingNote]
                                  .filter(Boolean)
                                  .join(" — ")}
                              </p>
                            </div>
                          </div>
                        )}
                        {entry.estimatedVolunteers && (
                          <div className="flex items-start gap-2">
                            <Users className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Volunteers
                              </p>
                              <p className="text-sm">
                                {entry.estimatedVolunteers}
                              </p>
                            </div>
                          </div>
                        )}
                        {entry.estimatedBudget && (
                          <div className="flex items-start gap-2">
                            <DollarSign className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">
                                Budget
                              </p>
                              <p className="text-sm">{entry.estimatedBudget}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {entry.keyTasks && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Key Tasks
                          </p>
                          <ul className="list-inside list-disc space-y-1 text-sm">
                            {parseStoredList(entry.keyTasks).map((task, i) => (
                              <li key={i}>{task}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {entry.tips && (
                        <div className="mt-4">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            Tips
                          </p>
                          <ul className="list-inside list-disc space-y-1 text-sm">
                            {parseStoredList(entry.tips).map((tip, i) => (
                              <li key={i}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {entry.tags && entry.tags.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Tags
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {entry.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                              >
                                {availableTags.find((t) => t.name === tag)
                                  ?.displayName ?? tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {entry.relatedPositions &&
                        entry.relatedPositions.length > 0 && (
                          <div className="mt-4">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Related Positions
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {entry.relatedPositions.map((pos) => (
                                <span
                                  key={pos}
                                  className="rounded bg-dragon-blue-100 px-2 py-0.5 text-xs text-dragon-blue-700 dark:bg-dragon-blue-900 dark:text-dragon-blue-300"
                                >
                                  {positionLabel(positionLabels, pos)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Evergreen contacts — inherited by every year's plan */}
                      <div className="mt-6 border-t pt-4">
                        <EventContactsPanel
                          target={{ type: "catalog", id: entry.id }}
                          canEdit
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmDialog}
    </div>
  );
}
