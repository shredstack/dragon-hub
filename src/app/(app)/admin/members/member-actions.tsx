"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteUser } from "@/actions/admin";
import { updateMemberRole } from "@/actions/school-membership";
import { Button } from "@/components/ui/button";
import { SCHOOL_ROLES, PTA_BOARD_POSITIONS } from "@/lib/constants";
import { Trash2 } from "lucide-react";
import type { SchoolRole, PtaBoardPosition } from "@/types";

interface MemberActionsProps {
  membershipId: string;
  schoolId: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  currentRole: SchoolRole;
  currentBoardPosition: PtaBoardPosition | null;
  isCurrentUser: boolean;
  canEdit: boolean;
}

export function MemberActions({
  membershipId,
  schoolId,
  userId,
  userName,
  userEmail,
  currentRole,
  currentBoardPosition,
  isCurrentUser,
  canEdit,
}: MemberActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<SchoolRole>(currentRole);
  const [boardPosition, setBoardPosition] = useState<PtaBoardPosition | null>(
    currentBoardPosition
  );

  async function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as SchoolRole;
    if (newRole === role) return;

    setLoading(true);
    try {
      // Clear board position if role is not pta_board
      const newBoardPosition = newRole === "pta_board" ? boardPosition : null;
      await updateMemberRole(schoolId, membershipId, newRole, newBoardPosition);
      setRole(newRole);
      if (newRole !== "pta_board") {
        setBoardPosition(null);
      }
      router.refresh();
    } catch (error) {
      console.error("Failed to update role:", error);
      alert(error instanceof Error ? error.message : "Failed to update role");
    } finally {
      setLoading(false);
    }
  }

  async function handleBoardPositionChange(
    e: React.ChangeEvent<HTMLSelectElement>
  ) {
    const newPosition = (e.target.value || null) as PtaBoardPosition | null;
    if (newPosition === boardPosition) return;

    setLoading(true);
    try {
      await updateMemberRole(schoolId, membershipId, role, newPosition);
      setBoardPosition(newPosition);
      router.refresh();
    } catch (error) {
      console.error("Failed to update board position:", error);
      alert(
        error instanceof Error ? error.message : "Failed to update position"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const displayName = userName || userEmail;
    if (
      !window.confirm(
        `Are you sure you want to permanently delete "${displayName}"? This action cannot be undone and will remove all their data including volunteer hours, event memberships, and classroom assignments.`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      await deleteUser(userId);
      router.refresh();
    } catch (error) {
      console.error("Failed to delete user:", error);
      alert(
        error instanceof Error ? error.message : "Failed to delete user"
      );
    } finally {
      setLoading(false);
    }
  }

  if (isCurrentUser) {
    return (
      <span className="text-xs text-muted-foreground">You</span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit && (
        <>
          <select
            value={role}
            onChange={handleRoleChange}
            disabled={loading}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {Object.entries(SCHOOL_ROLES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          {role === "pta_board" && (
            <select
              value={boardPosition || ""}
              onChange={handleBoardPositionChange}
              disabled={loading}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              <option value="">No Position</option>
              {Object.entries(PTA_BOARD_POSITIONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={handleDelete}
        disabled={loading}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
