"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { archiveMinutes, deleteMinutes } from "@/actions/minutes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Trash2 } from "lucide-react";

interface DeleteMinutesButtonProps {
  minutesId: string;
  fileName: string;
}

export function DeleteMinutesButton({
  minutesId,
  fileName,
}: DeleteMinutesButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  async function archiveInstead(reason: string) {
    const archive = await confirm({
      title: `"${fileName}" can't be deleted`,
      description: reason,
      alternative:
        "Archive it instead — it comes off the minutes list but stays in the database as part of the record.",
      confirmLabel: "Archive instead",
      cancelLabel: "Keep as is",
      tone: "default",
    });
    closeConfirm();
    if (!archive) return;

    setLoading(true);
    try {
      await archiveMinutes(minutesId);
      router.push("/minutes");
      router.refresh();
    } catch (error) {
      console.error("Failed to archive:", error);
      alert("Failed to archive. Please try again.");
      setLoading(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete "${fileName}"?`,
      description:
        "This removes the record from DragonHub. The file itself stays in Google Drive.",
      confirmLabel: "Delete record",
    });
    if (!ok) return;

    setLoading(true);
    try {
      await deleteMinutes(minutesId);
      router.push("/minutes");
      router.refresh();
    } catch (error) {
      // The server refuses once minutes are approved or cited by a knowledge
      // article, and its message explains which. Offer the archive path rather
      // than showing a dead end.
      setLoading(false);
      closeConfirm();
      await archiveInstead(
        error instanceof Error ? error.message : "It is part of the school's record."
      );
    }
  }

  return (
    <Button
      onClick={handleDelete}
      disabled={loading}
      size="sm"
      variant="ghost"
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="mr-1 h-4 w-4" />
      {loading ? "Deleting..." : "Delete"}
      {confirmDialog}
    </Button>
  );
}
