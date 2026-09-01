"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateMemberProfile } from "@/actions/school-membership";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StudentsField } from "@/components/students/students-field";
import type { StudentEntry } from "@/lib/students-shared";
import { formatPhoneInput } from "@/lib/utils";

interface EditMemberProfileDialogProps {
  schoolId: string;
  membershipId: string;
  /** Current name on the account, or null if they never set one. */
  currentName: string | null;
  currentPhone: string | null;
  currentStudents: StudentEntry[];
  /** This year's rooms, for the optional per-student classroom picker. */
  classrooms: { id: string; name: string; gradeLevel: string | null }[];
  /** Shown as the subtitle — it's the only thing identifying a nameless row. */
  email: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Writes name, phone and student names onto another member's profile.
 *
 * Not email: that is the sign-in identity rather than a fact about a person.
 * See `updateMemberProfile` for the full reasoning, and
 * `src/lib/students-shared.ts` for why the student list is board-only.
 */
export function EditMemberProfileDialog({
  schoolId,
  membershipId,
  currentName,
  currentPhone,
  currentStudents,
  classrooms,
  email,
  open,
  onOpenChange,
}: EditMemberProfileDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(currentName ?? "");
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [students, setStudents] = useState<StudentEntry[]>(currentStudents);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopening after a cancel — or after someone else's edit landed — should show
  // what the account says now, not what was typed and abandoned last time.
  useEffect(() => {
    if (open) {
      setName(currentName ?? "");
      setPhone(currentPhone ?? "");
      setStudents(currentStudents);
      setError(null);
    }
  }, [open, currentName, currentPhone, currentStudents]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    setError(null);
    try {
      await updateMemberProfile(schoolId, membershipId, {
        name,
        phone,
        students,
      });
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save this profile"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit member details</DialogTitle>
            <DialogDescription>
              {currentName
                ? `Update what DragonHub knows about ${email}.`
                : `${email} hasn't set a name yet. Add one so they show up as a person in the directory, rosters and exports.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="member-name">Name</Label>
              <Input
                id="member-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First Last"
                maxLength={100}
                autoFocus
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-phone">Phone</Label>
              <Input
                id="member-phone"
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                placeholder="(555) 123-4567"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to clear the number on file.
              </p>
            </div>

            <div className="border-t border-border pt-4">
              <StudentsField
                value={students}
                onChange={setStudents}
                classrooms={classrooms}
                idPrefix="member-student"
                disabled={saving}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              They can change all of this themselves from their profile.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
