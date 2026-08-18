"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  ExportCheckboxRow,
  ExportDialog,
  ExportPresetCard,
  ExportSection,
  toggleValue,
} from "@/components/ui/export-dialog";
import {
  exportClassroomRoster,
  exportClassroomRosterPdf,
} from "@/actions/classroom-roster-export";
import {
  CLASSROOM_ROSTER_DISCLAIMER,
  CLASSROOM_ROSTER_PRESETS,
  classroomRosterColumnsForFormat,
  classroomRosterCsvNotes,
  classroomRosterInputForPreset,
  type ClassroomRosterExportInput,
} from "@/lib/classroom-roster-export";
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  CLASSROOM_ASSIGNMENT_TYPES,
  type AssignmentStatus,
  type AssignmentType,
  type MemberExportColumnKey,
} from "@/lib/member-export";

interface ExportRosterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroomId: string;
  classroomName: string;
  schoolYear: string;
}

/**
 * A room's own roster export — the same dialog the PTA board's member export
 * wears (`@/components/ui/export-dialog`), with a classroom's filters in it.
 *
 * The room is never a choice here: it comes from the page, and the server pins
 * it again. What the reader picks is only the shape.
 */
export function ExportRosterDialog({
  open,
  onOpenChange,
  classroomId,
  classroomName,
  schoolYear,
}: ExportRosterDialogProps) {
  const [presetId, setPresetId] = useState(CLASSROOM_ROSTER_PRESETS[0].id);
  const [input, setInput] = useState<ClassroomRosterExportInput>(() =>
    classroomRosterInputForPreset(CLASSROOM_ROSTER_PRESETS[0])
  );

  const availableColumns = classroomRosterColumnsForFormat(input.format);

  function selectPreset(id: string) {
    const preset = CLASSROOM_ROSTER_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setInput(classroomRosterInputForPreset(preset));
  }

  const update = (patch: Partial<ClassroomRosterExportInput>) =>
    setInput((prev) => ({ ...prev, ...patch }));

  // Not rendered — it travels in the file, so no hydration to worry about.
  const csvNotes = classroomRosterCsvNotes({
    classroomName,
    schoolYear,
    exportedOn: new Date().toLocaleDateString(),
  });

  return (
    <ExportDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Export ${classroomName} roster`}
      description="Download an up-to-date list of this classroom's volunteers and teachers, or copy their email addresses."
      filename={`${classroomName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${presetId}`}
      run={() => exportClassroomRoster(classroomId, input)}
      emptyMessage={() =>
        `Nobody has signed up for ${classroomName} in ${schoolYear} under those filters yet.`
      }
      csvNotes={csvNotes}
      pdf={{
        run: () => exportClassroomRosterPdf(classroomId, input),
        emptyMessage: `Nobody has signed up for ${classroomName} in ${schoolYear} under those filters yet.`,
      }}
      disabled={input.columns.length === 0}
      disclaimer={
        <div className="flex gap-3 rounded-lg border border-border bg-muted/50 p-3 text-sm">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-dragon-blue-600" />
          <p className="text-muted-foreground">
            {CLASSROOM_ROSTER_DISCLAIMER} The same note is written into the file
            you download.
          </p>
        </div>
      }
    >
      <ExportSection title="What to export">
        <div className="grid gap-2 sm:grid-cols-2">
          {CLASSROOM_ROSTER_PRESETS.map((preset) => (
            <ExportPresetCard
              key={preset.id}
              name="classroom-roster-preset"
              checked={presetId === preset.id}
              onSelect={() => selectPreset(preset.id)}
              label={preset.label}
              description={preset.description}
            />
          ))}
        </div>
      </ExportSection>

      {input.format === "assignment" && (
        <>
          <ExportSection title="Include" hint="everyone if none selected">
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CLASSROOM_ASSIGNMENT_TYPES.map((value) => (
                <ExportCheckboxRow
                  key={value}
                  label={ASSIGNMENT_TYPES[value]}
                  checked={input.assignmentTypes.includes(value)}
                  onChange={() =>
                    update({
                      assignmentTypes: toggleValue<AssignmentType>(
                        input.assignmentTypes,
                        value
                      ),
                    })
                  }
                />
              ))}
            </div>
          </ExportSection>

          <ExportSection title="Status" hint="all statuses if none selected">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {(
                Object.entries(ASSIGNMENT_STATUSES) as [
                  AssignmentStatus,
                  string,
                ][]
              )
                .filter(
                  ([value]) =>
                    value !== "unfilled" || input.includeUnfilledSpots
                )
                .map(([value, label]) => (
                  <ExportCheckboxRow
                    key={value}
                    label={label}
                    checked={input.statuses.includes(value)}
                    onChange={() =>
                      update({
                        statuses: toggleValue<AssignmentStatus>(
                          input.statuses,
                          value
                        ),
                      })
                    }
                  />
                ))}
            </div>
          </ExportSection>

          <div>
            <ExportCheckboxRow
              label="Include spots nobody has taken"
              checked={input.includeUnfilledSpots}
              onChange={(checked) =>
                update({
                  includeUnfilledSpots: checked,
                  // The status filter can't keep a status the export no longer
                  // produces, or unticking this would silently return nothing.
                  statuses: checked
                    ? input.statuses
                    : input.statuses.filter((s) => s !== "unfilled"),
                })
              }
            />
            <p className="pl-6 text-xs text-muted-foreground">
              Adds a row for every seat still open in this room — the room parent
              spot nobody has claimed, the committee spot still going begging.
            </p>
          </div>
        </>
      )}

      {/* The PDF lays the same people out as a document with a fixed shape, so
          it takes no column choices — saying so beats a picker that silently
          does nothing to one of the two buttons. */}
      <ExportSection title="Columns" hint="CSV only">
        <div className="grid gap-1.5 sm:grid-cols-3">
          {availableColumns.map((c) => (
            <ExportCheckboxRow
              key={c.key}
              label={c.label}
              checked={input.columns.includes(c.key)}
              onChange={() =>
                update({
                  columns: toggleValue<MemberExportColumnKey>(
                    input.columns,
                    c.key
                  ),
                })
              }
            />
          ))}
        </div>
      </ExportSection>
    </ExportDialog>
  );
}
