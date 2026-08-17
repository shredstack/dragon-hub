"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  ExportCheckboxRow,
  ExportDialog,
  ExportPresetCard,
  ExportSection,
  toggleValue,
} from "@/components/ui/export-dialog";
import { exportMembers } from "@/actions/member-export";
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

export function ExportMembersDialog({
  open,
  onOpenChange,
  options,
}: ExportMembersDialogProps) {
  const { gradeLevels, schoolYear, hasClassroomsForYear } = options;
  const committeeOptions = options.committees;
  const campaignEventOptions = options.campaignEvents;
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

  return (
    <ExportDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export members"
      description="Download a CSV for your email tool or spreadsheet, or copy the addresses straight to your clipboard."
      filename={presetId}
      run={() => exportMembers(buildFilters())}
      emptyMessage={(result) => emptyReason(result, buildFilters())}
      disabled={columns.length === 0}
      disclaimer={
        <>
          {/* Adults only, everywhere an export happens — the same line the
              classroom roster export carries. DragonHub holds no student data. */}
          <p className="text-xs text-muted-foreground">
            Adult contacts only: PTA members, parent volunteers and teachers.
            DragonHub never stores student names or student information.
          </p>
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
        </>
      }
    >
      <ExportSection title="Who to export">
        <div className="grid gap-2 sm:grid-cols-2">
          {MEMBER_EXPORT_PRESETS.map((p) => (
            <ExportPresetCard
              key={p.id}
              name="export-preset"
              checked={presetId === p.id}
              onSelect={() => selectPreset(p.id)}
              label={p.label}
              description={p.description}
            />
          ))}
        </div>
      </ExportSection>

      <ExportSection title="Format">
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
      </ExportSection>

      <ExportSection
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
            <ExportCheckboxRow
              key={value}
              label={ASSIGNMENT_TYPES[value]}
              checked={assignmentTypes.includes(value)}
              onChange={() =>
                setAssignmentTypes((prev) => toggleValue(prev, value))
              }
            />
          ))}
        </div>
      </ExportSection>

      <ExportSection title="Status" hint="all statuses if none selected">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {(
            Object.entries(ASSIGNMENT_STATUSES) as [AssignmentStatus, string][]
          )
            .filter(([value]) => value !== "unfilled" || includeUnfilledSpots)
            .map(([value, label]) => (
              <ExportCheckboxRow
                key={value}
                label={label}
                checked={statuses.includes(value)}
                onChange={() => setStatuses((prev) => toggleValue(prev, value))}
              />
            ))}
        </div>
      </ExportSection>

      {isCustom && (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">School role</p>
            <div className="space-y-1.5">
              {(Object.entries(SCHOOL_ROLES) as [SchoolRole, string][]).map(
                ([value, label]) => (
                  <ExportCheckboxRow
                    key={value}
                    label={label}
                    checked={schoolRoles.includes(value)}
                    onChange={() =>
                      setSchoolRoles((prev) => toggleValue(prev, value))
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
                <ExportCheckboxRow
                  key={value}
                  label={label}
                  checked={boardPositions.includes(value)}
                  onChange={() =>
                    setBoardPositions((prev) => toggleValue(prev, value))
                  }
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {gradeLevels.length > 0 && (
        <ExportSection title="Grades" hint="all grades if none selected">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {gradeLevels.map((g) => (
              <ExportCheckboxRow
                key={g.value}
                label={g.label}
                checked={grades.includes(g.value)}
                onChange={() => setGrades((prev) => toggleValue(prev, g.value))}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Only assignments attached to a classroom can match a grade, so
            picking one drops school-wide committees and event interests.
          </p>
        </ExportSection>
      )}

      {committeeOptions.length > 0 && (
        <ExportSection
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
              <ExportCheckboxRow
                key={c.value}
                label={c.label}
                checked={committeeIds.includes(c.value)}
                onChange={() =>
                  setCommitteeIds((prev) => toggleValue(prev, c.value))
                }
              />
            ))}
          </div>
        </ExportSection>
      )}

      {campaignEventOptions.length > 0 && (
        <ExportSection
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
              <ExportCheckboxRow
                key={e.value}
                label={e.label}
                checked={campaignEventIds.includes(e.value)}
                onChange={() =>
                  setCampaignEventIds((prev) => toggleValue(prev, e.value))
                }
              />
            ))}
          </div>
        </ExportSection>
      )}

      {format === "assignment" && (
        <div>
          <ExportCheckboxRow
            label="Include unfilled spots"
            checked={includeUnfilledSpots}
            onChange={setIncludeUnfilledSpots}
          />
          <p className="pl-6 text-xs text-muted-foreground">
            Adds a row for every seat nobody holds — the rooms still short a room
            parent, the classroom committee spots still open — so gaps sort next
            to the people who filled the rest.
          </p>
        </div>
      )}

      <ExportSection title="Columns">
        <div className="grid gap-1.5 sm:grid-cols-3">
          {availableColumns.map((c) => (
            <ExportCheckboxRow
              key={c.key}
              label={c.label}
              checked={columns.includes(c.key)}
              onChange={() => setColumns((prev) => toggleValue(prev, c.key))}
            />
          ))}
        </div>
      </ExportSection>

      {preset && !isCustom && (
        <p className="text-xs text-muted-foreground">{preset.description}</p>
      )}
    </ExportDialog>
  );
}
