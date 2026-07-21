"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import { EventCatalogForm } from "@/components/onboarding/event-catalog-form";
import { EventContactsPanel } from "@/components/contacts/event-contacts-panel";
import type { EventCatalogEntry } from "@/types";
import {
  PTA_BOARD_POSITIONS,
  EVENT_CATEGORIES,
  monthLabel,
} from "@/lib/constants";

interface EventCatalogAdminProps {
  entries: EventCatalogEntry[];
  yearsByCatalogId: Record<string, number>;
  availableTags: { name: string; displayName: string }[];
  unlinkedPlans: { id: string; title: string; schoolYear: string }[];
}

export function EventCatalogAdmin({
  entries,
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

  const handleDelete = (entry: EventCatalogEntry) => {
    const years = yearsByCatalogId[entry.id] ?? 0;
    const warning =
      years > 0
        ? `"${entry.title}" has ${years} year${years === 1 ? "" : "s"} of event plans linked to it. Deleting unlinks that history. Retiring it instead keeps the history and hides it from the planning picker.\n\nDelete anyway?`
        : `Delete "${entry.title}"?`;
    if (!confirm(warning)) return;
    startTransition(async () => {
      await deleteCatalogEntry(entry.id);
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

      {/* Add / edit form */}
      {editingEntry ? (
        <EventCatalogForm
          editingEntry={editingEntry}
          availableTags={availableTags}
          onSuccess={() => setEditingEntry(null)}
          onCancel={() => setEditingEntry(null)}
          showToggleButton={false}
        />
      ) : (
        <EventCatalogForm availableTags={availableTags} showToggleButton />
      )}

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
                            {JSON.parse(entry.keyTasks).map(
                              (task: string, i: number) => (
                                <li key={i}>{task}</li>
                              )
                            )}
                          </ul>
                        </div>
                      )}

                      {entry.tips && (
                        <div className="mt-4">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            Tips
                          </p>
                          <p className="whitespace-pre-wrap text-sm">
                            {entry.tips}
                          </p>
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
                                  {PTA_BOARD_POSITIONS[
                                    pos as keyof typeof PTA_BOARD_POSITIONS
                                  ] ?? pos}
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
    </div>
  );
}
