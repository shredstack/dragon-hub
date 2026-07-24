import { STANDARD_BOARD_POSITIONS } from "@/lib/board-positions-shared";

export const CURRENT_SCHOOL_YEAR = "2025-2026";

// Generate school year options going back 5 years from current
export function getSchoolYearOptions(): string[] {
  const [startYear] = CURRENT_SCHOOL_YEAR.split("-").map(Number);
  const years: string[] = [];
  for (let i = 0; i <= 5; i++) {
    const year = startYear - i;
    years.push(`${year}-${year + 1}`);
  }
  return years;
}

export const SCHOOL_YEAR_OPTIONS = getSchoolYearOptions();

// School-level roles (for school_memberships)
export const SCHOOL_ROLES = {
  admin: "School Admin",
  pta_board: "PTA Board",
  member: "Member",
} as const;

/**
 * Labels for the standard PTA slate.
 *
 * @deprecated Positions are per-school data now (`board_positions`). A school
 * can rename these, deactivate them, or add its own, so this map is only
 * correct for a school that has never customized its board. Use
 * `getBoardPositionLabels(schoolId)` from `@/lib/board-positions` in server
 * components and pass the result down, or `positionLabel()` from
 * `@/lib/board-positions-shared` in client components.
 *
 * Kept as the fallback for contexts with no school in scope (super admin
 * screens that file regional resources against standard slugs).
 */
export const PTA_BOARD_POSITIONS: Record<string, string> =
  Object.fromEntries(
    STANDARD_BOARD_POSITIONS.map((p) => [p.slug, p.label])
  );

export const SCHOOL_MEMBERSHIP_STATUSES = {
  approved: "Approved",
  expired: "Expired",
  revoked: "Revoked",
  removed: "Removed",
} as const;

// Classroom-level roles (for classroom_members)
export const USER_ROLES = {
  teacher: "Teacher",
  room_parent: "Room Parent",
  pta_board: "PTA Board",
  volunteer: "Volunteer",
} as const;

export const VOLUNTEER_CATEGORIES = [
  "Classroom Support",
  "Event Help",
  "Fundraising",
  "Field Trip",
  "Library",
  "Office Help",
  "Other",
] as const;

export const KNOWLEDGE_CATEGORIES = [
  "Events",
  "Fundraising",
  "Classroom Activities",
  "Policies",
  "Budget",
  "Other",
] as const;

export const EVENT_TYPES = [
  "classroom",
  "pta",
  "school",
] as const;

/**
 * What kind of thing an event is, for the recurring-event catalog.
 *
 * Deliberately richer than EVENT_TYPES: that one answers "whose event is this?"
 * (classroom vs PTA vs school), which is a different question from "what
 * happens at it?". A Valentine's party and a fun run are both PTA events.
 */
export const EVENT_CATEGORIES = {
  fundraiser: "Fundraiser",
  party: "Class Party",
  assembly: "Assembly",
  athletic: "Athletic / Field Day",
  social: "Community Social",
  meeting: "Meeting",
  service: "Service Project",
  staff_appreciation: "Staff Appreciation",
  performance: "Performance",
  other: "Other",
} as const;

export const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

export function monthLabel(month: number | null | undefined): string | null {
  return MONTHS.find((m) => m.value === month)?.label ?? null;
}

/**
 * Buckets for the school contact directory. "Vendor" is the one that carries
 * most of the weight — bounce houses, bulk cookies, printers, DJs.
 */
export const CONTACT_CATEGORIES = {
  vendor: "Vendor",
  school_staff: "School Staff",
  district: "District",
  donor: "Donor / Sponsor",
  community: "Community Partner",
  other: "Other",
} as const;

export const EVENT_PLAN_STATUSES = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
} as const;

/**
 * Statuses a plan can't be deleted from.
 *
 * An approved plan is a board decision with money and volunteers attached to
 * it, and a completed one is the record next year's planners inherit. Neither
 * is something a single click should be able to erase — the way out of an
 * approved plan is to reject or complete it, not to delete the history.
 *
 * Shared so the server rule in deleteEventPlan and the button the client shows
 * can't drift apart.
 */
export const UNDELETABLE_EVENT_PLAN_STATUSES: readonly string[] = [
  "approved",
  "completed",
];

export function canDeleteEventPlanStatus(status: string): boolean {
  return !UNDELETABLE_EVENT_PLAN_STATUSES.includes(status);
}

export const EVENT_PLAN_MEMBER_ROLES = {
  lead: "Lead",
  member: "Member",
} as const;

/**
 * The two kinds of lead a PTA event has. Both hold the same permissions; the
 * distinction is who the person is, and it matters because only the board lead
 * counts against a board member's three-or-four events for the year.
 */
export const EVENT_PLAN_LEAD_TYPES = {
  board: "Board Lead",
  committee_chair: "Committee Chair",
} as const;

/** Events each board member is expected to own in a school year. */
export const BOARD_LEAD_TARGET = { min: 3, max: 4 } as const;

export const APPROVAL_THRESHOLD = 2;

export const TASK_TIMING_TAGS = {
  day_of: "Day-of",
  days_before: "Days Before",
  week_plus_before: "1+ Week Before",
} as const;

export const TASK_TIMING_TAG_COLORS = {
  day_of: "destructive",
  days_before: "warning",
  week_plus_before: "success",
} as const;

// Resource source types - used for calendars, knowledge articles, events, etc.
export const RESOURCE_SOURCES = {
  pta: "PTA",
  school: "School",
} as const;

export type ResourceSource = keyof typeof RESOURCE_SOURCES;

// Onboarding resource categories
export const ONBOARDING_RESOURCE_CATEGORIES = [
  "PTA Board Role Specific Trainings",
  "Handbooks",
  "Tools",
  "General Trainings",
  "Contact Info",
] as const;

export type OnboardingResourceCategory =
  (typeof ONBOARDING_RESOURCE_CATEGORIES)[number];

// US States for dropdowns
// Grade levels supported by DragonHub
export const GRADE_LEVELS = [
  "Kindergarten",
  "1st Grade",
  "2nd Grade",
  "3rd Grade",
  "4th Grade",
  "5th Grade",
  "6th Grade",
  "7th Grade",
  "8th Grade",
  "9th Grade",
  "10th Grade",
  "11th Grade",
  "12th Grade",
] as const;

export type GradeLevel = (typeof GRADE_LEVELS)[number];

// US States for dropdowns
export const US_STATES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
} as const;
