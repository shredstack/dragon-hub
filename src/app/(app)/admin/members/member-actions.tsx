"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteUser } from "@/actions/admin";
import { removeMember, updateMemberRole } from "@/actions/school-membership";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SCHOOL_ROLES, PTA_BOARD_POSITIONS } from "@/lib/constants";
import { Trash2, UserMinus } from "lucide-react";
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
  /** True School Admin role — permanent account deletion is not a board-wide power. */
  canDelete: boolean;
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
  canDelete,
}: MemberActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
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

  async function handleRemove() {
    const displayName = userName || userEmail;
    const ok = await confirm({
      title: `Remove ${displayName} from the school?`,
      description:
        "They come off the directory and lose access. Their account and history stay intact, and they can rejoin with the school join code or by signing up to volunteer.",
      confirmLabel: "Remove from school",
    });
    if (!ok) return;

    setLoading(true);
    try {
      await removeMember(schoolId, membershipId);
      router.refresh();
    } catch (error) {
      console.error("Failed to remove member:", error);
      alert(error instanceof Error ? error.message : "Failed to remove member");
    } finally {
      setLoading(false);
      closeConfirm();
    }
  }

  async function handleDelete() {
    const displayName = userName || userEmail;
    const ok = await confirm({
      title: `Permanently delete ${displayName}'s account?`,
      description:
        "This is not the same as removing them from the school. It erases the account everywhere:",
      consequences: [
        "Their logged volunteer hours",
        "Their classroom and event plan memberships",
        "Posts and messages they authored",
      ],
      alternative:
        "For someone simply leaving the school, use Remove instead — that keeps the record and lets them rejoin.",
      confirmLabel: "Delete account",
      confirmPhrase: displayName,
    });
    if (!ok) return;

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
      closeConfirm();
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
        onClick={handleRemove}
        disabled={loading}
        title="Remove from school"
        className="text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <UserMinus className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only sm:ml-1">Remove</span>
      </Button>

      {canDelete && (
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDelete}
          disabled={loading}
          title="Delete account permanently"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Delete account permanently</span>
        </Button>
      )}
      {confirmDialog}
    </div>
  );
}
