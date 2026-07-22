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
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, MapPin, DollarSign, Pencil, Send, CheckCircle2, Trash2, ClipboardList, ExternalLink, Repeat, Tag, Lock, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/utils";
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
    location: string | null;
    budget: string | null;
    signupGeniusUrl: string | null;
    tags: string[] | null;
    /** The recurring event this plan is filed under, if any. */
    catalogEntry: { id: string; title: string } | null;
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
}: EventPlanOverviewProps) {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [reopening, setReopening] = useState(false);

  const isCompleted = eventPlan.status === "completed";

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
      router.push("/events");
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
            <Link href={`/events/${eventPlan.id}/edit`}>
              <Button size="sm" variant="outline">
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </Link>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {eventPlan.eventDate && (
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span>{formatDate(eventPlan.eventDate)}</span>
            </div>
          )}
          {eventPlan.location && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{eventPlan.location}</span>
            </div>
          )}
          {eventPlan.budget && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span>{eventPlan.budget}</span>
            </div>
          )}
          {/* Always shown: how this plan is filed is a required answer, and a
              plan that slipped through unfiled is exactly what needs fixing. */}
          <div className="flex items-center gap-2 text-sm">
            <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />
            {eventPlan.catalogEntry ? (
              <Link
                href="/admin/board/event-catalog"
                className="hover:underline"
                title="This is one year of a recurring event"
              >
                Recurring: {eventPlan.catalogEntry.title}
              </Link>
            ) : eventPlan.isOneOff ? (
              <span>One-off event</span>
            ) : (
              <span className="text-muted-foreground">
                Not filed as recurring or one-off
              </span>
            )}
          </div>
        </div>

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
      />

      <div className="flex flex-wrap gap-2">
        {isLead &&
          (eventPlan.status === "draft" ||
            eventPlan.status === "rejected") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => submitForApproval(eventPlan.id)}
            >
              <Send className="h-4 w-4" /> Submit for Approval
            </Button>
          )}
        {(isLead || isBoardMember) && eventPlan.status === "approved" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => completeEventPlan(eventPlan.id)}
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
