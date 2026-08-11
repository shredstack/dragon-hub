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
  EVENT_PLAN_ROLE_CHOICES,
  eventPlanRoleChoice,
  eventPlanRoleInput,
  eventPlanRoleLabel,
  type EventPlanRoleChoice,
} from "@/lib/event-plan-roles-shared";
import { UserPlus, X, Mail } from "lucide-react";
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
  /** The title they were invited as, confirmed when they accept. */
  leadType: EventPlanLeadType | null;
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
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);
  // Changing a title can be refused — a board lead has to be on the board —
  // and the reason belongs beside the row it was refused for.
  const [roleError, setRoleError] = useState<{
    memberId: string;
    message: string;
  } | null>(null);
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

  async function handleRoleChange(member: Member, choice: EventPlanRoleChoice) {
    const { role, leadType } = eventPlanRoleInput(choice);
    setSavingRoleId(member.id);
    setRoleError(null);
    try {
      await updateEventPlanMemberRole(member.id, role, leadType);
    } catch (e) {
      setRoleError({
        memberId: member.id,
        message:
          e instanceof Error ? e.message : "Couldn't change that person's role.",
      });
    } finally {
      setSavingRoleId(null);
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
            className="rounded-md border border-border bg-card p-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                {/* A picker rather than a promote/demote toggle: board lead and
                    committee chair are both "lead" to every permission check,
                    so the toggle left the difference between them to be guessed
                    server-side with no way to say which you meant. Never the
                    viewer's own row — nobody demotes themselves out of the plan
                    they're standing in. */}
                {canManage && member.userId !== currentUserId ? (
                  <select
                    value={eventPlanRoleChoice(member.role, member.leadType)}
                    disabled={savingRoleId === member.id}
                    onChange={(e) =>
                      handleRoleChange(
                        member,
                        e.target.value as EventPlanRoleChoice
                      )
                    }
                    aria-label={`Role for ${member.userName}`}
                    className="h-11 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                  >
                    {/* Offered only to a lead recorded before the board/chair
                        split, so the picker never claims a title the row
                        doesn't hold. Choosing either real one settles it. */}
                    {eventPlanRoleChoice(member.role, member.leadType) ===
                      "lead" && <option value="lead">Lead — not set</option>}
                    {EVENT_PLAN_ROLE_CHOICES.map((choice) => (
                      <option key={choice.value} value={choice.value}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge
                    variant={member.role === "lead" ? "default" : "secondary"}
                  >
                    {eventPlanRoleLabel(member.role, member.leadType)}
                  </Badge>
                )}
                {!member.userId && <Badge variant="outline">Not joined</Badge>}
                {canManage && member.userId !== currentUserId && (
                  <DeleteIconButton
                    onClick={() => handleRemove(member)}
                    busy={removingId === member.id}
                    aria-label={`Remove ${member.userName}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </DeleteIconButton>
                )}
              </div>
            </div>
            {roleError?.memberId === member.id && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                {roleError.message}
              </p>
            )}
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
                  {eventPlanRoleLabel(invite.role, invite.leadType)}
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
