"use client";

import { useState } from "react";
import {
  removeEventPlanMember,
  updateEventPlanMemberRole,
  joinEventPlan,
} from "@/actions/event-plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EVENT_PLAN_MEMBER_ROLES } from "@/lib/constants";
import { UserPlus, X, ArrowUpDown } from "lucide-react";
import { AddEventMemberDialog } from "./add-event-member-dialog";
import type { EventPlanMemberRole } from "@/types";

interface Member {
  userId: string;
  userName: string;
  userEmail: string;
  role: EventPlanMemberRole;
}

interface EventPlanMembersProps {
  eventPlanId: string;
  members: Member[];
  currentUserId: string;
  isMember: boolean;
  canManage: boolean;
}

export function EventPlanMembers({
  eventPlanId,
  members,
  currentUserId,
  isMember,
  canManage,
}: EventPlanMembersProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {members.length} {members.length === 1 ? "Member" : "Members"}
        </h3>
        <div className="flex gap-2">
          {!isMember && (
            <Button size="sm" variant="outline" onClick={() => joinEventPlan(eventPlanId)}>
              <UserPlus className="h-4 w-4" /> Join
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <UserPlus className="h-4 w-4" /> Add Member
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.userId}
            className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {(member.userName?.[0] ?? member.userEmail[0]).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium">
                  {member.userName || member.userEmail}
                </p>
                <p className="text-xs text-muted-foreground">
                  {member.userEmail}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={member.role === "lead" ? "default" : "secondary"}
              >
                {EVENT_PLAN_MEMBER_ROLES[member.role]}
              </Badge>
              {canManage && member.userId !== currentUserId && (
                <>
                  <button
                    onClick={() =>
                      updateEventPlanMemberRole(
                        eventPlanId,
                        member.userId,
                        member.role === "lead" ? "member" : "lead"
                      )
                    }
                    className="text-muted-foreground hover:text-foreground"
                    title={
                      member.role === "lead"
                        ? "Demote to member"
                        : "Promote to lead"
                    }
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      removeEventPlanMember(eventPlanId, member.userId)
                    }
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <AddEventMemberDialog
        eventPlanId={eventPlanId}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        existingMemberIds={members.map((m) => m.userId)}
      />
    </div>
  );
}
