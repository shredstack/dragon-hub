"use client";

import { useState } from "react";
import {
  removeEventPlanMember,
  updateEventPlanMemberRole,
} from "@/actions/event-plans";
import {
  resendEventPlanInvite,
  revokeEventPlanInvite,
} from "@/actions/event-plan-invites";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EVENT_PLAN_MEMBER_ROLES,
  EVENT_PLAN_LEAD_TYPES,
} from "@/lib/constants";
import { UserPlus, X, ArrowUpDown, Mail } from "lucide-react";
import { DeleteIconButton, useConfirm } from "@/components/ui/confirm-dialog";
import { AddEventMemberDialog } from "./add-event-member-dialog";
import type { EventPlanMemberRole, EventPlanLeadType } from "@/types";

interface Member {
  /** Membership row id — how a member is addressed, since placeholders have no user id. */
  id: string;
  /** Null for a committee chair assigned before they had an account. */
  userId: string | null;
  userName: string;
  userEmail: string;
  role: EventPlanMemberRole;
  leadType: EventPlanLeadType | null;
}

/** An emailed invitation that hasn't been accepted yet. */
interface PendingInvite {
  id: string;
  email: string;
  name: string | null;
  role: EventPlanMemberRole;
  inviterName: string | null;
}

interface EventPlanMembersProps {
  eventPlanId: string;
  members: Member[];
  pendingInvites: PendingInvite[];
  currentUserId: string;
  canManage: boolean;
}

export function EventPlanMembers({
  eventPlanId,
  members,
  pendingInvites,
  currentUserId,
  canManage,
}: EventPlanMembersProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [resentInviteId, setResentInviteId] = useState<string | null>(null);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  async function handleResend(invite: PendingInvite) {
    setBusyInviteId(invite.id);
    try {
      await resendEventPlanInvite(invite.id);
      setResentInviteId(invite.id);
    } finally {
      setBusyInviteId(null);
    }
  }

  async function handleRevoke(invite: PendingInvite) {
    const ok = await confirm({
      title: `Withdraw the invitation to ${invite.email}?`,
      description:
        "The link already in their inbox stops working. You can invite them again later.",
      confirmLabel: "Withdraw",
    });
    if (!ok) return;

    setBusyInviteId(invite.id);
    try {
      await revokeEventPlanInvite(invite.id);
    } finally {
      setBusyInviteId(null);
      closeConfirm();
    }
  }

  async function handleRemove(member: Member) {
    const ok = await confirm({
      title: `Remove ${member.userName} from this plan?`,
      description:
        "They lose access to the plan's tasks, meetings and message board. Their account and anything they already posted stay put.",
      confirmLabel: "Remove",
    });
    if (!ok) return;

    setRemovingId(member.id);
    try {
      await removeEventPlanMember(member.id);
    } finally {
      setRemovingId(null);
      closeConfirm();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {members.length} {members.length === 1 ? "Member" : "Members"}
        </h3>
        <div className="flex gap-2">
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
            key={member.id}
            className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {(member.userName[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{member.userName}</p>
                <p className="break-all text-xs text-muted-foreground">
                  {/* A placeholder has no account behind it, and saying so is
                      the only way a lead knows why this person can't be given
                      a task or invited to a meeting. */}
                  {member.userId
                    ? member.userEmail
                    : member.userEmail || "No account yet"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={member.role === "lead" ? "default" : "secondary"}
              >
                {member.role === "lead" && member.leadType
                  ? EVENT_PLAN_LEAD_TYPES[member.leadType]
                  : EVENT_PLAN_MEMBER_ROLES[member.role]}
              </Badge>
              {!member.userId && <Badge variant="outline">Not joined</Badge>}
              {canManage && member.userId !== currentUserId && (
                <>
                  <button
                    onClick={() =>
                      updateEventPlanMemberRole(
                        member.id,
                        member.role === "lead" ? "member" : "lead"
                      )
                    }
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={
                      member.role === "lead"
                        ? "Demote to member"
                        : "Promote to lead"
                    }
                  >
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                  <DeleteIconButton
                    onClick={() => handleRemove(member)}
                    busy={removingId === member.id}
                    aria-label={`Remove ${member.userName}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </DeleteIconButton>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Invitations that haven't been accepted yet. Without these the person
          a lead invited five minutes ago simply isn't on the page, and the
          natural conclusion is that it didn't work. */}
      {pendingInvites.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            {pendingInvites.length} Pending{" "}
            {pendingInvites.length === 1 ? "Invitation" : "Invitations"}
          </h3>
          {pendingInvites.map((invite) => (
            <div
              key={invite.id}
              className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {invite.name || invite.email}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {invite.name ? `${invite.email} — ` : ""}invited
                    {invite.inviterName ? ` by ${invite.inviterName}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {EVENT_PLAN_MEMBER_ROLES[invite.role]}
                </Badge>
                {canManage && (
                  <>
                    <button
                      onClick={() => handleResend(invite)}
                      disabled={busyInviteId === invite.id}
                      className="inline-flex h-11 shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      {resentInviteId === invite.id ? "Sent" : "Resend"}
                    </button>
                    <DeleteIconButton
                      onClick={() => handleRevoke(invite)}
                      busy={busyInviteId === invite.id}
                      aria-label={`Withdraw invitation to ${invite.email}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </DeleteIconButton>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddEventMemberDialog
        eventPlanId={eventPlanId}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />

      {confirmDialog}
    </div>
  );
}
