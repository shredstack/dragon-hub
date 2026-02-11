"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateMemberRole, removeMember } from "@/actions/super-admin";
import { MoreHorizontal, Shield, ShieldOff, UserMinus } from "lucide-react";
import type { SchoolRole } from "@/types";

interface MemberActionsProps {
  membershipId: string;
  currentRole: SchoolRole;
  userName: string | null;
}

export function MemberActions({
  membershipId,
  currentRole,
  userName,
}: MemberActionsProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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

  async function handleRemove() {
    if (!confirm(`Remove ${userName || "this member"} from the school?`)) {
      return;
    }
    setIsLoading(true);
    try {
      await removeMember(membershipId);
      router.refresh();
    } catch (error) {
      console.error("Failed to remove member:", error);
    } finally {
      setIsLoading(false);
      setIsOpen(false);
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
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border bg-background py-1 shadow-lg">
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
    </div>
  );
}
