"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClassroom, updateClassroom } from "@/actions/classrooms";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
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

interface ClassroomFormProps {
  classroom?: {
    id: string;
    name: string;
    gradeLevel: string | null;
    teacherEmail: string | null;
    schoolYear: string;
  };
}

export function ClassroomForm({ classroom }: ClassroomFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isEdit = !!classroom;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const gradeLevel = formData.get("gradeLevel") as string;
    const teacherEmail = formData.get("teacherEmail") as string;
    const schoolYear = formData.get("schoolYear") as string;

    try {
      if (isEdit) {
        await updateClassroom(classroom.id, {
          name,
          gradeLevel: gradeLevel || undefined,
          teacherEmail: teacherEmail || undefined,
        });
      } else {
        await createClassroom({
          name,
          gradeLevel: gradeLevel || undefined,
          teacherEmail: teacherEmail || undefined,
          schoolYear,
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
            <input
              id="gradeLevel"
              name="gradeLevel"
              type="text"
              defaultValue={classroom?.gradeLevel ?? ""}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
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
            <input
              id="schoolYear"
              name="schoolYear"
              type="text"
              required
              defaultValue={classroom?.schoolYear ?? CURRENT_SCHOOL_YEAR}
              disabled={isEdit}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
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
