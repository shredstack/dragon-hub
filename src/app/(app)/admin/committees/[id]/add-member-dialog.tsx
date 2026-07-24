"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addCommitteeMemberManually } from "@/actions/committees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPhoneInput, isValidEmail, isValidPhoneNumber } from "@/lib/utils";

export interface ClassroomOption {
  id: string;
  name: string;
  gradeLevel: string | null;
}

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
 * Board or chair entering a name off a paper form — the committee counterpart
 * of the room parent dashboard's manual add, and the only way onto a roster for
 * a parent who never signs into the app.
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
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [classroomId, setClassroomId] = useState(defaultClassroomId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const needsClassroom = classroomOptions.length > 0;

  useEffect(() => {
    if (open) {
      setForm({ name: "", email: "", phone: "", notes: "" });
      setClassroomId(defaultClassroomId ?? "");
      setError(null);
    }
  }, [open, defaultClassroomId]);

  const roomIsFull =
    needsClassroom &&
    classroomId !== "" &&
    perClassroomLimit !== null &&
    (filledByClassroom[classroomId] ?? 0) >= perClassroomLimit;
  const overCapacity = roomIsFull || (!needsClassroom && isFull);

  const handleAdd = async () => {
    setError(null);
    if (!isValidEmail(form.email)) {
      setError("Enter a valid email address, e.g. jane@example.com");
      return;
    }
    if (form.phone && !isValidPhoneNumber(form.phone)) {
      setError("Enter a 10-digit phone number, e.g. (555) 123-4567");
      return;
    }
    if (needsClassroom && !classroomId) {
      setError("Pick the classroom they're covering.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await addCommitteeMemberManually(committeeId, {
        ...form,
        classroomId: needsClassroom ? classroomId : null,
      });
      if (!result.success) {
        setError(result.error ?? "Couldn't add that person.");
        return;
      }
      onOpenChange(false);
      addToast("Added to the committee.", "success");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that person.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add someone by hand</DialogTitle>
          <DialogDescription>
            For a name off a paper sign-up sheet. They&apos;ll get access as soon
            as they sign in with this email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {needsClassroom && (
            <div>
              <Label htmlFor="manual-classroom">Classroom *</Label>
              <Select value={classroomId} onValueChange={setClassroomId}>
                <SelectTrigger id="manual-classroom">
                  <SelectValue placeholder="Select classroom" />
                </SelectTrigger>
                <SelectContent>
                  {classroomOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.gradeLevel ? ` (${c.gradeLevel})` : ""}
                      {perClassroomLimit !== null
                        ? ` — ${filledByClassroom[c.id] ?? 0}/${perClassroomLimit}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="manual-name">Full name *</Label>
            <Input
              id="manual-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Jane Smith"
            />
          </div>
          <div>
            <Label htmlFor="manual-email">Email *</Label>
            <Input
              id="manual-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jane@example.com"
            />
          </div>
          <div>
            <Label htmlFor="manual-phone">Phone</Label>
            <Input
              id="manual-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) =>
                setForm({ ...form, phone: formatPhoneInput(e.target.value) })
              }
              placeholder="(555) 123-4567"
            />
          </div>
          <div>
            <Label htmlFor="manual-notes">Notes</Label>
            <Textarea
              id="manual-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
              isSaving ||
              !form.name.trim() ||
              !form.email.trim() ||
              (needsClassroom && !classroomId)
            }
          >
            {isSaving ? "Adding…" : overCapacity ? "Add anyway" : "Add to committee"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
