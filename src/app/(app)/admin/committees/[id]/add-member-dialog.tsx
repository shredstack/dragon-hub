"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addCommitteeMemberManually } from "@/actions/committees";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StudentsField } from "@/components/students/students-field";
import { PersonPicker, usePersonPicker } from "@/components/members/person-picker";
import {
  ClassroomSelect,
  type ClassroomOption,
} from "@/components/classrooms/classroom-select";
import type { StudentEntry } from "@/lib/students-shared";

export type { ClassroomOption };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  committeeId: string;
  /**
   * Rooms this committee covers. Empty for every scope but "every classroom",
   * where picking one is required — a seat with no room counts against nothing.
   */
  classroomOptions?: ClassroomOption[];
  /** Pre-selected room, when the board clicked Add on a specific one. */
  defaultClassroomId?: string | null;
  /** Seats taken per room, so the dialog can say the room is already full. */
  filledByClassroom?: Record<string, number>;
  perClassroomLimit?: number | null;
  /** True when the committee's own cap is already reached (school-wide). */
  isFull?: boolean;
}

/**
 * Board or chair seating someone on the roster — an existing member picked
 * from a search, or a name off a paper form. The committee counterpart of the
 * room parent dashboard's Add, and the only way onto a roster for a parent who
 * never signs into the app.
 *
 * The server bypasses the cap deliberately, so a full room is a warning here
 * rather than a wall: the board member holding the sign-up sheet knows more
 * than the limit does.
 */
export function AddMemberDialog({
  open,
  onOpenChange,
  committeeId,
  classroomOptions = [],
  defaultClassroomId = null,
  filledByClassroom = {},
  perClassroomLimit = null,
  isFull = false,
}: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const picker = usePersonPicker();
  const resetPicker = picker.reset;
  const [notes, setNotes] = useState("");
  const [classroomId, setClassroomId] = useState(defaultClassroomId ?? "");
  const [students, setStudents] = useState<StudentEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const needsClassroom = classroomOptions.length > 0;

  useEffect(() => {
    if (open) {
      resetPicker();
      setNotes("");
      setClassroomId(defaultClassroomId ?? "");
      setStudents([]);
      setError(null);
    }
  }, [open, defaultClassroomId, resetPicker]);

  const roomIsFull =
    needsClassroom &&
    classroomId !== "" &&
    perClassroomLimit !== null &&
    (filledByClassroom[classroomId] ?? 0) >= perClassroomLimit;
  const overCapacity = roomIsFull || (!needsClassroom && isFull);

  const handleAdd = async () => {
    setError(null);
    if (!picker.validate()) return;
    if (needsClassroom && !classroomId) {
      setError("Pick the classroom they're covering.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await addCommitteeMemberManually(committeeId, {
        ...picker.contact,
        notes,
        students: picker.isNew ? students : [],
        classroomId: needsClassroom ? classroomId : null,
      });
      if (!result.success) {
        setError(result.error ?? "Couldn't add that person.");
        return;
      }
      onOpenChange(false);
      addToast(
        result.alreadyMember
          ? "They were already on the committee."
          : "Added to the committee.",
        "success"
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that person.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent preventOutsideDismiss>
        <DialogHeader>
          <DialogTitle>Add to committee</DialogTitle>
          <DialogDescription>
            Pick someone already at the school, or add a name off a paper
            sign-up sheet. They&apos;ll get access as soon as they sign in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PersonPicker
            {...picker.pickerProps}
            idPrefix="manual"
            disabled={isSaving}
          />

          {needsClassroom && (
            <div>
              <Label htmlFor="manual-classroom">Classroom *</Label>
              <ClassroomSelect
                id="manual-classroom"
                value={classroomId}
                onValueChange={setClassroomId}
                classrooms={classroomOptions}
                disabled={isSaving}
                detail={(c) =>
                  perClassroomLimit !== null
                    ? ` — ${filledByClassroom[c.id] ?? 0}/${perClassroomLimit}`
                    : ""
                }
              />
            </div>
          )}

          {/*
            A chair can open this dialog and cannot read the answer back — only
            the PTA board sees student names. That asymmetry is fine and is what
            the field's own note says: whoever is holding the paper form is the
            data-entry point here, not the audience. An existing member's
            children are already on their profile, so it's asked only of
            someone new.
          */}
          {picker.isNew && (
            <StudentsField
              value={students}
              onChange={setStudents}
              classrooms={classroomOptions}
              idPrefix="manual-student"
              disabled={isSaving}
            />
          )}

          <div>
            <Label htmlFor="manual-notes">Notes</Label>
            <Textarea
              id="manual-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Signed up on paper at Back to School Night"
            />
          </div>
          {overCapacity && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {roomIsFull
                ? "This classroom already has everyone it needs. Adding someone here goes past the limit, and the extra seat stays until you remove someone."
                : "This committee is at its limit. Adding someone here goes past it."}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={
              isSaving || !picker.isComplete || (needsClassroom && !classroomId)
            }
          >
            {isSaving ? "Adding…" : overCapacity ? "Add anyway" : "Add to committee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
