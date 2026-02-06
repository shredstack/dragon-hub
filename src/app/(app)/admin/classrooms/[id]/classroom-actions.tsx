"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteClassroom } from "@/actions/classrooms";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface ClassroomActionsProps {
  classroomId: string;
  classroomName: string;
}

export function ClassroomActions({
  classroomId,
  classroomName,
}: ClassroomActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (
      !window.confirm(
        `Are you sure you want to delete "${classroomName}"? This will permanently remove all members, messages, tasks, and room parent info associated with this classroom.`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      await deleteClassroom(classroomId);
      router.push("/admin/classrooms");
      router.refresh();
    } catch (error) {
      console.error("Failed to delete classroom:", error);
      alert(
        error instanceof Error ? error.message : "Failed to delete classroom"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleDelete}
      disabled={loading}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="mr-2 h-4 w-4" />
      {loading ? "Deleting..." : "Delete Classroom"}
    </Button>
  );
}
