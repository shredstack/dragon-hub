"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  deleteCalendarIntegration,
  deleteDriveIntegration,
  updateCalendarIntegration,
  updateDriveIntegration,
} from "@/actions/integrations";
import { CalendarIntegrationForm } from "./calendar-integration-form";
import { DriveIntegrationForm } from "./drive-integration-form";

interface IntegrationActionsProps {
  type: "calendar" | "drive";
  id: string;
  active: boolean;
  integration: {
    id: string;
    name: string | null;
    calendarId?: string;
    calendarType?: "pta" | "school" | null;
    folderId?: string;
    folderType?: "general" | "minutes" | null;
    maxDepth?: number | null;
    schoolYear?: string | null;
  };
}

export function IntegrationActions({
  type,
  id,
  active,
  integration,
}: IntegrationActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  async function handleToggle() {
    setLoading(true);
    try {
      if (type === "calendar") {
        await updateCalendarIntegration(id, { active: !active });
      } else {
        await updateDriveIntegration(id, { active: !active });
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Disconnect this ${type === "calendar" ? "calendar" : "Drive folder"}?`,
      description:
        type === "calendar"
          ? "Synced events stop updating and come off the DragonHub calendar. Nothing in Google Calendar changes."
          : "Files from this folder stop syncing and drop out of search. Nothing in Google Drive changes.",
      confirmLabel: "Disconnect",
    });
    if (!ok) return;

    setLoading(true);
    try {
      if (type === "calendar") {
        await deleteCalendarIntegration(id);
      } else {
        await deleteDriveIntegration(id);
      }
      router.refresh();
    } finally {
      setLoading(false);
      closeConfirm();
    }
  }

  return (
    <div className="flex items-center gap-2">
      {type === "calendar" ? (
        <CalendarIntegrationForm
          integration={{
            id: integration.id,
            calendarId: integration.calendarId!,
            name: integration.name,
            calendarType: integration.calendarType ?? "pta",
          }}
        />
      ) : (
        <DriveIntegrationForm
          integration={{
            id: integration.id,
            folderId: integration.folderId!,
            name: integration.name,
            folderType: integration.folderType ?? "general",
            maxDepth: integration.maxDepth ?? 5,
            schoolYear: integration.schoolYear ?? null,
          }}
        />
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        disabled={loading}
      >
        {active ? "Disable" : "Enable"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        disabled={loading}
        className="text-destructive hover:text-destructive"
      >
        Delete
      </Button>
      {confirmDialog}
    </div>
  );
}
