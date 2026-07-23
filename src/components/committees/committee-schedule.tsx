"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createScheduleSlot,
  updateScheduleSlot,
  deleteScheduleSlot,
  claimScheduleSlot,
  type CommitteeScheduleSlot,
  type CommitteeSlotStatus,
} from "@/actions/committees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Plus, Calendar } from "lucide-react";

export interface CommitteeScheduleProps {
  committeeId: string;
  slots: CommitteeScheduleSlot[];
  classroomOptions: Array<{ id: string; name: string; gradeLevel: string | null }>;
  /** Chairs and board build the schedule; members read it and may claim a slot. */
  canManage: boolean;
}

interface SlotForm {
  title: string;
  classroomId: string;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
  status: CommitteeSlotStatus;
}

const EMPTY_FORM: SlotForm = {
  title: "",
  classroomId: "",
  startsAt: "",
  endsAt: "",
  location: "",
  notes: "",
  status: "proposed",
};

const STATUS_VARIANT: Record<CommitteeSlotStatus, "secondary" | "success" | "default"> = {
  proposed: "secondary",
  confirmed: "success",
  cancelled: "default",
};

/** ISO timestamp → the value a `datetime-local` input expects. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatWhen(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt);
  const dateStr = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeStr = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (endsAt) {
    const end = new Date(endsAt);
    const endTime = end.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dateStr}, ${timeStr}–${endTime}`;
  }
  return `${dateStr}, ${timeStr}`;
}

/** Groups slots under a "Month Year" heading for a lightweight calendar feel. */
function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function CommitteeSchedule({
  committeeId,
  slots,
  classroomOptions,
  canManage,
}: CommitteeScheduleProps) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const { addToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SlotForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  };

  const openEdit = (slot: CommitteeScheduleSlot) => {
    setEditingId(slot.id);
    setForm({
      title: slot.title,
      classroomId: slot.classroomId ?? "",
      startsAt: toLocalInput(slot.startsAt),
      endsAt: toLocalInput(slot.endsAt),
      location: slot.location ?? "",
      notes: slot.notes ?? "",
      status: slot.status,
    });
    setError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title,
        classroomId: form.classroomId || null,
        startsAt: form.startsAt,
        endsAt: form.endsAt || null,
        location: form.location || null,
        notes: form.notes || null,
        status: form.status,
      };
      const { conflictWarning } = editingId
        ? await updateScheduleSlot(editingId, payload)
        : await createScheduleSlot(committeeId, payload);
      setShowForm(false);
      if (conflictWarning) {
        addToast(`Saved. Heads up: ${conflictWarning}`, "default");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the schedule item.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (slot: CommitteeScheduleSlot) => {
    const ok = await confirm({
      title: `Delete "${slot.title}"?`,
      description: "This removes it from the committee's schedule for everyone.",
      confirmLabel: "Delete",
      tone: "destructive",
    });
    if (!ok) return;
    await deleteScheduleSlot(slot.id);
    router.refresh();
  };

  const handleClaim = async (slot: CommitteeScheduleSlot) => {
    try {
      await claimScheduleSlot(slot.id);
      router.refresh();
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "Couldn't claim this date.",
        "destructive"
      );
    }
  };

  // Group by month for a calendar-ish read.
  const groups: Array<{ month: string; items: CommitteeScheduleSlot[] }> = [];
  for (const slot of slots) {
    const month = monthKey(slot.startsAt);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(slot);
    else groups.push({ month, items: [slot] });
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add date
          </Button>
        </div>
      )}

      {slots.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Calendar className="mx-auto mb-2 h-6 w-6 opacity-50" />
          {canManage
            ? "No dates yet. Add the first one so everyone can see the plan."
            : "No dates have been scheduled yet."}
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.month} className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              {group.month}
            </div>
            {group.items.map((slot) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                canManage={canManage}
                onEdit={openEdit}
                onDelete={handleDelete}
                onClaim={handleClaim}
              />
            ))}
          </div>
        ))
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit date" : "Add a date"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="slot-title">What *</Label>
              <Input
                id="slot-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Room 12 — Meet the Masters"
              />
            </div>

            {classroomOptions.length > 0 && (
              <div>
                <Label htmlFor="slot-classroom">Classroom</Label>
                <select
                  id="slot-classroom"
                  value={form.classroomId}
                  onChange={(e) => setForm({ ...form, classroomId: e.target.value })}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">No specific classroom</option>
                  {classroomOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.gradeLevel ? `${c.gradeLevel} · ${c.name}` : c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="slot-start">Starts *</Label>
                <Input
                  id="slot-start"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="slot-end">Ends</Label>
                <Input
                  id="slot-end"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="slot-location">Where</Label>
              <Input
                id="slot-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Art room"
              />
            </div>

            <div>
              <Label htmlFor="slot-notes">Notes</Label>
              <Textarea
                id="slot-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="slot-status">Status</Label>
              <select
                id="slot-status"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as CommitteeSlotStatus })
                }
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="proposed">Proposed — still coordinating</option>
                <option value="confirmed">Confirmed — locked in</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Confirming a time that overlaps another confirmed date still
                saves — you&apos;ll just get a heads-up.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !form.title.trim() || !form.startsAt}
            >
              {isSaving ? "Saving…" : editingId ? "Save" : "Add date"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}

function SlotRow({
  slot,
  canManage,
  onEdit,
  onDelete,
  onClaim,
}: {
  slot: CommitteeScheduleSlot;
  canManage: boolean;
  onEdit: (slot: CommitteeScheduleSlot) => void;
  onDelete: (slot: CommitteeScheduleSlot) => void;
  onClaim: (slot: CommitteeScheduleSlot) => void;
}) {
  const cancelled = slot.status === "cancelled";
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={
              cancelled
                ? "text-sm font-medium text-muted-foreground line-through"
                : "text-sm font-medium"
            }
          >
            {slot.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatWhen(slot.startsAt, slot.endsAt)}
            {slot.location && ` · ${slot.location}`}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[slot.status]}>{slot.status}</Badge>
            {slot.classroomName && (
              <Badge variant="outline">{slot.classroomName}</Badge>
            )}
            {slot.assigneeName && (
              <span className="text-xs text-muted-foreground">
                {slot.assigneeName}
              </span>
            )}
          </div>
          {slot.notes && (
            <p className="mt-1 text-xs text-muted-foreground">{slot.notes}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {canManage ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => onEdit(slot)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(slot)}>
                Delete
              </Button>
            </>
          ) : (
            !slot.assigneeName &&
            !cancelled && (
              <Button size="sm" variant="outline" onClick={() => onClaim(slot)}>
                Claim
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
