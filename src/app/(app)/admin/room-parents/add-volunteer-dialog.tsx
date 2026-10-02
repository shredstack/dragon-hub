"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addVolunteerManually } from "@/actions/volunteer-signups";
import { StudentsField } from "@/components/students/students-field";
import { PersonPicker, usePersonPicker } from "@/components/members/person-picker";
import {
  ClassroomRoleFields,
  EMPTY_CLASSROOM_SIGNUP,
  type ClassroomSignupDraft,
} from "@/components/volunteer/classroom-role-fields";
import type { ClassroomOption } from "@/components/classrooms/classroom-select";
import type { StudentEntry } from "@/lib/students-shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroomId: string | null;
  classrooms: ClassroomOption[];
  partyTypes: string[];
}

export function AddVolunteerDialog({
  open,
  onOpenChange,
  classroomId,
  classrooms,
  partyTypes,
}: Props) {
  const picker = usePersonPicker();
  const resetPicker = picker.reset;
  const [signup, setSignup] = useState<ClassroomSignupDraft>(EMPTY_CLASSROOM_SIGNUP);
  const [students, setStudents] = useState<StudentEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      resetPicker();
      setSignup({ ...EMPTY_CLASSROOM_SIGNUP, classroomId: classroomId || "" });
      setStudents([]);
      setNotes("");
      setError(null);
    }
  }, [open, classroomId, resetPicker]);

  const canSubmit = picker.isComplete && !!signup.classroomId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !picker.validate()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await addVolunteerManually({
        ...picker.contact,
        phone: picker.contact.phone || undefined,
        classroomSignups: [
          {
            classroomId: signup.classroomId,
            role: signup.role,
            partyTypes:
              signup.role === "party_volunteer" ? signup.partyTypes : undefined,
          },
        ],
        students: picker.isNew ? students : [],
        notes: notes || undefined,
      });

      if (result.success) {
        onOpenChange(false);
      } else {
        const errors = result.results
          .filter((r) => !r.success)
          .map((r) => r.error)
          .join(", ");
        setError(result.error || errors || "Failed to add volunteer");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" preventOutsideDismiss>
        <DialogHeader>
          <DialogTitle>Add Volunteer</DialogTitle>
          <DialogDescription>
            Pick someone already at the school, or add a volunteer who signed up
            on paper.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <PersonPicker
            {...picker.pickerProps}
            idPrefix="add-volunteer"
            disabled={isSubmitting}
          />

          <ClassroomRoleFields
            value={signup}
            onChange={setSignup}
            classrooms={classrooms}
            partyTypes={partyTypes}
            idPrefix="add-volunteer"
            disabled={isSubmitting}
          />

          {/* The paper form at Back to School Night has a line for this, so
              the dialog that transcribes it needs one too. An existing member's
              children are already on their profile. */}
          {picker.isNew && (
            <StudentsField
              value={students}
              onChange={setStudents}
              classrooms={classrooms}
              idPrefix="add-volunteer-student"
              disabled={isSubmitting}
            />
          )}

          <div>
            <Label htmlFor="add-volunteer-notes">Notes (optional)</Label>
            <Input
              id="add-volunteer-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Signed up on paper at BTSN"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? "Adding..." : "Add Volunteer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
