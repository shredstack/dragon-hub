"use client";

import { useState } from "react";
import {
  submitForApproval,
  completeEventPlan,
  deleteEventPlan,
  reopenEventPlan,
} from "@/actions/event-plans";
import { useRouter } from "next/navigation";
import { EventPlanStatusBadge } from "./event-plan-status-badge";
import { EventPlanApprovalPanel } from "./event-plan-approval-panel";
import { AIRecommendations } from "./ai-recommendations";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, CalendarDays, Clock, MapPin, DollarSign, Pencil, Send, CheckCircle2, Trash2, ClipboardList, ExternalLink, Repeat, Tag, Lock, RotateCcw, Lightbulb } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { formatTimeOfDayRange } from "@/lib/time-of-day";
import { canDeleteEventPlanStatus } from "@/lib/constants";
import Link from "next/link";
import type { EventPlanStatus } from "@/types";

interface EventPlanOverviewProps {
  eventPlan: {
    id: string;
    title: string;
    description: string | null;
    eventType: string | null;
    eventDate: string | null;
    /** Wall-clock times at the school, "HH:MM". See src/lib/time-of-day.ts. */
    startTime: string | null;
    endTime: string | null;
    location: string | null;
    budget: string | null;
    signupGeniusUrl: string | null;
    tags: string[] | null;
    /** The recurring event this plan is filed under, if any. */
    catalogEntry: {
      id: string;
      title: string;
      /** The recurring event's icon, which this plan wears throughout. */
      iconEmoji?: string | null;
      /**
       * Tips written on the recurring event, read through rather than copied —
       * a correction made once should reach every year. See
       * src/lib/event-plan-seed.ts for why key tasks are the exception.
       */
      tips?: string[];
    } | null;
    isOneOff: boolean;
    status: EventPlanStatus;
    schoolYear: string;
    creatorName: string | null;
  };
  /** Display names for tags, so the card shows "Fall Festival" not "fall-festival". */
  tagLabels?: Record<string, string>;
  leads: string[];
  votes: {
    userId: string;
    userName: string | null;
    vote: "approve" | "reject";
    comment: string | null;
    createdAt: string;
  }[];
  currentUserId: string;
  isBoardMember: boolean;
  isLead: boolean;
  canEdit: boolean;
  canInteract: boolean;
  /** Board members only, and only on a completed plan. */
  canReopen?: boolean;
  /** The school's own rule — see src/lib/event-plan-settings.ts. */
  approvalThreshold: number;
  /**
   * The event date is behind us, worked out on the server against the school's
   * time zone. A plan the auto-sweep won't touch (a draft, or a school that
   * turned the sweep off) says so and offers the one click that closes it.
   */
  isPastDue?: boolean;
}

export function EventPlanOverview({
  eventPlan,
  tagLabels = {},
  leads,
  votes,
  currentUserId,
  isBoardMember,
  isLead,
  canEdit,
  canInteract,
  canReopen = false,
  approvalThreshold,
  isPastDue = false,
}: EventPlanOverviewProps) {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [reopening, setReopening] = useState(false);

  const isCompleted = eventPlan.status === "completed";
  // Closing out is a record of what happened, not an approval, so anyone who
  // can write to the plan may do it from any open status. Requiring `approved`
  // first is how a plan nobody submitted sat in Draft describing a party that
  // ran in October.
  const canComplete = (isLead || isBoardMember) && !isCompleted;
  const timeRange = formatTimeOfDayRange(
    eventPlan.startTime,
    eventPlan.endTime
  );
  // Only offered to someone who could actually act on it — an empty field with
  // a link that 403s is worse than an empty field.
  const editHref = canEdit ? `/events/plans/${eventPlan.id}/edit` : null;
  const catalogTips = eventPlan.catalogEntry?.tips ?? [];

  // Mirrors the server rule in deleteEventPlan: board/admin only, and never
  // once the board has approved the plan or it has been completed. The status
  // half comes from the same list the server enforces.
  const canDelete = isBoardMember && canDeleteEventPlanStatus(eventPlan.status);

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete "${eventPlan.title}"?`,
      description: "Everything attached to this plan goes with it, permanently:",
      consequences: [
        "Tasks and who they were assigned to",
        "Meetings, their notes and participants",
        "Message board history, including AI answers",
        "Attached resources and the wrap-up notes",
      ],
      alternative:
        "Only unapproved plans can be deleted. If this event actually ran, mark it complete instead so next year's board can read what happened.",
      confirmLabel: "Delete plan",
      confirmPhrase: eventPlan.title,
    });
    if (!ok) return;

    setDeleteError(null);
    try {
      await deleteEventPlan(eventPlan.id);
      router.push("/events/plans");
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete this event plan."
      );
    } finally {
      closeConfirm();
    }
  }

  async function handleReopen() {
    const ok = await confirm({
      title: "Reopen this event plan?",
      description:
        "It goes back to Approved, so its members can edit and add to it again. Mark it complete once they're done.",
      alternative:
        "If you only need one change made, asking a lead to make it leaves the record closed.",
      confirmLabel: "Reopen plan",
      tone: "default",
    });
    if (!ok) return;

    setDeleteError(null);
    setReopening(true);
    try {
      await reopenEventPlan(eventPlan.id);
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not reopen this event plan."
      );
    } finally {
      setReopening(false);
      closeConfirm();
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <EventPlanStatusBadge status={eventPlan.status} />
              {eventPlan.eventType && (
                <Badge variant="secondary" className="capitalize">
                  {eventPlan.eventType}
                </Badge>
              )}
            </div>
            {eventPlan.description && (
              <p className="text-sm text-muted-foreground">
                {eventPlan.description}
              </p>
            )}
          </div>
          {canEdit && (
            <Link href={`/events/plans/${eventPlan.id}/edit`}>
              <Button size="sm" variant="outline">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </Link>
          )}
        </div>

        {/* Every field, every time. These used to render only once they had a
            value, so a plan with no date looked like a plan with no date
            *field* — there was nothing on the page to tell you the answer was
            missing, or that the way to give it was Edit. An empty row that says
            so is the whole point. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Fact
            icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
            label="Date"
            value={
              eventPlan.eventDate ? formatDate(eventPlan.eventDate) : null
            }
            empty="No date set yet"
            editHref={editHref}
          />
          <Fact
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            label="Time"
            value={timeRange}
            empty="No time set yet"
            editHref={editHref}
          />
          <Fact
            icon={<MapPin className="h-4 w-4 text-muted-foreground" />}
            label="Location"
            value={eventPlan.location}
            empty="No location set yet"
            editHref={editHref}
          />
          <Fact
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
            label="Budget"
            value={eventPlan.budget}
            empty="No budget set yet"
            editHref={editHref}
          />
          {/* How this plan is filed is a required answer, and a plan that
              slipped through unfiled is exactly what needs fixing. */}
          <div className="flex items-start gap-2 text-sm">
            <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Recurring event</p>
              {eventPlan.catalogEntry ? (
                <Link
                  href="/admin/board/event-catalog"
                  className="hover:underline"
                  title="This is one year of a recurring event"
                >
                  {eventPlan.catalogEntry.iconEmoji && (
                    <span aria-hidden>{eventPlan.catalogEntry.iconEmoji} </span>
                  )}
                  {eventPlan.catalogEntry.title}
                </Link>
              ) : eventPlan.isOneOff ? (
                <p>One-off event</p>
              ) : (
                <p className="text-muted-foreground">
                  Not filed as recurring or one-off
                </p>
              )}
            </div>
          </div>
        </div>

        {/* What last year's team wanted this year's to know. Read through from
            the recurring event rather than copied onto the plan, so a tip
            corrected once is corrected everywhere — the same contract the
            inherited contacts on the Resources tab have. */}
        {catalogTips.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5" />
              Tips from {eventPlan.catalogEntry?.title ?? "this recurring event"}
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              {catalogTips.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
            {isBoardMember && (
              <Link
                href="/admin/board/event-catalog"
                className="mt-2 inline-block text-xs text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
              >
                Edit these on the recurring event
              </Link>
            )}
          </div>
        )}

        {eventPlan.tags && eventPlan.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1">
            <Tag className="mr-1 h-4 w-4 text-muted-foreground" />
            {eventPlan.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tagLabels[tag] ?? tag}
              </span>
            ))}
          </div>
        )}

        {/* DragonHub collects who's interested; SignUpGenius locks in the time
            slots. Surfacing the link here keeps the event plan the one place
            anyone has to look. */}
        {eventPlan.signupGeniusUrl && (
          <a
            href={eventPlan.signupGeniusUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center gap-2 rounded-lg border border-dragon-blue-200 bg-dragon-blue-50 p-3 text-sm font-medium text-dragon-blue-700 hover:border-dragon-blue-300"
          >
            <ClipboardList className="h-4 w-4" />
            Sign up for a volunteer time slot
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {leads.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground">
              Led by
            </p>
            <p className="text-sm">{leads.join(", ")}</p>
          </div>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          Created by {eventPlan.creatorName ?? "Unknown"} &middot;{" "}
          {eventPlan.schoolYear}
        </p>

        {/* The event has been and gone and the plan still says it's being
            planned. Drafts are the case that reaches here — the nightly sweep
            deliberately leaves those alone, because completing one makes it
            undeletable. One click from anyone who can write to the plan. */}
        {isPastDue && !isCompleted && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-dragon-blue-200 bg-dragon-blue-50 p-3 text-sm dark:border-dragon-blue-900 dark:bg-dragon-blue-950/40">
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-dragon-blue-600 dark:text-dragon-blue-400" />
            <p className="text-dragon-blue-800 dark:text-dragon-blue-200">
              This event&rsquo;s date has passed.{" "}
              {canComplete
                ? "Mark it completed below and write down what you'd tell next year's team."
                : "A lead or a board member can close it out."}
            </p>
          </div>
        )}

        {/* Says why the controls are missing. Without it, a board member who
            can edit every other plan just sees a page that stopped working. */}
        {isCompleted && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-muted-foreground">
              This event is completed, so it&rsquo;s the record next year&rsquo;s
              planners inherit.{" "}
              {canEdit
                ? "As a lead, you can still edit it and add to it."
                : "Only its leads can make further changes."}
              {canReopen && " Reopen it below if it needs wider changes."}
            </p>
          </div>
        )}
      </div>

      <AIRecommendations
        eventPlanId={eventPlan.id}
        canInteract={canInteract}
      />

      <EventPlanApprovalPanel
        eventPlanId={eventPlan.id}
        status={eventPlan.status}
        votes={votes}
        isBoardMember={isBoardMember}
        currentUserId={currentUserId}
        approvalThreshold={approvalThreshold}
      />

      <div className="flex flex-wrap gap-2">
        {isLead &&
          (eventPlan.status === "draft" ||
            eventPlan.status === "rejected") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                haptic("success");
                void submitForApproval(eventPlan.id);
              }}
            >
              <Send className="h-4 w-4" /> Submit for Approval
            </Button>
          )}
        {canComplete && (
          <Button
            size="sm"
            variant={isPastDue ? "default" : "outline"}
            onClick={() => {
              haptic("success");
              void completeEventPlan(eventPlan.id);
            }}
          >
            <CheckCircle2 className="h-4 w-4" /> Mark Completed
          </Button>
        )}
        {canReopen && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleReopen}
            disabled={reopening}
          >
            <RotateCcw className="h-4 w-4" />{" "}
            {reopening ? "Reopening..." : "Reopen Plan"}
          </Button>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        )}
      </div>

      {deleteError && (
        <p className="text-sm text-destructive">{deleteError}</p>
      )}

      {confirmDialog}
    </div>
  );
}

/**
 * One field on the plan, present whether or not it has been filled in.
 *
 * The empty state is the reason this exists: a missing date on an event plan is
 * a thing to fix, not a thing to hide, and hiding it is what made people think
 * the field didn't exist.
 */
function Fact({
  icon,
  label,
  value,
  empty,
  editHref,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  empty: string;
  /** Null when the reader can't edit this plan — then it's just a statement. */
  editHref: string | null;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {value ? (
          <p className="break-words">{value}</p>
        ) : editHref ? (
          <Link
            href={editHref}
            className="text-muted-foreground italic hover:text-foreground hover:underline"
          >
            {empty} — add one
          </Link>
        ) : (
          <p className="text-muted-foreground italic">{empty}</p>
        )}
      </div>
    </div>
  );
}
