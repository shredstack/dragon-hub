"use client";

import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GRADE_LEVELS } from "@/lib/constants";
import { formatGradeLevel } from "@/lib/grade-levels";
import { cn } from "@/lib/utils";
import {
  blankStudent,
  MAX_STUDENT_NAME_LENGTH,
  MAX_STUDENTS_PER_MEMBER,
  STUDENT_FIELD_LABEL,
  STUDENT_PRIVACY_NOTE,
  type StudentEntry,
} from "@/lib/students-shared";

/**
 * The one place a parent (or the board, on their behalf) is asked who their
 * children are.
 *
 * There is deliberately a single control for this, for the same reason there is
 * a single `EmojiPicker`: it is asked for on the public volunteer signup form,
 * the committee join form, the two board manual-add dialogs, the member profile
 * and the board's edit dialog — six surfaces, one set of rules about what is
 * required (the name, and only the name) and one privacy sentence. A second
 * hand-rolled version is how the sentence ends up worded differently on the
 * form parents actually read.
 *
 * Every row is a name plus two optional narrowings. Picking a **room** fills
 * the grade from that room and hides the grade select, because a classroom
 * already knows its grade and asking twice invites the two to disagree.
 *
 * Controlled the way the rest of the app's fields are: `value` / `onChange`.
 * Normalization is `normalizeStudents()` in the server action — what happens
 * here is a courtesy, not a gate.
 */

export interface StudentsFieldProps {
  value: StudentEntry[];
  onChange: (next: StudentEntry[]) => void;
  /**
   * This year's rooms, for the optional classroom picker. Omit on a surface
   * that has no classroom list to hand (the committee join form for a
   * school-wide committee) and the picker simply isn't offered.
   */
  classrooms?: { id: string; name: string; gradeLevel: string | null }[];
  /** Unique per instance — two of these on one page would collide on ids. */
  idPrefix?: string;
  label?: string;
  /** Replaces the standard privacy sentence. Rarely what you want. */
  note?: string;
  disabled?: boolean;
  className?: string;
}

export function StudentsField({
  value,
  onChange,
  classrooms,
  idPrefix = "student",
  label = STUDENT_FIELD_LABEL,
  note = STUDENT_PRIVACY_NOTE,
  disabled = false,
  className,
}: StudentsFieldProps) {
  const rows = value.length > 0 ? value : [blankStudent()];
  const atLimit = rows.length >= MAX_STUDENTS_PER_MEMBER;

  function update(index: number, patch: Partial<StudentEntry>) {
    onChange(
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function removeRow(index: number) {
    const next = rows.filter((_, i) => i !== index);
    onChange(next);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <Label htmlFor={`${idPrefix}-0-name`}>{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </div>

      <div className="space-y-3">
        {rows.map((row, i) => {
          const room = row.classroomId
            ? classrooms?.find((c) => c.id === row.classroomId)
            : undefined;
          return (
            <div
              key={i}
              className="rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Input
                    id={`${idPrefix}-${i}-name`}
                    value={row.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Student name"
                    maxLength={MAX_STUDENT_NAME_LENGTH}
                    disabled={disabled}
                    aria-label={`Student ${i + 1} name`}
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    {classrooms && classrooms.length > 0 && (
                      <select
                        value={row.classroomId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value || null;
                          const picked = id
                            ? classrooms.find((c) => c.id === id)
                            : undefined;
                          // The room is the better answer to "what grade", so
                          // taking one clears the hand-picked grade rather than
                          // leaving two possibly-conflicting values on the row.
                          update(i, {
                            classroomId: id,
                            gradeLevel: picked ? null : row.gradeLevel,
                          });
                        }}
                        disabled={disabled}
                        aria-label={`Student ${i + 1} classroom`}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Classroom (optional)</option>
                        {classrooms.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.gradeLevel
                              ? ` — ${formatGradeLevel(c.gradeLevel)}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    )}

                    {room ? (
                      <p className="self-center text-xs text-muted-foreground">
                        {room.gradeLevel
                          ? formatGradeLevel(room.gradeLevel)
                          : "Grade not set on this room"}
                      </p>
                    ) : (
                      <select
                        value={row.gradeLevel ?? ""}
                        onChange={(e) =>
                          update(i, { gradeLevel: e.target.value || null })
                        }
                        disabled={disabled}
                        aria-label={`Student ${i + 1} grade`}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="">Grade (optional)</option>
                        {GRADE_LEVELS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/*
                  A single empty row is the field's resting state, not something
                  to delete — offering a bin next to it would leave a parent
                  with no way to add the first child back.
                */}
                {(rows.length > 1 || !!row.name.trim()) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(i)}
                    disabled={disabled}
                    title="Remove this student"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove student {i + 1}</span>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!atLimit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, blankStudent()])}
          disabled={disabled}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add another student
        </Button>
      )}
    </div>
  );
}
