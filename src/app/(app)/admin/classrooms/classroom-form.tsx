"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createClassroom, updateClassroom } from "@/actions/classrooms";
import { GRADE_LEVELS } from "@/lib/constants";
import {
  invalidTeacherEmails,
  type ClassroomTeacher,
} from "@/lib/classroom-teachers-shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

interface DliGroup {
  id: string;
  name: string;
  color: string | null;
}

interface ClassroomFormProps {
  classroom?: {
    id: string;
    name: string;
    gradeLevel: string | null;
    teachers: ClassroomTeacher[];
    schoolYear: string;
    excludeFromSignup: boolean | null;
    isDli: boolean | null;
    dliGroupId: string | null;
  };
  dliGroups?: DliGroup[];
  schoolYearOptions: string[];
  currentSchoolYear: string;
}

/** A row of the teacher list while it's being edited. */
interface TeacherRow {
  /** Stable only for the life of the dialog — React keys, not database ids. */
  key: string;
  name: string;
  email: string;
}

let rowCounter = 0;
const newRow = (name = "", email = ""): TeacherRow => ({
  key: `t${rowCounter++}`,
  name,
  email,
});

/** The saved list, or one empty row so the fields are always visible. */
function toRows(teachers: ClassroomTeacher[] | undefined): TeacherRow[] {
  if (!teachers?.length) return [newRow()];
  return teachers.map((t) => newRow(t.name ?? "", t.email));
}

export function ClassroomForm({
  classroom,
  dliGroups = [],
  schoolYearOptions,
  currentSchoolYear,
}: ClassroomFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDli, setIsDli] = useState(classroom?.isDli ?? false);
  const [excludeFromSignup, setExcludeFromSignup] = useState(
    classroom?.excludeFromSignup ?? false
  );
  const [teacherRows, setTeacherRows] = useState<TeacherRow[]>(() =>
    toRows(classroom?.teachers)
  );

  const isEdit = !!classroom;

  // Reset state when dialog opens with new data
  useEffect(() => {
    if (open) {
      setIsDli(classroom?.isDli ?? false);
      setExcludeFromSignup(classroom?.excludeFromSignup ?? false);
      setTeacherRows(toRows(classroom?.teachers));
      setError(null);
    }
    // `classroom.teachers` is a fresh array on every render of the parent
    // server component, so it can't be a dependency without looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classroom?.isDli, classroom?.excludeFromSignup]);

  function updateTeacher(key: string, patch: Partial<TeacherRow>) {
    setTeacherRows((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  function removeTeacher(key: string) {
    setTeacherRows((rows) => {
      const next = rows.filter((row) => row.key !== key);
      return next.length > 0 ? next : [newRow()];
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // Blank rows are how an empty repeatable field looks, not an error.
    const teachers = teacherRows
      .filter((row) => row.email.trim())
      .map((row) => ({ name: row.name, email: row.email }));

    const invalid = invalidTeacherEmails(teachers);
    if (invalid.length > 0) {
      setError(`Not a valid email address: ${invalid.join(", ")}`);
      return;
    }

    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const gradeLevel = formData.get("gradeLevel") as string;
    const schoolYear = formData.get("schoolYear") as string;
    const dliGroupId = formData.get("dliGroupId") as string;

    try {
      if (isEdit) {
        await updateClassroom(classroom.id, {
          name,
          gradeLevel: gradeLevel || undefined,
          teachers,
          excludeFromSignup,
          isDli,
          dliGroupId: isDli ? dliGroupId || null : null,
        });
      } else {
        await createClassroom({
          name,
          gradeLevel: gradeLevel || undefined,
          teachers,
          schoolYear,
          excludeFromSignup,
          isDli,
          dliGroupId: isDli ? dliGroupId || undefined : undefined,
        });
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error("Failed to save classroom:", err);
      setError(
        err instanceof Error ? err.message : "Failed to save classroom."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={isEdit ? "sm" : "default"}>
          {isEdit ? "Edit" : "Create Classroom"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Classroom" : "Create Classroom"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={classroom?.name ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="gradeLevel" className="mb-1 block text-sm font-medium">
              Grade Level
            </label>
            <select
              id="gradeLevel"
              name="gradeLevel"
              defaultValue={classroom?.gradeLevel ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select grade level</option>
              {GRADE_LEVELS.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium">Teachers</span>
            <p className="mb-2 text-xs text-muted-foreground">
              Add a row for each teacher — a room taught half a day by one
              teacher and half by another lists both. Everyone here reaches this
              classroom&apos;s message board and roster when they sign in with
              the address you enter.
            </p>
            <div className="space-y-2">
              {teacherRows.map((row, index) => (
                <div key={row.key} className="flex items-start gap-2">
                  <div className="grid flex-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      aria-label={`Teacher ${index + 1} name`}
                      placeholder="Name (e.g. Mrs. Patterson)"
                      value={row.name}
                      onChange={(e) =>
                        updateTeacher(row.key, { name: e.target.value })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="email"
                      aria-label={`Teacher ${index + 1} email`}
                      placeholder="Email"
                      value={row.email}
                      onChange={(e) =>
                        updateTeacher(row.key, { email: e.target.value })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTeacher(row.key)}
                    aria-label={`Remove teacher ${index + 1}`}
                    className="mt-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setTeacherRows((rows) => [...rows, newRow()])}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Plus className="h-4 w-4" />
              Add another teacher
            </button>
          </div>
          <div>
            <label htmlFor="schoolYear" className="mb-1 block text-sm font-medium">
              School Year
            </label>
            <select
              id="schoolYear"
              name="schoolYear"
              required
              defaultValue={classroom?.schoolYear ?? currentSchoolYear}
              disabled={isEdit}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {schoolYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            {isEdit && (
              <p className="mt-1 text-xs text-muted-foreground">
                A classroom belongs to one school year for good — that&apos;s what
                keeps its roster, room parents and messages attached to the year
                they happened in. To run this room in a later year, use
                &ldquo;Bring classrooms into {currentSchoolYear}&rdquo; on Manage
                Classrooms, which copies it forward.
              </p>
            )}
          </div>

          {/* Internal groups (e.g. PTA Board) that aren't real classrooms */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-start gap-2">
              <input
                id="excludeFromSignup"
                type="checkbox"
                checked={excludeFromSignup}
                onChange={(e) => setExcludeFromSignup(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <div>
                <label htmlFor="excludeFromSignup" className="text-sm font-medium">
                  Hide from the public volunteer sign-up page
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  For internal groups like the PTA Board that use classroom
                  message boards but aren&apos;t something parents sign up for.
                </p>
              </div>
            </div>
          </div>

          {/* DLI Section */}
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <input
                id="isDli"
                type="checkbox"
                checked={isDli}
                onChange={(e) => setIsDli(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="isDli" className="text-sm font-medium">
                This is a DLI (Dual Language Immersion) classroom
              </label>
            </div>

            {isDli && (
              <div>
                <label htmlFor="dliGroupId" className="mb-1 block text-sm font-medium">
                  DLI Group
                </label>
                {dliGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No DLI groups configured.{" "}
                    <a href="/admin/dli-groups" className="text-primary underline">
                      Create one first
                    </a>
                  </p>
                ) : (
                  <select
                    id="dliGroupId"
                    name="dliGroupId"
                    defaultValue={classroom?.dliGroupId ?? ""}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select a DLI group</option>
                    {dliGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isEdit ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
