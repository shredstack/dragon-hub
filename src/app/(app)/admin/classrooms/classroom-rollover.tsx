"use client";

import { useState } from "react";
import { rolloverClassroomsToNewYear } from "@/actions/classrooms";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

interface Classroom {
  id: string;
  name: string;
  gradeLevel: string | null;
  schoolYear: string;
  teacherEmail: string | null;
  memberCount: number;
}

interface ClassroomRolloverProps {
  classrooms: Classroom[];
  currentSchoolYear: string;
  nextSchoolYear: string;
}

export function ClassroomRollover({
  classrooms,
  currentSchoolYear,
  nextSchoolYear,
}: ClassroomRolloverProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedClassrooms, setSelectedClassrooms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filter to show only classrooms from current year that haven't been rolled over
  const eligibleClassrooms = classrooms.filter((c) => c.schoolYear === currentSchoolYear);

  const handleSelectAll = () => {
    if (selectedClassrooms.size === eligibleClassrooms.length) {
      setSelectedClassrooms(new Set());
    } else {
      setSelectedClassrooms(new Set(eligibleClassrooms.map((c) => c.id)));
    }
  };

  const handleToggleClassroom = (id: string) => {
    const newSet = new Set(selectedClassrooms);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedClassrooms(newSet);
  };

  const handleRollover = async () => {
    if (selectedClassrooms.size === 0) {
      setMessage({ type: "error", text: "Please select classrooms to rollover" });
      return;
    }

    const confirmed = window.confirm(
      `This will rollover ${selectedClassrooms.size} classroom(s) to ${nextSchoolYear}:\n\n` +
      `- Update school year to ${nextSchoolYear}\n` +
      `- Remove all members except teachers\n` +
      `- Clear volunteer signups\n` +
      `- Messages and tasks will be preserved\n\n` +
      `Continue?`
    );

    if (!confirmed) return;

    setLoading(true);
    setMessage(null);

    try {
      const result = await rolloverClassroomsToNewYear(
        Array.from(selectedClassrooms),
        nextSchoolYear
      );

      if (result.errors.length > 0) {
        setMessage({
          type: "error",
          text: `Rolled over ${result.rolledOver} classroom(s), but encountered errors:\n${result.errors.join("\n")}`,
        });
      } else {
        setMessage({
          type: "success",
          text: `Successfully rolled over ${result.rolledOver} classroom(s) to ${nextSchoolYear}`,
        });
      }

      setSelectedClassrooms(new Set());
      router.refresh();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to rollover classrooms",
      });
    } finally {
      setLoading(false);
    }
  };

  if (eligibleClassrooms.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      {/* Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-800 hover:bg-yellow-100"
        >
          <RefreshCw className="h-4 w-4" />
          Rollover Classrooms to {nextSchoolYear}
        </button>
      )}

      {/* Expanded Rollover Panel */}
      {isOpen && (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Rollover Classrooms to New Year</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Prepare classrooms for {nextSchoolYear}. This will update the school year and clear
                non-teacher members. Messages and tasks are preserved as history.
              </p>
            </div>
            <button
              onClick={() => {
                setIsOpen(false);
                setMessage(null);
                setSelectedClassrooms(new Set());
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>

          {message && (
            <div
              className={`mt-4 rounded-lg p-4 ${
                message.type === "success"
                  ? "border border-green-200 bg-green-50 text-green-800"
                  : "border border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <p className="whitespace-pre-line">{message.text}</p>
            </div>
          )}

          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="select-all-rollover"
                  checked={
                    selectedClassrooms.size === eligibleClassrooms.length &&
                    eligibleClassrooms.length > 0
                  }
                  onChange={handleSelectAll}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="select-all-rollover" className="text-sm font-medium">
                  Select All ({eligibleClassrooms.length} classroom{eligibleClassrooms.length !== 1 && "s"})
                </label>
              </div>
              <button
                onClick={handleRollover}
                disabled={loading || selectedClassrooms.size === 0}
                className="rounded-md bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
              >
                {loading
                  ? "Rolling over..."
                  : `Rollover Selected (${selectedClassrooms.size})`}
              </button>
            </div>

            {/* Mobile card view */}
            <div className="space-y-2 md:hidden">
              {eligibleClassrooms.map((classroom) => (
                <label
                  key={classroom.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    selectedClassrooms.has(classroom.id)
                      ? "border-yellow-400 bg-yellow-50"
                      : "border-border"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedClassrooms.has(classroom.id)}
                    onChange={() => handleToggleClassroom(classroom.id)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  />
                  <div className="flex-1">
                    <p className="font-medium">{classroom.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {classroom.gradeLevel ?? "No grade"} &bull;{" "}
                      {classroom.memberCount} member{classroom.memberCount !== 1 && "s"}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {/* Desktop table view */}
            <div className="hidden max-h-72 overflow-y-auto rounded-lg border border-border md:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="w-10 p-3"></th>
                    <th className="p-3 text-left font-medium">Classroom</th>
                    <th className="p-3 text-left font-medium">Grade</th>
                    <th className="p-3 text-left font-medium">Teacher</th>
                    <th className="p-3 text-left font-medium">Members</th>
                    <th className="p-3 text-left font-medium">Current Year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {eligibleClassrooms.map((classroom) => (
                    <tr
                      key={classroom.id}
                      className={
                        selectedClassrooms.has(classroom.id) ? "bg-yellow-50" : ""
                      }
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedClassrooms.has(classroom.id)}
                          onChange={() => handleToggleClassroom(classroom.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </td>
                      <td className="p-3 font-medium">{classroom.name}</td>
                      <td className="p-3">{classroom.gradeLevel ?? "-"}</td>
                      <td className="p-3 text-muted-foreground">
                        {classroom.teacherEmail ?? "-"}
                      </td>
                      <td className="p-3">{classroom.memberCount}</td>
                      <td className="p-3">{classroom.schoolYear}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
