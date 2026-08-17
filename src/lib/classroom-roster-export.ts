/**
 * A classroom's own roster export — the board's member export, narrowed to one
 * room and handed to the people who run it.
 *
 * The teacher's question is "who is helping in my room this year, and how do I
 * reach them", and until now the only answer was to ask the PTA board to run an
 * export for them. Everything below is a *narrowing* of `member-export.ts`
 * rather than a second export: same query, same shapes, same CSV, with
 * `classroomIds` pinned to the one room and the columns cut to what a room's
 * team is already looking at on the classroom page.
 *
 * **This roster is adults only.** DragonHub holds no student names anywhere —
 * a classroom's roster is its parent volunteers and its teachers, which is what
 * makes handing it to a teacher unremarkable. The disclaimer below is on the
 * export dialog and inside the exported file, because the file gets forwarded
 * and the dialog does not travel with it.
 *
 * Client-safe: the dialog and the server action share one set of rules, so what
 * the checkboxes offer and what the action allows cannot drift.
 */

import {
  ASSIGNMENT_FORMAT_COLUMNS,
  CLASSROOM_ASSIGNMENT_TYPES,
  MEMBER_FORMAT_COLUMNS,
  type AssignmentStatus,
  type AssignmentType,
  type MemberExportColumnKey,
  type MemberExportFilters,
  type MemberExportFormat,
} from "@/lib/member-export";

/** The standing note, shown in the dialog and written into the file. */
export const CLASSROOM_ROSTER_DISCLAIMER =
  "Adults only: this roster is the classroom's parent volunteers and its teachers. DragonHub never stores student names or student information — please don't add any.";

/**
 * The columns a room's own export may contain.
 *
 * Everything here is already on the classroom page for anyone who can open it.
 * Deliberately absent: `verified`, `schoolRole` and `boardPosition`, which are
 * the PTA's own record of a person rather than facts about this room, and
 * `notes`, which is what a parent wrote to the board on their signup.
 */
export const CLASSROOM_ROSTER_ASSIGNMENT_COLUMNS: MemberExportColumnKey[] = [
  "name",
  "email",
  "phone",
  "assignmentType",
  "assignment",
  "assignmentRole",
  "classroom",
  "gradeLevel",
  "teacher",
  "status",
  "spotOrder",
  "spots",
  "signedUpAt",
  "details",
];

export const CLASSROOM_ROSTER_MEMBER_COLUMNS: MemberExportColumnKey[] = [
  "name",
  "email",
  "phone",
  "roomParentRooms",
  "roomParentWaitlist",
  "partyVolunteerRooms",
  "classroomCommittees",
  "teacherOf",
  "grades",
  "teachers",
];

export function classroomRosterColumnsForFormat(
  format: MemberExportFormat
): { key: MemberExportColumnKey; label: string }[] {
  const allowed =
    format === "assignment"
      ? CLASSROOM_ROSTER_ASSIGNMENT_COLUMNS
      : CLASSROOM_ROSTER_MEMBER_COLUMNS;
  const source =
    format === "assignment" ? ASSIGNMENT_FORMAT_COLUMNS : MEMBER_FORMAT_COLUMNS;
  return source
    .filter((c) => allowed.includes(c.key))
    .map((c) => ({ key: c.key, label: c.label }));
}

export interface ClassroomRosterPreset {
  id: string;
  label: string;
  description: string;
  format: MemberExportFormat;
  /** Empty means every classroom-scoped type. */
  assignmentTypes: AssignmentType[];
  includeUnfilledSpots?: boolean;
}

export const CLASSROOM_ROSTER_PRESETS: ClassroomRosterPreset[] = [
  {
    id: "volunteers",
    label: "Everyone helping this room",
    description:
      "Room parents, party volunteers, classroom committee helpers and teachers — one row per commitment.",
    format: "assignment",
    assignmentTypes: [],
  },
  {
    id: "contacts",
    label: "Contact list",
    description:
      "One row per person, with a column for each way they help this room. Best for a mail merge or a class email.",
    format: "member",
    assignmentTypes: [],
  },
  {
    id: "room_parents",
    label: "Room parents",
    description:
      "This room's room parents in signup order, then its waitlist, then any seat still open.",
    format: "assignment",
    assignmentTypes: ["room_parent"],
    includeUnfilledSpots: true,
  },
  {
    id: "party_volunteers",
    label: "Party volunteers",
    description:
      "Party helpers with the parties they signed up for. This role has no cap, so no waitlist.",
    format: "assignment",
    assignmentTypes: ["party_volunteer"],
  },
  {
    id: "classroom_committees",
    label: "Classroom committees",
    description:
      "Committees covering this room, like Meet the Masters — who's covering it, who's waiting, and what's still open.",
    format: "assignment",
    assignmentTypes: ["classroom_committee"],
    includeUnfilledSpots: true,
  },
];

export interface ClassroomRosterExportInput {
  presetId: string;
  format: MemberExportFormat;
  /** Empty means every classroom-scoped type. */
  assignmentTypes: AssignmentType[];
  /** Empty means every status the format can produce. */
  statuses: AssignmentStatus[];
  includeUnfilledSpots: boolean;
  columns: MemberExportColumnKey[];
}

export function classroomRosterInputForPreset(
  preset: ClassroomRosterPreset
): ClassroomRosterExportInput {
  return {
    presetId: preset.id,
    format: preset.format,
    assignmentTypes: preset.assignmentTypes,
    statuses: [],
    includeUnfilledSpots:
      preset.format === "assignment" && !!preset.includeUnfilledSpots,
    columns: classroomRosterColumnsForFormat(preset.format).map((c) => c.key),
  };
}

/**
 * Turn the dialog's choices into export filters, clamped to what a classroom
 * export is allowed to be.
 *
 * The server calls this too, and passes the classroom id itself — the room is
 * never taken from the request body, only the choices about how to shape it.
 * Clamping here rather than trusting the caller is what keeps a hand-rolled
 * request from asking for the school-wide committee roster or a board position
 * column through a door meant for one classroom.
 */
export function buildClassroomRosterFilters(
  classroomId: string,
  input: ClassroomRosterExportInput
): MemberExportFilters {
  const format: MemberExportFormat =
    input.format === "assignment" ? "assignment" : "member";

  const requestedTypes = input.assignmentTypes.filter((t) =>
    CLASSROOM_ASSIGNMENT_TYPES.includes(t)
  );

  const allowedColumns = classroomRosterColumnsForFormat(format).map(
    (c) => c.key
  );
  const columns = input.columns.filter((c) => allowedColumns.includes(c));

  return {
    format,
    classroomIds: [classroomId],
    // Empty means "every classroom-scoped type", which the classroom filter
    // would enforce anyway — being explicit keeps the intent readable.
    assignmentTypes:
      requestedTypes.length > 0 ? requestedTypes : CLASSROOM_ASSIGNMENT_TYPES,
    statuses: input.statuses,
    includeUnfilledSpots:
      format === "assignment" && input.includeUnfilledSpots === true,
    columns: columns.length > 0 ? columns : allowedColumns,
  };
}

/** The lines appended to the exported file, under a blank row. */
export function classroomRosterCsvNotes(params: {
  classroomName: string;
  schoolYear: string;
  exportedOn: string;
}): string[] {
  return [
    `${params.classroomName} — volunteer and teacher roster, ${params.schoolYear} (exported ${params.exportedOn})`,
    CLASSROOM_ROSTER_DISCLAIMER,
    "Contact details belong to the people who volunteered for this classroom. Use them for classroom coordination only.",
  ];
}
