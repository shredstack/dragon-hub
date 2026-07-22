"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  archiveClassroom,
  deleteClassroomPermanently,
  restoreClassroom,
} from "@/actions/classrooms";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";

interface ClassroomActionsProps {
  classroomId: string;
  classroomName: string;
  active: boolean;
  /** True only when nothing is attached to the classroom. */
  canDeletePermanently: boolean;
}

/**
 * Archiving is the default because a classroom is a record: last year's room
 * parents, party sign-ups and message board are the institutional memory this
 * app exists to keep. Permanent delete is offered only for rooms with nothing
 * attached — the typo case.
 */
export function ClassroomActions({
  classroomId,
  classroomName,
  active,
  canDeletePermanently,
}: ClassroomActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<"archive" | "delete" | null>(null);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  async function run(kind: "archive" | "delete", fn: () => Promise<unknown>) {
    setLoading(kind);
    try {
      await fn();
      if (kind === "delete") {
        router.push("/admin/classrooms");
      }
      router.refresh();
    } catch (error) {
      console.error(`classroom-actions: ${kind} failed`, error);
      alert(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(null);
      closeConfirm();
    }
  }

  const handleArchive = async () => {
    // Restoring is harmless, so it goes straight through.
    if (!active) {
      run("archive", () => restoreClassroom(classroomId));
      return;
    }

    const ok = await confirm({
      title: `Archive "${classroomName}"?`,
      description:
        "It is hidden from volunteer sign-up, room parent coverage and My Classrooms. Its members, messages, tasks and sign-ups are all kept, and you can restore it at any time.",
      confirmLabel: "Archive classroom",
      tone: "default",
    });
    if (!ok) return;

    run("archive", () => archiveClassroom(classroomId));
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Permanently delete "${classroomName}"?`,
      description:
        "This classroom has no members, messages, tasks or sign-ups, so nothing is lost — but it can't be undone.",
      confirmLabel: "Delete classroom",
    });
    if (!ok) return;

    run("delete", () => deleteClassroomPermanently(classroomId));
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handleArchive}
        disabled={loading !== null}
      >
        {active ? (
          <Archive className="mr-2 h-4 w-4" />
        ) : (
          <ArchiveRestore className="mr-2 h-4 w-4" />
        )}
        {loading === "archive" ? "Saving..." : active ? "Archive" : "Restore"}
      </Button>

      {canDeletePermanently && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleDelete}
          disabled={loading !== null}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          title="Available because nothing is attached to this classroom"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {loading === "delete" ? "Deleting..." : "Delete"}
        </Button>
      )}

      {confirmDialog}
    </div>
  );
}
