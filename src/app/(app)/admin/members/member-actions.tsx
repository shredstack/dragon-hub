"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteUser } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface MemberActionsProps {
  userId: string;
  userName: string | null;
  userEmail: string;
  isCurrentUser: boolean;
}

export function MemberActions({
  userId,
  userName,
  userEmail,
  isCurrentUser,
}: MemberActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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
    <Button
      size="sm"
      variant="ghost"
      onClick={handleDelete}
      disabled={loading}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
