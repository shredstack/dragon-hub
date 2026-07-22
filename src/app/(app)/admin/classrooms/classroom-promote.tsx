"use client";

import { useState } from "react";
import { promoteClassroomsToYear } from "@/actions/classrooms";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw } from "lucide-react";
import { formatGradeLevel } from "@/lib/grade-levels";

interface PromotableClassroom {
  id: string;
  name: string;
  gradeLevel: string | null;
  teacherEmail: string | null;
  schoolYear: string;
}

interface ClassroomPromoteProps {
  /** Rooms with no row yet in `targetYear`, newest source year first. */
  classrooms: PromotableClassroom[];
  targetYear: string;
}

/**
 * Copy earlier years' classrooms into a school year.
 *
 * Non-destructive by construction: it only ever inserts new rows. The source
 * year keeps its roster, room parents, messages and tasks, which is what makes
 * "Ms. Smith's room, five years running" a history you can actually read.
 */
export function ClassroomPromote({
  classrooms,
  targetYear,
}: ClassroomPromoteProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(classrooms.map((c) => c.id))
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  if (classrooms.length === 0) return null;

  const allSelected = selected.size === classrooms.length;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(classrooms.map((c) => c.id)));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handlePromote = async () => {
    if (selected.size === 0) {
      setMessage({ type: "error", text: "Select at least one classroom." });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await promoteClassroomsToYear(
        Array.from(selected),
        targetYear
      );
      const skipped = result.skipped.length
        ? ` ${result.skipped.length} already existed in ${targetYear}.`
        : "";
      setMessage({
        type: "success",
        text: `Copied ${result.copied} classroom(s) into ${targetYear}.${skipped}`,
      });
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to copy classrooms forward",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="mb-6">
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-dragon-blue-200 bg-dragon-blue-50 px-4 py-2 text-sm font-medium text-dragon-blue-800 hover:bg-dragon-blue-100"
        >
          <RefreshCw className="h-4 w-4" />
          {classrooms.length} classroom{classrooms.length !== 1 && "s"} not yet in{" "}
          {targetYear}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-lg border border-dragon-blue-200 bg-dragon-blue-50/50 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Bring classrooms into {targetYear}</h2>
        <p className="text-sm text-muted-foreground">
          Copies each room&apos;s name, grade, teacher and DLI settings into a
          new {targetYear} classroom. Earlier years keep their own rosters, room
          parents, messages and tasks — nothing is moved or deleted, and each
          new room starts with an empty roster.
        </p>
      </div>

      {message && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-4">
        <button
          onClick={toggleAll}
          className="text-sm text-dragon-blue-600 hover:underline"
        >
          {allSelected ? "Clear all" : "Select all"}
        </button>
      </div>

      <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
        {classrooms.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground">
                {formatGradeLevel(c.gradeLevel)}
                {c.teacherEmail ? ` · ${c.teacherEmail}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
              {c.schoolYear}
              <ArrowRight className="h-3 w-3" />
              {targetYear}
            </span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={handlePromote}
          disabled={loading || selected.size === 0}
          className="rounded-md bg-dragon-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-dragon-blue-600 disabled:opacity-50"
        >
          {loading
            ? "Copying..."
            : `Copy ${selected.size} classroom${selected.size !== 1 ? "s" : ""} into ${targetYear}`}
        </button>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Close
        </button>
      </div>
    </div>
  );
}
