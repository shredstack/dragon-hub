"use client";

import { submitForApproval, completeEventPlan, deleteEventPlan } from "@/actions/event-plans";
import { useRouter } from "next/navigation";
import { EventPlanStatusBadge } from "./event-plan-status-badge";
import { EventPlanApprovalPanel } from "./event-plan-approval-panel";
import { AIRecommendations } from "./ai-recommendations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, MapPin, DollarSign, Pencil, Send, CheckCircle2, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
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
    status: EventPlanStatus;
    schoolYear: string;
    creatorName: string | null;
  };
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
}

export function EventPlanOverview({
  eventPlan,
  leads,
  votes,
  currentUserId,
  isBoardMember,
  isLead,
  canEdit,
  canInteract,
}: EventPlanOverviewProps) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this event plan?")) return;
    await deleteEventPlan(eventPlan.id);
    router.push("/events");
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
        </div>

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
        {canEdit && (
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
    </div>
  );
}
