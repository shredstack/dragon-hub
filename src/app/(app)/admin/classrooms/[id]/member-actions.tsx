"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateMemberRole, removeClassroomMember } from "@/actions/classrooms";
import { USER_ROLES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/types";

interface MemberActionsProps {
  memberId: string;
  currentRole: string;
}

export function MemberActions({ memberId, currentRole }: MemberActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as UserRole;
    if (newRole === currentRole) return;
    setLoading(true);
    try {
      await updateMemberRole(memberId, newRole);
      router.refresh();
    } catch (error) {
      console.error("Failed to update role:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm("Are you sure you want to remove this member?")) return;
    setLoading(true);
    try {
      await removeClassroomMember(memberId);
      router.refresh();
    } catch (error) {
      console.error("Failed to remove member:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={currentRole}
        onChange={handleRoleChange}
        disabled={loading}
        className="rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        {Object.entries(USER_ROLES).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="destructive"
        onClick={handleRemove}
        disabled={loading}
      >
        Remove
      </Button>
    </div>
  );
}
