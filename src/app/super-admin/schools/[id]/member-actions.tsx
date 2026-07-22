"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  updateMemberRole,
  removeMember,
  setMemberStatus,
} from "@/actions/super-admin";
import {
  MoreHorizontal,
  Shield,
  ShieldOff,
  UserMinus,
  RotateCcw,
  Clock,
} from "lucide-react";
import type { SchoolRole, SchoolMembershipStatus } from "@/types";

interface MemberActionsProps {
  membershipId: string;
  currentRole: SchoolRole;
  currentStatus: SchoolMembershipStatus;
  userName: string | null;
}

export function MemberActions({
  membershipId,
  currentRole,
  currentStatus,
  userName,
}: MemberActionsProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  async function handleRoleChange(newRole: SchoolRole) {
    setIsLoading(true);
    try {
      await updateMemberRole(membershipId, newRole);
      router.refresh();
    } catch (error) {
      console.error("Failed to update role:", error);
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  }

  async function handleStatusChange(status: SchoolMembershipStatus) {
    setIsLoading(true);
    try {
      await setMemberStatus(membershipId, status);
      router.refresh();
    } catch (error) {
      console.error("Failed to update status:", error);
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  }

  async function handleRemove() {
    const ok = await confirm({
      title: `Remove ${userName || "this member"} from the school?`,
      description:
        "They lose access to this school. Their account and history stay intact, and they can rejoin with the join code.",
      confirmLabel: "Remove member",
    });
    if (!ok) return;

    setIsLoading(true);
    try {
      await removeMember(membershipId);
      router.refresh();
    } catch (error) {
      console.error("Failed to remove member:", error);
    } finally {
      setIsLoading(false);
      setIsOpen(false);
      closeConfirm();
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="rounded p-1 hover:bg-muted disabled:opacity-50"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border bg-background py-1 shadow-lg">
            {/* Status controls — the break-glass path when a bad rollover has
                expired everyone and nobody can get back in. */}
            {currentStatus !== "approved" && (
              <button
                onClick={() => handleStatusChange("approved")}
                disabled={isLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-green-700 hover:bg-muted disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Restore Access
              </button>
            )}

            {currentStatus === "approved" && (
              <button
                onClick={() => handleStatusChange("expired")}
                disabled={isLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <Clock className="h-4 w-4" />
                Mark Expired
              </button>
            )}

            <div className="my-1 border-t" />

            {currentRole === "admin" ? (
              <button
                onClick={() => handleRoleChange("member")}
                disabled={isLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <ShieldOff className="h-4 w-4" />
                Remove Admin Role
              </button>
            ) : (
              <button
                onClick={() => handleRoleChange("admin")}
                disabled={isLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <Shield className="h-4 w-4" />
                Make Admin
              </button>
            )}

            {currentRole !== "pta_board" && (
              <button
                onClick={() => handleRoleChange("pta_board")}
                disabled={isLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <Shield className="h-4 w-4" />
                Make PTA Board
              </button>
            )}

            {currentRole === "pta_board" && (
              <button
                onClick={() => handleRoleChange("member")}
                disabled={isLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                <ShieldOff className="h-4 w-4" />
                Remove PTA Board Role
              </button>
            )}

            <div className="my-1 border-t" />

            <button
              onClick={handleRemove}
              disabled={isLoading}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-muted disabled:opacity-50"
            >
              <UserMinus className="h-4 w-4" />
              Remove from School
            </button>
          </div>
        </>
      )}

      {confirmDialog}
    </div>
  );
}
