"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Copy, Download, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { exportMembers } from "@/actions/member-export";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  DEFAULT_EXPORT_COLUMNS,
  MEMBER_EXPORT_COLUMNS,
  MEMBER_EXPORT_PRESETS,
  dependsOnClassrooms,
  type MemberExportColumnKey,
  type MemberExportFilters,
  type MemberExportOptions,
  type MemberExportResult,
} from "@/lib/member-export";
import {
  PTA_BOARD_POSITIONS,
  SCHOOL_ROLES,
  USER_ROLES,
} from "@/lib/constants";
import type { PtaBoardPosition, SchoolRole, UserRole } from "@/types";

interface ExportMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: MemberExportOptions;
}

/**
 * Why an export came back empty. A classroom-based filter cannot match anyone
 * when the school year has no classrooms yet, and saying so beats "no matches"
 * — the members are there, it's the classroom rows that haven't rolled over.
 */
function emptyReason(
  result: MemberExportResult,
  filters: MemberExportFilters
): string {
  if (!result.hasClassroomsForYear && dependsOnClassrooms(filters)) {
    return `No classrooms exist for ${result.schoolYear} yet, so no one has a classroom role for this year. Promote classrooms to ${result.schoolYear} first, or export by school role instead.`;
  }
  return "No members match those filters.";
}

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-input accent-dragon-blue-500"
      />
      <span>{label}</span>
    </label>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function ExportMembersDialog({
  open,
  onOpenChange,
  options,
}: ExportMembersDialogProps) {
  const { gradeLevels, schoolYear, hasClassroomsForYear } = options;
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [presetId, setPresetId] = useState("all");
  const [schoolRoles, setSchoolRoles] = useState<SchoolRole[]>([]);
  const [boardPositions, setBoardPositions] = useState<PtaBoardPosition[]>([]);
  const [classroomRoles, setClassroomRoles] = useState<UserRole[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [rowPerClassroom, setRowPerClassroom] = useState(false);
  const [columns, setColumns] = useState<MemberExportColumnKey[]>(
    DEFAULT_EXPORT_COLUMNS
  );

  const isCustom = presetId === "custom";
  const preset = MEMBER_EXPORT_PRESETS.find((p) => p.id === presetId);

  function selectPreset(id: string) {
    setPresetId(id);
    const next = MEMBER_EXPORT_PRESETS.find((p) => p.id === id);
    if (!next || id === "custom") return;
    setSchoolRoles(next.filters.schoolRoles ?? []);
    setBoardPositions(next.filters.boardPositions ?? []);
    setClassroomRoles(next.filters.classroomRoles ?? []);
    setGrades([]);
    setRowPerClassroom(next.filters.rowPerClassroom ?? false);
  }

  function buildFilters(): MemberExportFilters {
    return {
      schoolRoles,
      boardPositions,
      classroomRoles,
      gradeLevels: grades,
      rowPerClassroom,
      columns,
    };
  }

  function handleDownload() {
    const filters = buildFilters();
    const stamp = new Date().toISOString().slice(0, 10);
    startTransition(async () => {
      try {
        const result = await exportMembers(filters);
        if (result.rows.length === 0) {
          addToast(emptyReason(result, filters), "destructive");
          return;
        }
        const csv = toCsv(result.columns, result.rows);
        downloadCsv(`${presetId}-members-${stamp}.csv`, csv);
        addToast(
          `Exported ${result.memberCount} member${
            result.memberCount === 1 ? "" : "s"
          }.`,
          "success"
        );
        onOpenChange(false);
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Export failed.",
          "destructive"
        );
      }
    });
  }

  function handleCopyEmails() {
    const filters = buildFilters();
    startTransition(async () => {
      try {
        const result = await exportMembers(filters);
        if (result.emails.length === 0) {
          addToast(emptyReason(result, filters), "destructive");
          return;
        }
        await navigator.clipboard.writeText(result.emails.join(", "));
        addToast(
          `Copied ${result.emails.length} email address${
            result.emails.length === 1 ? "" : "es"
          }.`,
          "success"
        );
      } catch (error) {
        addToast(
          error instanceof Error ? error.message : "Copy failed.",
          "destructive"
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export members</DialogTitle>
          <DialogDescription>
            Download a CSV for your email tool, or copy the addresses straight to
            your clipboard.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {!hasClassroomsForYear && (
            <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                No classrooms exist for{" "}
                <span className="font-medium">{schoolYear}</span> yet, so the
                room parent, teacher, and volunteer exports will come back
                empty. Promote classrooms to {schoolYear} first — exports by
                school role still work.
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Who to export</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MEMBER_EXPORT_PRESETS.map((p) => (
                <label
                  key={p.id}
                  className={`cursor-pointer rounded-lg border p-3 text-left ${
                    presetId === p.id
                      ? "border-dragon-blue-500 bg-muted"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="export-preset"
                      checked={presetId === p.id}
                      onChange={() => selectPreset(p.id)}
                      className="h-4 w-4 accent-dragon-blue-500"
                    />
                    <span className="text-sm font-medium">{p.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.description}
                  </p>
                </label>
              ))}
            </div>
          </div>

          {isCustom && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">School role</p>
                <div className="space-y-1.5">
                  {(
                    Object.entries(SCHOOL_ROLES) as [SchoolRole, string][]
                  ).map(([value, label]) => (
                    <CheckboxRow
                      key={value}
                      label={label}
                      checked={schoolRoles.includes(value)}
                      onChange={() =>
                        setSchoolRoles((prev) => toggle(prev, value))
                      }
                    />
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Classroom role</p>
                <div className="space-y-1.5">
                  {(Object.entries(USER_ROLES) as [UserRole, string][]).map(
                    ([value, label]) => (
                      <CheckboxRow
                        key={value}
                        label={label}
                        checked={classroomRoles.includes(value)}
                        onChange={() =>
                          setClassroomRoles((prev) => toggle(prev, value))
                        }
                      />
                    )
                  )}
                </div>
              </div>

              <div className="sm:col-span-2">
                <p className="mb-2 text-sm font-medium">Board position</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {(
                    Object.entries(PTA_BOARD_POSITIONS) as [
                      PtaBoardPosition,
                      string
                    ][]
                  ).map(([value, label]) => (
                    <CheckboxRow
                      key={value}
                      label={label}
                      checked={boardPositions.includes(value)}
                      onChange={() =>
                        setBoardPositions((prev) => toggle(prev, value))
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {gradeLevels.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">
                Grades{" "}
                <span className="font-normal text-muted-foreground">
                  (all grades if none selected)
                </span>
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {gradeLevels.map((g) => (
                  <CheckboxRow
                    key={g.value}
                    label={g.label}
                    checked={grades.includes(g.value)}
                    onChange={() => setGrades((prev) => toggle(prev, g.value))}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Columns</p>
            <div className="grid gap-1.5 sm:grid-cols-3">
              {MEMBER_EXPORT_COLUMNS.map((c) => (
                <CheckboxRow
                  key={c.key}
                  label={c.label}
                  checked={columns.includes(c.key)}
                  onChange={() => setColumns((prev) => toggle(prev, c.key))}
                />
              ))}
            </div>
          </div>

          <CheckboxRow
            label="One row per classroom (repeats a member who supports several)"
            checked={rowPerClassroom}
            onChange={setRowPerClassroom}
          />

          {preset && !isCustom && (
            <p className="text-xs text-muted-foreground">{preset.description}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleCopyEmails}
            disabled={isPending || columns.length === 0}
          >
            <Copy className="h-4 w-4" />
            Copy emails
          </Button>
          <Button
            onClick={handleDownload}
            disabled={isPending || columns.length === 0}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
