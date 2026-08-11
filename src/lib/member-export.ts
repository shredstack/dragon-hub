import type { SchoolRole, PtaBoardPosition, UserRole } from "@/types";

// Column definitions shared by the export dialog and the server action so the
// picker and the generated CSV can never drift apart.
export const MEMBER_EXPORT_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  // "Yes" once they've clicked their sign-in link; "No" for signups that never
  // verified — kept in the export so a group email still reaches them.
  { key: "verified", label: "Verified" },
  { key: "schoolRole", label: "School Role" },
  { key: "boardPosition", label: "Board Position" },
  { key: "classroomRole", label: "Classroom Role" },
  { key: "classroom", label: "Classroom" },
  { key: "gradeLevel", label: "Grade" },
  { key: "teacher", label: "Teacher" },
  { key: "committee", label: "Committee" },
  { key: "committeeRole", label: "Committee Role" },
] as const;

export type MemberExportColumnKey = (typeof MEMBER_EXPORT_COLUMNS)[number]["key"];

export const DEFAULT_EXPORT_COLUMNS: MemberExportColumnKey[] =
  MEMBER_EXPORT_COLUMNS.map((c) => c.key);

export interface MemberExportFilters {
  /** Membership role at the school. Empty means any. */
  schoolRoles?: SchoolRole[];
  /** PTA board position. Empty means any. */
  boardPositions?: PtaBoardPosition[];
  /** Role within a classroom. Empty means any. */
  classroomRoles?: UserRole[];
  /** Raw `classrooms.grade_level` values. Empty means any. */
  gradeLevels?: string[];
  /** `committees.id` values. Empty means any committee (and no committee). */
  committeeIds?: string[];
  /** Emit one row per classroom assignment instead of one row per person. */
  rowPerClassroom?: boolean;
  /**
   * Emit one row per committee, and drop anyone who is on none — a committee
   * row for a member with no committee is an empty cell, not a row.
   *
   * Takes precedence over `rowPerClassroom`: expanding both axes at once would
   * multiply a member who supports two rooms and sits on two committees into
   * four rows, each implying a link between a room and a committee that isn't
   * there.
   */
  rowPerCommittee?: boolean;
  columns?: MemberExportColumnKey[];
}

export interface MemberExportPreset {
  id: string;
  label: string;
  description: string;
  filters: MemberExportFilters;
}

export const MEMBER_EXPORT_PRESETS: MemberExportPreset[] = [
  {
    id: "all",
    label: "All members",
    description: "Everyone with an approved membership this school year.",
    filters: {},
  },
  {
    id: "pta_board",
    label: "PTA Board members",
    description: "Members whose school role is PTA Board, with their position.",
    filters: { schoolRoles: ["pta_board"] },
  },
  {
    id: "room_parents",
    label: "Room parents",
    description:
      "Room parents with the grade and teacher of each classroom they support.",
    filters: { classroomRoles: ["room_parent"], rowPerClassroom: true },
  },
  {
    id: "teachers",
    label: "Teachers",
    description: "Teachers with their assigned classroom and grade.",
    filters: { classroomRoles: ["teacher"], rowPerClassroom: true },
  },
  {
    id: "volunteers",
    label: "Classroom volunteers",
    description: "Members signed up as volunteers in at least one classroom.",
    filters: { classroomRoles: ["volunteer"], rowPerClassroom: true },
  },
  {
    id: "committees",
    label: "Committee members",
    description:
      "Everyone on a committee, one row per committee. Pick the committees below, or leave them all unchecked for every committee.",
    filters: { rowPerCommittee: true },
  },
  {
    id: "custom",
    label: "Custom…",
    description: "Pick your own combination of roles and grades.",
    filters: {},
  },
];

export interface MemberExportResult {
  columns: { key: MemberExportColumnKey; label: string }[];
  rows: Record<MemberExportColumnKey, string>[];
  /** Unique, deduplicated email addresses for the matching members. */
  emails: string[];
  /** Distinct people matched, which can be lower than `rows.length`. */
  memberCount: number;
  /** The school year the export was scoped to. */
  schoolYear: string;
  /**
   * False when the school has no classrooms for `schoolYear` — the state after
   * a year rollover promotes memberships but not classrooms. Every
   * classroom-based filter necessarily returns nothing, which is worth saying
   * out loud rather than reporting as "no matches".
   */
  hasClassroomsForYear: boolean;
  /** The committee equivalent: no committees exist for `schoolYear` yet. */
  hasCommitteesForYear: boolean;
}

export interface MemberExportOptions {
  schoolYear: string;
  gradeLevels: { value: string; label: string }[];
  hasClassroomsForYear: boolean;
  /** The school's own board positions, for the position filter. */
  boardPositions: { value: string; label: string }[];
  /** This year's committees, for the committee filter. */
  committees: { value: string; label: string }[];
}

/** True when the filters can only be satisfied by a classroom assignment. */
export function dependsOnClassrooms(filters: MemberExportFilters): boolean {
  return (
    (filters.classroomRoles?.length ?? 0) > 0 ||
    (filters.gradeLevels?.length ?? 0) > 0
  );
}

/** True when the filters can only be satisfied by a committee membership. */
export function dependsOnCommittees(filters: MemberExportFilters): boolean {
  return (filters.committeeIds?.length ?? 0) > 0 || !!filters.rowPerCommittee;
}
