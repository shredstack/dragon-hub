"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClassroom, updateClassroom } from "@/actions/classrooms";
import { CURRENT_SCHOOL_YEAR, SCHOOL_YEAR_OPTIONS, GRADE_LEVELS } from "@/lib/constants";
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
    teacherEmail: string | null;
    schoolYear: string;
    isDli: boolean | null;
    dliGroupId: string | null;
  };
  dliGroups?: DliGroup[];
}

export function ClassroomForm({ classroom, dliGroups = [] }: ClassroomFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isDli, setIsDli] = useState(classroom?.isDli ?? false);

  const isEdit = !!classroom;

  // Reset isDli state when dialog opens with new data
  useEffect(() => {
    if (open) {
      setIsDli(classroom?.isDli ?? false);
    }
  }, [open, classroom?.isDli]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const gradeLevel = formData.get("gradeLevel") as string;
    const teacherEmail = formData.get("teacherEmail") as string;
    const schoolYear = formData.get("schoolYear") as string;
    const dliGroupId = formData.get("dliGroupId") as string;

    try {
      if (isEdit) {
        await updateClassroom(classroom.id, {
          name,
          gradeLevel: gradeLevel || undefined,
          teacherEmail: teacherEmail || undefined,
          isDli,
          dliGroupId: isDli ? dliGroupId || null : null,
        });
      } else {
        await createClassroom({
          name,
          gradeLevel: gradeLevel || undefined,
          teacherEmail: teacherEmail || undefined,
          schoolYear,
          isDli,
          dliGroupId: isDli ? dliGroupId || undefined : undefined,
        });
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Failed to save classroom:", error);
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
            <label htmlFor="teacherEmail" className="mb-1 block text-sm font-medium">
              Teacher Email
            </label>
            <input
              id="teacherEmail"
              name="teacherEmail"
              type="email"
              defaultValue={classroom?.teacherEmail ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="schoolYear" className="mb-1 block text-sm font-medium">
              School Year
            </label>
            <select
              id="schoolYear"
              name="schoolYear"
              required
              defaultValue={classroom?.schoolYear ?? CURRENT_SCHOOL_YEAR}
              disabled={isEdit}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {SCHOOL_YEAR_OPTIONS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
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
