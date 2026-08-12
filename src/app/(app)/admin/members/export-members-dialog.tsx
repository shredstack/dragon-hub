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
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  ASSIGNMENT_TYPE_ORDER,
  MEMBER_EXPORT_FORMATS,
  MEMBER_EXPORT_PRESETS,
  columnsForFormat,
  defaultColumnsForFormat,
  dependsOnCampaigns,
  dependsOnClassrooms,
  dependsOnCommittees,
  type AssignmentStatus,
  type AssignmentType,
  type MemberExportColumnKey,
  type MemberExportFilters,
  type MemberExportFormat,
  type MemberExportOptions,
  type MemberExportResult,
} from "@/lib/member-export";
import { SCHOOL_ROLES } from "@/lib/constants";
import type { PtaBoardPosition, SchoolRole } from "@/types";

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
    return `No classrooms exist for ${result.schoolYear} yet, so no one has a classroom assignment for this year. Promote classrooms to ${result.schoolYear} first, or export by school role instead.`;
  }
  if (!result.hasCommitteesForYear && dependsOnCommittees(filters)) {
    return `No committees exist for ${result.schoolYear} yet, so no one is on one. Create or roll over committees first, or export by school role instead.`;
  }
  if (!result.hasCampaignEventsForYear && dependsOnCampaigns(filters)) {
    return `No volunteer campaign events exist for ${result.schoolYear} yet, so nobody has expressed interest in one.`;
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

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {title}{" "}
          {hint && (
            <span className="font-normal text-muted-foreground">({hint})</span>
          )}
        </p>
        {action}
      </div>
      {children}
    </div>
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
  const committeeOptions = options.committees;
  const campaignEventOptions = options.campaignEvents;
  const { addToast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [presetId, setPresetId] = useState("all_members");
  const [format, setFormat] = useState<MemberExportFormat>("member");
  const [schoolRoles, setSchoolRoles] = useState<SchoolRole[]>([]);
  const [boardPositions, setBoardPositions] = useState<PtaBoardPosition[]>([]);
  const [assignmentTypes, setAssignmentTypes] = useState<AssignmentType[]>([]);
  const [statuses, setStatuses] = useState<AssignmentStatus[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [committeeIds, setCommitteeIds] = useState<string[]>([]);
  const [campaignEventIds, setCampaignEventIds] = useState<string[]>([]);
  const [includeUnfilledSpots, setIncludeUnfilledSpots] = useState(false);
  const [columns, setColumns] = useState<MemberExportColumnKey[]>(
    defaultColumnsForFormat("member")
  );

  const isCustom = presetId === "custom";
  const preset = MEMBER_EXPORT_PRESETS.find((p) => p.id === presetId);
  const availableColumns = columnsForFormat(format);

  /**
   * Switching format switches the column set with it — the two shapes share
   * only the person columns, so carrying a selection across would silently drop
   * every column the new shape doesn't have.
   */
  function selectFormat(next: MemberExportFormat) {
    setFormat(next);
    setColumns(defaultColumnsForFormat(next));
    if (next === "member") setIncludeUnfilledSpots(false);
  }

  function selectPreset(id: string) {
    setPresetId(id);
    const next = MEMBER_EXPORT_PRESETS.find((p) => p.id === id);
    if (!next) return;
    const nextFormat = next.filters.format ?? "member";
    setFormat(nextFormat);
    setColumns(defaultColumnsForFormat(nextFormat));
    if (id === "custom") return;
    setSchoolRoles(next.filters.schoolRoles ?? []);
    setBoardPositions(next.filters.boardPositions ?? []);
    setAssignmentTypes(next.filters.assignmentTypes ?? []);
    setStatuses(next.filters.statuses ?? []);
    setGrades([]);
    setCommitteeIds([]);
    setCampaignEventIds([]);
    setIncludeUnfilledSpots(
      nextFormat === "assignment" && !!next.filters.includeUnfilledSpots
    );
  }

  function buildFilters(): MemberExportFilters {
    return {
      format,
      schoolRoles,
      boardPositions,
      assignmentTypes,
      statuses,
      gradeLevels: grades,
      committeeIds,
      campaignEventIds,
      includeUnfilledSpots: format === "assignment" && includeUnfilledSpots,
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
        downloadCsv(`${presetId}-${stamp}.csv`, csv);
        const rows = `${result.rows.length} row${
          result.rows.length === 1 ? "" : "s"
        }`;
        // An unfilled-spots export can legitimately have rows and no people —
        // "for 0 members" would read as a failure rather than as the answer.
        addToast(
          result.memberCount === 0
            ? `Exported ${rows}.`
            : `Exported ${rows} for ${result.memberCount} member${
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
            Download a CSV for your email tool or spreadsheet, or copy the
            addresses straight to your clipboard.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {!hasClassroomsForYear && (
            <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>
                No classrooms exist for{" "}
                <span className="font-medium">{schoolYear}</span> yet, so the
                room parent, teacher and classroom committee exports will come
                back empty. Promote classrooms to {schoolYear} first — exports
                by school role still work.
              </p>
            </div>
          )}

          <Section title="Who to export">
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
          </Section>

          <Section title="Format">
            <div className="space-y-1.5">
              {(
                Object.entries(MEMBER_EXPORT_FORMATS) as [
                  MemberExportFormat,
                  string,
                ][]
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name="export-format"
                    checked={format === value}
                    onChange={() => selectFormat(value)}
                    className="h-4 w-4 accent-dragon-blue-500"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {format === "member"
                ? "One line per person, with a separate column for each kind of commitment. Best for mail merges."
                : "One line per commitment — a room parent seat, a committee spot, a place in a waitlist. Best for sorting and filtering in a spreadsheet."}
            </p>
          </Section>

          <Section
            title="Assignment types"
            hint="all types if none selected"
            action={
              assignmentTypes.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setAssignmentTypes([])}
                  className="text-xs text-muted-foreground underline"
                >
                  Clear
                </button>
              ) : undefined
            }
          >
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ASSIGNMENT_TYPE_ORDER.map((value) => (
                <CheckboxRow
                  key={value}
                  label={ASSIGNMENT_TYPES[value]}
                  checked={assignmentTypes.includes(value)}
                  onChange={() =>
                    setAssignmentTypes((prev) => toggle(prev, value))
                  }
                />
              ))}
            </div>
          </Section>

          <Section title="Status" hint="all statuses if none selected">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {(
                Object.entries(ASSIGNMENT_STATUSES) as [
                  AssignmentStatus,
                  string,
                ][]
              )
                .filter(([value]) => value !== "unfilled" || includeUnfilledSpots)
                .map(([value, label]) => (
                  <CheckboxRow
                    key={value}
                    label={label}
                    checked={statuses.includes(value)}
                    onChange={() => setStatuses((prev) => toggle(prev, value))}
                  />
                ))}
            </div>
          </Section>

          {isCustom && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium">School role</p>
                <div className="space-y-1.5">
                  {(Object.entries(SCHOOL_ROLES) as [SchoolRole, string][]).map(
                    ([value, label]) => (
                      <CheckboxRow
                        key={value}
                        label={label}
                        checked={schoolRoles.includes(value)}
                        onChange={() =>
                          setSchoolRoles((prev) => toggle(prev, value))
                        }
                      />
                    )
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Board position</p>
                <div className="space-y-1.5">
                  {options.boardPositions.map(({ value, label }) => (
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
            <Section title="Grades" hint="all grades if none selected">
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
              <p className="mt-1.5 text-xs text-muted-foreground">
                Only assignments attached to a classroom can match a grade, so
                picking one drops school-wide committees and event interests.
              </p>
            </Section>
          )}

          {committeeOptions.length > 0 && (
            <Section
              title="Committees"
              hint="all committees if none selected"
              action={
                committeeIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setCommitteeIds([])}
                    className="text-xs text-muted-foreground underline"
                  >
                    Clear
                  </button>
                ) : undefined
              }
            >
              <div className="grid gap-1.5 sm:grid-cols-2">
                {committeeOptions.map((c) => (
                  <CheckboxRow
                    key={c.value}
                    label={c.label}
                    checked={committeeIds.includes(c.value)}
                    onChange={() =>
                      setCommitteeIds((prev) => toggle(prev, c.value))
                    }
                  />
                ))}
              </div>
            </Section>
          )}

          {campaignEventOptions.length > 0 && (
            <Section
              title="Event volunteer interest"
              hint="all events if none selected"
              action={
                campaignEventIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setCampaignEventIds([])}
                    className="text-xs text-muted-foreground underline"
                  >
                    Clear
                  </button>
                ) : undefined
              }
            >
              <div className="grid gap-1.5 sm:grid-cols-2">
                {campaignEventOptions.map((e) => (
                  <CheckboxRow
                    key={e.value}
                    label={e.label}
                    checked={campaignEventIds.includes(e.value)}
                    onChange={() =>
                      setCampaignEventIds((prev) => toggle(prev, e.value))
                    }
                  />
                ))}
              </div>
            </Section>
          )}

          {format === "assignment" && (
            <div>
              <CheckboxRow
                label="Include unfilled spots"
                checked={includeUnfilledSpots}
                onChange={setIncludeUnfilledSpots}
              />
              <p className="pl-6 text-xs text-muted-foreground">
                Adds a row for every seat nobody holds — the rooms still short a
                room parent, the classroom committee spots still open — so gaps
                sort next to the people who filled the rest.
              </p>
            </div>
          )}

          <Section title="Columns">
            <div className="grid gap-1.5 sm:grid-cols-3">
              {availableColumns.map((c) => (
                <CheckboxRow
                  key={c.key}
                  label={c.label}
                  checked={columns.includes(c.key)}
                  onChange={() => setColumns((prev) => toggle(prev, c.key))}
                />
              ))}
            </div>
          </Section>

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
