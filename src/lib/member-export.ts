/**
 * The shape of a member export.
 *
 * There are two shapes, because "email everyone" and "who is doing what" are
 * genuinely different questions and one table cannot answer both:
 *
 * - **member** — one row per person, one email address per line. What a mail
 *   merge wants. Each *kind* of commitment gets its own column, because a
 *   person is frequently a room parent in one room and a Meet the Masters
 *   volunteer in another, and squeezing that into a single "Classroom Role"
 *   cell is what made the old export unreadable.
 * - **assignment** — one row per commitment. A room parent seat, a place in a
 *   room's waitlist, a per-classroom committee spot, a school-wide committee
 *   seat, an event interest, a teacher assignment. Filter Type, sort by
 *   Classroom, and every room's seats and its line come out in order.
 *
 * Both are built from the **signup** tables (`volunteer_signups`,
 * `committee_signups`, `volunteer_interests`), not from the authorization
 * tables. `classroom_members` holds one row per (classroom, user) with a single
 * role, so it cannot tell a room parent apart from someone who got classroom
 * access through a committee's `grantsLinkedAccess`, and it has no row at all
 * for anyone waitlisted.
 */

import type { SchoolRole, PtaBoardPosition } from "@/types";

export const MEMBER_EXPORT_FORMATS = {
  member: "One row per member",
  assignment: "One row per assignment",
} as const;

export type MemberExportFormat = keyof typeof MEMBER_EXPORT_FORMATS;

/**
 * What kind of commitment a row describes. These are independent of each other
 * — holding one says nothing about holding another — which is the whole reason
 * they are a type column rather than a single role.
 */
export const ASSIGNMENT_TYPES = {
  room_parent: "Room Parent",
  party_volunteer: "Party Volunteer",
  classroom_committee: "Classroom Committee",
  school_committee: "School Committee",
  event_interest: "Event Interest",
  teacher: "Teacher",
  board_position: "Board Position",
  /** A member holding none of the above. Keeps "all assignments" a superset. */
  none: "No Assignment",
} as const;

export type AssignmentType = keyof typeof ASSIGNMENT_TYPES;

export const ASSIGNMENT_TYPE_ORDER: AssignmentType[] = [
  "room_parent",
  "party_volunteer",
  "classroom_committee",
  "school_committee",
  "event_interest",
  "teacher",
  "board_position",
  "none",
];

/** The types that hang off a classroom, and so respond to a grade filter. */
export const CLASSROOM_ASSIGNMENT_TYPES: AssignmentType[] = [
  "room_parent",
  "party_volunteer",
  "classroom_committee",
  "teacher",
];

export const COMMITTEE_ASSIGNMENT_TYPES: AssignmentType[] = [
  "classroom_committee",
  "school_committee",
];

export const ASSIGNMENT_STATUSES = {
  active: "Active",
  waitlisted: "Waitlisted",
  /**
   * A seat nobody holds. Only ever produced by `includeUnfilledSpots`, and the
   * only status whose row has no person on it — that is what makes a gap
   * findable by sorting instead of by noticing an absence.
   */
  unfilled: "Unfilled",
} as const;

export type AssignmentStatus = keyof typeof ASSIGNMENT_STATUSES;

// ─── Columns ───────────────────────────────────────────────────────────────
// Shared by the export dialog's column picker and the server action, so the
// checkboxes and the generated CSV can never drift apart.

const PERSON_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  // "Yes" once they've clicked their sign-in link; "No" for signups that never
  // verified — kept in the export so a group email still reaches them.
  { key: "verified", label: "Verified" },
  { key: "schoolRole", label: "School Role" },
  { key: "boardPosition", label: "Board Position" },
] as const;

export const MEMBER_FORMAT_COLUMNS = [
  ...PERSON_COLUMNS,
  // One column per kind of commitment. A person who is a room parent in Room 12
  // and covers Meet the Masters in two other rooms reads correctly across three
  // cells instead of wrongly in one.
  { key: "roomParentRooms", label: "Room Parent" },
  { key: "roomParentWaitlist", label: "Room Parent Waitlist" },
  { key: "partyVolunteerRooms", label: "Party Volunteer" },
  { key: "classroomCommittees", label: "Classroom Committees" },
  { key: "schoolCommittees", label: "School Committees" },
  { key: "eventInterests", label: "Event Interests" },
  { key: "teacherOf", label: "Teacher Of" },
  { key: "grades", label: "Grades" },
  { key: "teachers", label: "Teachers" },
] as const;

export const ASSIGNMENT_FORMAT_COLUMNS = [
  ...PERSON_COLUMNS,
  { key: "assignmentType", label: "Type" },
  /** The classroom, committee or event this commitment is to. */
  { key: "assignment", label: "Assignment" },
  { key: "assignmentRole", label: "Role" },
  // Set for every classroom-scoped type. On a classroom committee row this is
  // the room that person covers *for that committee* — never a room they hold
  // some other commitment in.
  { key: "classroom", label: "Classroom" },
  { key: "gradeLevel", label: "Grade" },
  { key: "teacher", label: "Teacher" },
  { key: "status", label: "Status" },
  /** 1-based place within its seat pool: seat 1 and 2, or #1 and #2 in line. */
  { key: "spotOrder", label: "Order" },
  /** The pool's capacity, when it has one. Blank for uncapped. */
  { key: "spots", label: "Spots" },
  { key: "signedUpAt", label: "Signed Up" },
  /** Party types, "Willing to chair" — structured extras, not free text. */
  { key: "details", label: "Details" },
  { key: "notes", label: "Notes" },
] as const;

export type MemberExportColumnKey =
  | (typeof MEMBER_FORMAT_COLUMNS)[number]["key"]
  | (typeof ASSIGNMENT_FORMAT_COLUMNS)[number]["key"];

export function columnsForFormat(
  format: MemberExportFormat
): readonly { key: MemberExportColumnKey; label: string }[] {
  return format === "assignment"
    ? ASSIGNMENT_FORMAT_COLUMNS
    : MEMBER_FORMAT_COLUMNS;
}

export function defaultColumnsForFormat(
  format: MemberExportFormat
): MemberExportColumnKey[] {
  return columnsForFormat(format).map((c) => c.key);
}

// ─── Filters ───────────────────────────────────────────────────────────────

export interface MemberExportFilters {
  /** Defaults to `member` when absent. */
  format?: MemberExportFormat;
  /** Membership role at the school. Empty means any. */
  schoolRoles?: SchoolRole[];
  /** PTA board position. Empty means any. */
  boardPositions?: PtaBoardPosition[];
  /** Kinds of commitment to include. Empty means all. */
  assignmentTypes?: AssignmentType[];
  /**
   * Raw `classrooms.grade_level` values. Empty means any. Only classroom-scoped
   * assignments can satisfy this, so setting it drops school-wide committees,
   * event interests and board positions.
   */
  gradeLevels?: string[];
  /**
   * `committees.id` values. Empty means any. Setting it narrows the export to
   * committee assignments, the way `campaignEventIds` narrows it to interests —
   * the two scope their own type rather than ANDing into nothing together.
   */
  committeeIds?: string[];
  /** `volunteer_campaign_events.id` values. Empty means any. */
  campaignEventIds?: string[];
  /** Empty means active, waitlisted, and (if asked for) unfilled. */
  statuses?: AssignmentStatus[];
  /**
   * Emit a row for every seat nobody holds — the room with one room parent
   * where the school's limit is two, the Meet the Masters room with nobody on
   * it. Assignment format only; the member format has no row to put them on.
   */
  includeUnfilledSpots?: boolean;
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
    id: "all_members",
    label: "All members",
    description:
      "One row per person, with a column for each kind of commitment. What a mail merge wants.",
    filters: { format: "member" },
  },
  {
    id: "all_assignments",
    label: "All assignments",
    description:
      "One row per commitment — every room parent seat, committee spot, event interest and waitlist place, in one sortable table.",
    filters: { format: "assignment" },
  },
  {
    id: "room_parents",
    label: "Room parents",
    description:
      "Every room's room parents in signup order, then its waitlist, then the seats still open.",
    filters: {
      format: "assignment",
      assignmentTypes: ["room_parent"],
      includeUnfilledSpots: true,
    },
  },
  {
    id: "party_volunteers",
    label: "Party volunteers",
    description:
      "Classroom party helpers, with the parties they signed up for. This role has no cap and so no waitlist.",
    filters: { format: "assignment", assignmentTypes: ["party_volunteer"] },
  },
  {
    id: "classroom_committees",
    label: "Classroom committees",
    description:
      "Per-classroom committees like Meet the Masters — who covers which room, who is waiting, and which rooms still need someone.",
    filters: {
      format: "assignment",
      assignmentTypes: ["classroom_committee"],
      includeUnfilledSpots: true,
    },
  },
  {
    id: "school_committees",
    label: "School-wide committees",
    description:
      "Committees that aren't tied to a classroom, with chairs, members and waitlists.",
    filters: { format: "assignment", assignmentTypes: ["school_committee"] },
  },
  {
    id: "event_interests",
    label: "Event volunteer interest",
    description:
      "Who raised their hand for an event like Red Ribbon Week, and whether they offered to lead it.",
    filters: { format: "assignment", assignmentTypes: ["event_interest"] },
  },
  {
    id: "teachers",
    label: "Teachers",
    description: "Teachers with their assigned classroom and grade.",
    filters: { format: "assignment", assignmentTypes: ["teacher"] },
  },
  {
    id: "pta_board",
    label: "PTA Board members",
    description: "Members whose school role is PTA Board, with their position.",
    filters: { format: "member", schoolRoles: ["pta_board"] },
  },
  {
    id: "custom",
    label: "Custom…",
    description: "Pick your own format, filters and columns.",
    filters: { format: "assignment" },
  },
];

// ─── Result ────────────────────────────────────────────────────────────────

export interface MemberExportResult {
  format: MemberExportFormat;
  columns: { key: MemberExportColumnKey; label: string }[];
  rows: Record<MemberExportColumnKey, string>[];
  /** Unique, deduplicated email addresses. Unfilled-spot rows contribute none. */
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
  /** The campaign equivalent: no volunteer campaign events for `schoolYear`. */
  hasCampaignEventsForYear: boolean;
}

export interface MemberExportOptions {
  schoolYear: string;
  gradeLevels: { value: string; label: string }[];
  hasClassroomsForYear: boolean;
  /** The school's own board positions, for the position filter. */
  boardPositions: { value: string; label: string }[];
  /** This year's committees, for the committee filter. */
  committees: { value: string; label: string }[];
  /** This year's volunteer campaign events, for the event interest filter. */
  campaignEvents: { value: string; label: string }[];
}

// ─── Filter introspection (shared by the dialog's empty-state copy) ─────────

/** The assignment types a set of filters can possibly match. */
export function effectiveAssignmentTypes(
  filters: MemberExportFilters
): AssignmentType[] {
  let types =
    filters.assignmentTypes && filters.assignmentTypes.length > 0
      ? filters.assignmentTypes
      : ASSIGNMENT_TYPE_ORDER;

  // A committee or campaign filter scopes the export to its own kind of
  // assignment rather than ANDing against every other row and matching nothing.
  const scoped: AssignmentType[] = [];
  if ((filters.committeeIds?.length ?? 0) > 0) {
    scoped.push(...COMMITTEE_ASSIGNMENT_TYPES);
  }
  if ((filters.campaignEventIds?.length ?? 0) > 0) scoped.push("event_interest");
  if (scoped.length > 0) types = types.filter((t) => scoped.includes(t));

  // A grade can only be satisfied by something attached to a classroom.
  if ((filters.gradeLevels?.length ?? 0) > 0) {
    types = types.filter((t) => CLASSROOM_ASSIGNMENT_TYPES.includes(t));
  }

  return types;
}

/** True when the filters can only be satisfied by a classroom assignment. */
export function dependsOnClassrooms(filters: MemberExportFilters): boolean {
  const types = effectiveAssignmentTypes(filters);
  return (
    types.length > 0 && types.every((t) => CLASSROOM_ASSIGNMENT_TYPES.includes(t))
  );
}

/** True when the filters can only be satisfied by a committee membership. */
export function dependsOnCommittees(filters: MemberExportFilters): boolean {
  const types = effectiveAssignmentTypes(filters);
  return (
    types.length > 0 && types.every((t) => COMMITTEE_ASSIGNMENT_TYPES.includes(t))
  );
}

/** True when the filters can only be satisfied by a campaign event interest. */
export function dependsOnCampaigns(filters: MemberExportFilters): boolean {
  const types = effectiveAssignmentTypes(filters);
  return types.length > 0 && types.every((t) => t === "event_interest");
}
