"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { addVolunteerManually } from "@/actions/volunteer-signups";
import { addCommitteeMemberManually } from "@/actions/committees";
import { updateMemberRole } from "@/actions/school-membership";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { useToast } from "@/components/ui/toast";
import { PersonPicker, usePersonPicker } from "@/components/members/person-picker";
import {
  ClassroomRoleFields,
  EMPTY_CLASSROOM_SIGNUP,
  type ClassroomSignupDraft,
} from "@/components/volunteer/classroom-role-fields";
import {
  ClassroomSelect,
  type ClassroomOption,
} from "@/components/classrooms/classroom-select";
import type { BoardPosition } from "@/lib/board-positions-shared";
import type { PersonOption } from "@/lib/person-option";

export interface AssignableCommittee {
  id: string;
  name: string;
  /** "all_classrooms" (Meet the Masters) needs a room per seat. */
  scope: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The directory row this was opened from; null for "Add person". */
  initialPerson: PersonOption | null;
  schoolId: string;
  currentUserId: string;
  classrooms: ClassroomOption[];
  partyTypes: string[];
  committees: AssignableCommittee[];
  positions: BoardPosition[];
}

type ClassroomRow = ClassroomSignupDraft & { key: number };
type CommitteeRow = { key: number; committeeId: string; classroomId: string };

let nextKey = 0;
const newKey = () => ++nextKey;

/**
 * Everything one person is taking on, entered once.
 *
 * A parent who says "I'll be room parent for Room 12 *and* do Meet the Masters
 * there" used to mean a trip to the room parent dashboard and then another to
 * the committee page, typing her details into each. This dialog is the same
 * three operations in one sitting — and deliberately *only* those three: it
 * calls the very actions the room parent dashboard, the committee roster and
 * the directory's role menu already call, so a seat made here is exactly the
 * seat made there (same welcome email, same capacity override, same access).
 */
export function AssignRolesDialog({
  open,
  onOpenChange,
  initialPerson,
  schoolId,
  currentUserId,
  classrooms,
  partyTypes,
  committees,
  positions,
}: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const picker = usePersonPicker();
  const resetPicker = picker.reset;
  const [classroomRows, setClassroomRows] = useState<ClassroomRow[]>([]);
  const [committeeRows, setCommitteeRows] = useState<CommitteeRow[]>([]);
  const [makeBoard, setMakeBoard] = useState(false);
  const [boardPosition, setBoardPosition] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      resetPicker(initialPerson);
      setClassroomRows([]);
      setCommitteeRows([]);
      setMakeBoard(false);
      setBoardPosition("");
      setErrors([]);
    }
  }, [open, initialPerson, resetPicker]);

  const person = picker.person;
  const committeeById = new Map(committees.map((c) => [c.id, c]));
  const needsRoom = (committeeId: string) =>
    committeeById.get(committeeId)?.scope === "all_classrooms";

  // The board seat edits a school membership, so only someone who has one can
  // be given it here — and only from plain member, so this can't quietly
  // demote a school admin or reshuffle a sitting board member's position.
  const canGrantBoard =
    !!person?.membershipId &&
    person.userId !== currentUserId &&
    person.role === "member";

  const rowsIncomplete =
    classroomRows.some((r) => !r.classroomId) ||
    committeeRows.some(
      (r) => !r.committeeId || (needsRoom(r.committeeId) && !r.classroomId)
    );
  const nothingToDo =
    classroomRows.length === 0 &&
    committeeRows.length === 0 &&
    !(canGrantBoard && makeBoard);
  const canSubmit = picker.isComplete && !rowsIncomplete && !nothingToDo;

  const addClassroomRow = () =>
    setClassroomRows((rows) => [...rows, { ...EMPTY_CLASSROOM_SIGNUP, key: newKey() }]);

  const addCommitteeRow = () =>
    setCommitteeRows((rows) => [
      ...rows,
      { key: newKey(), committeeId: "", classroomId: "" },
    ]);

  const updateCommitteeRow = (key: number, patch: Partial<CommitteeRow>) =>
    setCommitteeRows((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Room parent for Room 12 and MTM for Room 12 is the usual pairing, so
        // a per-classroom committee starts on the room already chosen above.
        if (patch.committeeId !== undefined) {
          next.classroomId = needsRoom(patch.committeeId)
            ? r.classroomId || classroomRows[0]?.classroomId || ""
            : "";
        }
        return next;
      })
    );

  const handleSubmit = async () => {
    if (!canSubmit || !picker.validate()) return;
    setIsSaving(true);
    setErrors([]);

    const failures: string[] = [];
    let done = 0;
    const contact = {
      ...picker.contact,
      phone: picker.contact.phone || undefined,
    };

    try {
      // One call for every room, so they get one welcome email listing all
      // of them rather than one per room.
      if (classroomRows.length > 0) {
        const result = await addVolunteerManually({
          ...contact,
          classroomSignups: classroomRows.map((r) => ({
            classroomId: r.classroomId,
            role: r.role,
            partyTypes: r.role === "party_volunteer" ? r.partyTypes : undefined,
          })),
        });
        if (result.error) {
          failures.push(result.error);
        } else {
          const failed = new Set<number>();
          result.results.forEach((r, i) => {
            if (r.success) done++;
            else {
              failed.add(classroomRows[i].key);
              failures.push(`${r.classroomName}: ${r.error ?? "couldn't add"}`);
            }
          });
          // Keep only what still needs attention, so retrying can't double up.
          setClassroomRows((rows) => rows.filter((r) => failed.has(r.key)));
        }
      }

      const failedCommittees = new Set<number>();
      for (const row of committeeRows) {
        const name = committeeById.get(row.committeeId)?.name ?? "Committee";
        try {
          const result = await addCommitteeMemberManually(row.committeeId, {
            ...contact,
            classroomId: needsRoom(row.committeeId) ? row.classroomId : null,
          });
          if (!result.success) {
            failedCommittees.add(row.key);
            failures.push(`${name}: ${result.error ?? "couldn't add"}`);
          } else if (result.alreadyMember) {
            failures.push(`${name}: already on it`);
          } else {
            done++;
          }
        } catch (err) {
          failedCommittees.add(row.key);
          failures.push(`${name}: ${err instanceof Error ? err.message : "couldn't add"}`);
        }
      }
      setCommitteeRows((rows) => rows.filter((r) => failedCommittees.has(r.key)));

      if (canGrantBoard && makeBoard && person?.membershipId) {
        try {
          await updateMemberRole(
            schoolId,
            person.membershipId,
            "pta_board",
            boardPosition || null
          );
          done++;
          setMakeBoard(false);
        } catch (err) {
          failures.push(
            `PTA board: ${err instanceof Error ? err.message : "couldn't update role"}`
          );
        }
      }
    } catch (err) {
      failures.push(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSaving(false);
    }

    if (done > 0) router.refresh();
    if (failures.length === 0) {
      onOpenChange(false);
      addToast(
        `${picker.contact.name} — ${done} role${done === 1 ? "" : "s"} added.`,
        "success"
      );
    } else {
      setErrors(failures);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" preventOutsideDismiss>
        <DialogHeader>
          <DialogTitle>{initialPerson ? "Assign roles" : "Add person"}</DialogTitle>
          <DialogDescription>
            Seat someone in one or more rooms and committees at once. Rooms and
            committees go past their limits if you add someone here, the same as
            adding them from those pages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <PersonPicker
            {...picker.pickerProps}
            idPrefix="assign"
            disabled={isSaving}
            locked={!!initialPerson}
          />

          {classroomRows.map((row, i) => (
            <AssignmentCard
              key={row.key}
              title={`Classroom role${classroomRows.length > 1 ? ` ${i + 1}` : ""}`}
              onRemove={() =>
                setClassroomRows((rows) => rows.filter((r) => r.key !== row.key))
              }
              disabled={isSaving}
            >
              <ClassroomRoleFields
                value={row}
                onChange={(next) =>
                  setClassroomRows((rows) =>
                    rows.map((r) => (r.key === row.key ? { ...next, key: r.key } : r))
                  )
                }
                classrooms={classrooms}
                partyTypes={partyTypes}
                idPrefix={`assign-room-${row.key}`}
                disabled={isSaving}
              />
            </AssignmentCard>
          ))}

          {committeeRows.map((row, i) => (
            <AssignmentCard
              key={row.key}
              title={`Committee${committeeRows.length > 1 ? ` ${i + 1}` : ""}`}
              onRemove={() =>
                setCommitteeRows((rows) => rows.filter((r) => r.key !== row.key))
              }
              disabled={isSaving}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`assign-committee-${row.key}`}>Committee *</Label>
                  <Select
                    value={row.committeeId}
                    onValueChange={(committeeId) =>
                      updateCommitteeRow(row.key, { committeeId })
                    }
                    disabled={isSaving}
                  >
                    <SelectTrigger id={`assign-committee-${row.key}`}>
                      <SelectValue placeholder="Select committee" />
                    </SelectTrigger>
                    <SelectContent>
                      {committees.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.status !== "active" ? ` (${c.status})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {needsRoom(row.committeeId) && (
                  <div>
                    <Label htmlFor={`assign-committee-room-${row.key}`}>
                      Classroom they cover *
                    </Label>
                    <ClassroomSelect
                      id={`assign-committee-room-${row.key}`}
                      value={row.classroomId}
                      onValueChange={(classroomId) =>
                        updateCommitteeRow(row.key, { classroomId })
                      }
                      classrooms={classrooms}
                      disabled={isSaving}
                    />
                  </div>
                )}
              </div>
            </AssignmentCard>
          ))}

          {canGrantBoard && (
            <div className="rounded-lg border border-border p-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={makeBoard}
                  onChange={(e) => setMakeBoard(e.target.checked)}
                  disabled={isSaving}
                />
                Make them a PTA board member
              </label>
              {makeBoard && (
                <div className="mt-3">
                  <Label htmlFor="assign-board-position">Board position</Label>
                  <Select
                    value={boardPosition || "none"}
                    onValueChange={(v) => setBoardPosition(v === "none" ? "" : v)}
                    disabled={isSaving}
                  >
                    <SelectTrigger id="assign-board-position">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No position</SelectItem>
                      {positions.map((p) => (
                        <SelectItem key={p.slug} value={p.slug}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Board members can manage everything in the PTA Board Hub.
                  </p>
                </div>
              )}
            </div>
          )}
          {(picker.isNew || person?.pending) && (
            <p className="text-xs text-muted-foreground">
              A PTA board seat can be given once they&apos;ve signed in — use the
              role menu on their row in the directory.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addClassroomRow}
              disabled={isSaving || classrooms.length === 0}
            >
              <Plus className="h-4 w-4" />
              Room parent / party volunteer
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCommitteeRow}
              disabled={isSaving || committees.length === 0}
            >
              <Plus className="h-4 w-4" />
              Committee
            </Button>
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-medium">
                Some of these didn&apos;t go through. Anything that worked has
                been removed from the list above.
              </p>
              <ul className="mt-1 list-disc pl-5">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {errors.length > 0 ? "Close" : "Cancel"}
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || !canSubmit}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentCard({
  title,
  onRemove,
  disabled,
  children,
}: {
  title: string;
  onRemove: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onRemove}
          disabled={disabled}
          title="Remove"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Remove</span>
        </Button>
      </div>
      {children}
    </div>
  );
}
