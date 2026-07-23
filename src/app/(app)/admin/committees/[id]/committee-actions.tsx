"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  archiveCommittee,
  deleteCommitteePermanently,
  getCommitteeHistoryCounts,
  restoreCommittee,
  setCommitteeScope,
  updateCommittee,
} from "@/actions/committees";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  CommitteeForm,
  toCommitteeInput,
  type CommitteeFormValue,
} from "../committee-form";

/** ISO timestamp → the value a `datetime-local` input expects. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

interface Props {
  config: {
    id: string;
    name: string;
    description: string | null;
    responsibilities: string | null;
    typicalTiming: string | null;
    timeCommitment: string | null;
    iconEmoji: string | null;
    imageUrl: string | null;
    scope: "school" | "classroom" | "event_plan";
    classroomId: string | null;
    eventPlanId: string | null;
    grantsLinkedAccess: boolean;
    showOnRoomParentSignup: boolean;
    capacityMode: "open" | "capped";
    minSize: number | null;
    maxSize: number | null;
    waitlistEnabled: boolean;
    opensAt: string | null;
    closesAt: string | null;
    ownerPosition: string | null;
    contactEmail: string | null;
    status: "draft" | "active" | "closed";
    archivedAt: Date | null;
  };
  classroomOptions: Array<{ id: string; name: string; gradeLevel: string | null }>;
  eventPlanOptions: Array<{ id: string; title: string; schoolYear: string }>;
}

export function CommitteeActions({
  config,
  classroomOptions,
  eventPlanOptions,
}: Props) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const { addToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<CommitteeFormValue>({
    name: config.name,
    description: config.description ?? "",
    responsibilities: config.responsibilities ?? "",
    typicalTiming: config.typicalTiming ?? "",
    timeCommitment: config.timeCommitment ?? "",
    iconEmoji: config.iconEmoji ?? "",
    imageUrl: config.imageUrl ?? "",
    scope: config.scope,
    classroomId: config.classroomId ?? "",
    eventPlanId: config.eventPlanId ?? "",
    grantsLinkedAccess: config.grantsLinkedAccess,
    showOnRoomParentSignup: config.showOnRoomParentSignup,
    capacityMode: config.capacityMode,
    minSize: config.minSize?.toString() ?? "",
    maxSize: config.maxSize?.toString() ?? "",
    waitlistEnabled: config.waitlistEnabled,
    opensAt: toLocalInput(config.opensAt),
    closesAt: toLocalInput(config.closesAt),
    ownerPosition: config.ownerPosition ?? "",
    contactEmail: config.contactEmail ?? "",
    status: config.status,
  });

  const handleSave = async () => {
    setError(null);
    try {
      await updateCommittee(config.id, toCommitteeInput(value));
      // Scope is a separate action deliberately — attaching a committee to an
      // event plan is a different decision from editing its blurb, and only one
      // of the two can hand out access. Only call it when something changed.
      const scopeChanged =
        value.scope !== config.scope ||
        (value.classroomId || null) !== config.classroomId ||
        (value.eventPlanId || null) !== config.eventPlanId;
      if (scopeChanged) {
        await setCommitteeScope(config.id, {
          scope: value.scope,
          classroomId: value.classroomId || null,
          eventPlanId: value.eventPlanId || null,
        });
      }
      setIsEditing(false);
      addToast("Committee updated.", "success");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the changes.");
    }
  };

  const handleArchive = async () => {
    const ok = await confirm({
      title: `Archive ${config.name}?`,
      description:
        "The join link stops working and the committee disappears from the Committees page. The roster, messages and tasks are kept — you can restore it later.",
      confirmLabel: "Archive",
    });
    if (!ok) return;

    try {
      await archiveCommittee(config.id);
      addToast("Committee archived.", "success");
      router.refresh();
    } catch {
      addToast("Couldn't archive the committee.", "destructive");
    }
  };

  const handleRestore = async () => {
    try {
      await restoreCommittee(config.id);
      addToast("Committee restored.", "success");
      router.refresh();
    } catch {
      addToast("Couldn't restore the committee.", "destructive");
    }
  };

  const handleDelete = async () => {
    // Ask the server what's attached first, so the dialog names what would be
    // lost instead of saying "this cannot be undone".
    let consequences: string[] = [];
    try {
      const summary = await getCommitteeHistoryCounts(config.id);
      consequences = summary.lines;
    } catch {
      // Fall through to the plain confirmation.
    }

    const ok = await confirm({
      title: `Permanently delete ${config.name}?`,
      description:
        consequences.length > 0
          ? "This committee has history attached. Deleting takes it with them."
          : "Nothing is attached to this committee yet, so nothing will be lost.",
      consequences,
      alternative:
        consequences.length > 0
          ? "Archive it instead — that retires the committee and its join link without losing who signed up."
          : undefined,
      confirmLabel: "Delete permanently",
      tone: "destructive",
      ...(consequences.length > 0 && { confirmPhrase: config.name }),
    });
    if (!ok) return;

    try {
      await deleteCommitteePermanently(config.id);
      addToast("Committee deleted.", "success");
      router.push("/admin/committees");
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Couldn't delete the committee.",
        "destructive"
      );
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setIsEditing(true)}>
          Edit committee
        </Button>
        {config.archivedAt ? (
          <Button size="sm" variant="outline" onClick={handleRestore}>
            Restore
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={handleArchive}>
            Archive
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={handleDelete}>
          Delete
        </Button>
      </div>

      <CommitteeForm
        open={isEditing}
        onOpenChange={setIsEditing}
        title={`Edit ${config.name}`}
        value={value}
        onChange={(next) => setValue((prev) => ({ ...prev, ...next }))}
        onSubmit={handleSave}
        submitLabel="Save changes"
        error={error}
        classroomOptions={classroomOptions}
        eventPlanOptions={eventPlanOptions}
      />

      {confirmDialog}
    </>
  );
}
