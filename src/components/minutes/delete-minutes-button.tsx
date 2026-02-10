"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteMinutes } from "@/actions/minutes";
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

  async function handleDelete() {
    if (
      !confirm(
        `Are you sure you want to delete "${fileName}"?\n\nThis will permanently remove this record from the database. The file will remain in Google Drive.`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      await deleteMinutes(minutesId);
      router.push("/minutes");
      router.refresh();
    } catch (error) {
      console.error("Failed to delete:", error);
      alert("Failed to delete. Please try again.");
      setLoading(false);
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
    </Button>
  );
}
