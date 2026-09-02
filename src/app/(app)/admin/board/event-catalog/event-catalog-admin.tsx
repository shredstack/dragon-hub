"use client";

import {
  positionLabel,
  type BoardPosition,
  type BoardPositionLabels,
} from "@/lib/board-positions-shared";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  CalendarPlus,
  DollarSign,
  Loader2,
  History,
  Archive,
  ArchiveRestore,
  Link2Off,
  Search,
  ArrowRight,
  Contact as ContactIcon,
  CheckCircle2,
} from "lucide-react";
import {
  deleteCatalogEntry,
  generateCatalogFromEventPlans,
  setCatalogEntryActive,
} from "@/actions/event-catalog";
import { openPlanForCatalogEntry } from "@/actions/year-planning";
import { useToast } from "@/components/ui/toast";
import { parseStoredList } from "@/lib/utils";
import { EventCatalogForm } from "@/components/onboarding/event-catalog-form";
import { EventContactsPanel } from "@/components/contacts/event-contacts-panel";
import { EventIcon } from "@/components/events/event-icon";
import { EventInterestPanel } from "@/components/onboarding/event-interest-panel";
import type { EventCatalogEntry } from "@/types";
import { CategoryBadge } from "@/components/ui/category-badge";
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
  /** Scavenger hunts filed under each entry, newest school year first. */
  huntsByCatalogId: Record<string, CatalogHunt[]>;
  /** The school's active year, so this page can talk about "this year". */
  currentSchoolYear: string;
  /**
   * Which entries already have a plan for that year. Held here rather than
   * fetched per row so the list can say "planned" without twenty round trips —
   * and so the board never has to go to a second screen to find out.
   */
  plannedByCatalogId: Record<string, { planId: string; title: string }>;
  /** How many evergreen contacts each entry carries, for the row summary. */
  contactCountByCatalogId: Record<string, number>;
}

interface CatalogHunt {
  id: string;
  title: string;
  schoolYear: string;
  status: string;
  archivedAt: Date | null;
}

export function EventCatalogAdmin({
  entries,
  positions,
  positionLabels,
  yearsByCatalogId,
  availableTags,
  unlinkedPlans,
  huntsByCatalogId,
  currentSchoolYear,
  plannedByCatalogId,
  contactCountByCatalogId,
}: EventCatalogAdminProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editingEntry, setEditingEntry] = useState<EventCatalogEntry | null>(
    null
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<{
    created: number;
    linked: number;
  } | null>(null);
  // The event just added, if any. Adding a recurring event is the start of a
  // job, not the end of one — "and plan it this year", "and add the vendor you
  // called" — and neither of those is anywhere near this form. So the answer
  // stays on screen until it's taken or dismissed.
  const [justAdded, setJustAdded] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [openingPlanFor, setOpeningPlanFor] = useState<string | null>(null);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  /**
   * Open this year's plan for one recurring event, right here.
   *
   * Same generator Plan the Year runs — same prefill, same seeded key tasks —
   * narrowed to one entry, because an event added in February is added one at a
   * time and being sent to a different tool to finish the thought is exactly the
   * seam this removes.
   */
  const handleOpenPlan = (entry: { id: string; title: string }) => {
    setOpeningPlanFor(entry.id);
    startTransition(async () => {
      try {
        const result = await openPlanForCatalogEntry(entry.id);
        addToast(
          result.created
            ? `${entry.title} now has a ${result.schoolYear} plan, prefilled from this entry.`
            : `${entry.title} already had a ${result.schoolYear} plan.`,
          "success"
        );
        router.push(`/events/plans/${result.planId}`);
      } catch (error) {
        addToast(
          error instanceof Error
            ? error.message
            : "Couldn't open a plan for that event.",
          "destructive"
        );
      } finally {
        setOpeningPlanFor(null);
      }
    });
  };

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
                    <Link href={`/events/plans/${p.id}`} className="hover:underline">
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
        key={justAdded?.id ?? "new"}
        availableTags={availableTags}
        positions={positions}
        showToggleButton
        onSuccess={(created) => {
          if (!created) return;
          setJustAdded(created);
          // The two things that come next both live on the entry's own row, so
          // open it rather than describing where to click.
          setExpandedId(created.id);
        }}
      />

      {/* What a recurring event is *for*. Adding one is step one of three, and
          the other two used to be a different screen and a collapsed panel. */}
      {justAdded && (
        <div className="rounded-lg border border-dragon-blue-200 bg-dragon-blue-50 p-4 dark:border-dragon-blue-800 dark:bg-dragon-blue-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium text-dragon-blue-900 dark:text-dragon-blue-100">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {justAdded.title} is in the catalog
              </p>
              <p className="mt-1 text-sm text-dragon-blue-800 dark:text-dragon-blue-200">
                {plannedByCatalogId[justAdded.id]
                  ? `It already has a ${currentSchoolYear} plan.`
                  : `Nothing is scheduled yet — open its ${currentSchoolYear} plan to start assigning work. Its key tasks come along.`}{" "}
                Its contacts and tips are on the entry below, and every future
                year inherits them.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {!plannedByCatalogId[justAdded.id] && (
                <Button
                  onClick={() => handleOpenPlan(justAdded)}
                  disabled={isPending}
                >
                  {openingPlanFor === justAdded.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CalendarPlus className="h-4 w-4" />
                  )}
                  Plan it for {currentSchoolYear}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setJustAdded(null)}>
                Not now
              </Button>
            </div>
          </div>
        </div>
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
              const hunts = huntsByCatalogId[entry.id] ?? [];
              const thisYear = plannedByCatalogId[entry.id];
              const contactCount = contactCountByCatalogId[entry.id] ?? 0;

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
                    <div className="flex min-w-0 items-start gap-3">
                      <EventIcon
                        iconEmoji={entry.iconEmoji}
                        imageUrl={entry.imageUrl}
                        className="h-9 w-9 text-lg"
                      />
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{entry.title}</span>
                        <CategoryBadge
                          set={EVENT_CATEGORIES}
                          value={entry.category}
                        />
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
                        {hunts.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                            <Search className="h-3 w-3" />
                            {hunts.length} hunt{hunts.length === 1 ? "" : "s"}
                          </span>
                        )}
                        {!entry.isActive && (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Retired
                          </span>
                        )}
                        {/* Only worth saying when it isn't the default. An
                            entry families can't see is the exception, and the
                            board should be able to spot it at a glance. */}
                        {entry.isActive && !entry.showInDirectory && (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Hidden from families
                          </span>
                        )}
                        {entry.helpCap !== null && (
                          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Team of {entry.helpCap}
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

                      {/* Whether this year is under way, on the row itself.
                          "Which of these still needs a plan?" was a question
                          this page couldn't answer, which is what sent people
                          to Plan the Year to find out. */}
                      {entry.isActive && (
                        <div
                          className="mt-2 flex flex-wrap items-center gap-3 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {thisYear ? (
                            <Link
                              href={`/events/plans/${thisYear.planId}`}
                              className="inline-flex items-center gap-1 font-medium text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                              {currentSchoolYear} plan
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenPlan(entry)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1 font-medium text-dragon-blue-600 hover:underline disabled:opacity-60 dark:text-dragon-blue-400"
                            >
                              {openingPlanFor === entry.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CalendarPlus className="h-3.5 w-3.5" />
                              )}
                              Plan it for {currentSchoolYear}
                            </button>
                          )}
                          {contactCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <ContactIcon className="h-3.5 w-3.5" />
                              {contactCount} contact
                              {contactCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      )}
                      </div>
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

                      {/* Which hunts were run at this event, year by year. A
                          hunt belongs to one school year, so this is the list
                          the board copies forward from rather than a setting. */}
                      {hunts.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Scavenger Hunts
                          </p>
                          <ul className="space-y-1 text-sm">
                            {hunts.map((hunt) => (
                              <li key={hunt.id}>
                                <Link
                                  href={`/admin/scavenger-hunts/${hunt.id}`}
                                  className="hover:underline"
                                >
                                  {hunt.title}
                                </Link>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {hunt.schoolYear} ·{" "}
                                  {hunt.archivedAt ? "archived" : hunt.status}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Evergreen contacts — inherited by every year's plan.
                          Above the interest panel deliberately: this is the
                          half of the entry the board *maintains*, and it was
                          being missed underneath a roster that grows all year. */}
                      <div className="mt-6 border-t pt-4">
                        <EventContactsPanel
                          target={{ type: "catalog", id: entry.id }}
                          canEdit
                        />
                      </div>

                      {/* Who has cheered, raised a hand, or asked to help —
                          the board's side of Our Events. */}
                      <div className="mt-6 border-t pt-4">
                        <EventInterestPanel
                          eventCatalogId={entry.id}
                          slug={entry.slug}
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
