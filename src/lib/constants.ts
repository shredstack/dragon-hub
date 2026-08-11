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

// ─── Category sets ──────────────────────────────────────────────────────────
// Each is a slug→label record: the slug is stored, the label is rendered
// through `categoryLabel()` (src/lib/categories.ts). Never store the label —
// that is what made these unrenameable before. Slugs are as immutable as board
// position slugs, and for the same reason: they are what existing rows are
// filed under.

/**
 * What *kind* of work an entry in volunteer_hours was — not which event it was
 * for, which is `event_name`. "PTA Business" is the bucket for board work with
 * no event attached: meetings, budget nights, the hour spent chasing a vendor.
 */
export const VOLUNTEER_CATEGORIES = {
  classroom_support: "Classroom Support",
  event_help: "Event Help",
  fundraising: "Fundraising",
  field_trip: "Field Trip",
  library: "Library",
  office_help: "Office Help",
  pta_business: "PTA Business",
  other: "Other",
} as const;

/**
 * Buckets for the Knowledge Base.
 *
 * Wider than the six a human would pick from a blank page, because the AI
 * extractors write here too: `minutes-to-articles` had its own private list
 * containing Procedures, Communications, Volunteers and Onboarding, and filed
 * real articles under them that then matched nothing in the picker or the
 * filter. Those four are folded in here rather than mapped away, and both
 * generators now read this set, so the vocabulary can't fork again.
 */
export const KNOWLEDGE_CATEGORIES = {
  events: "Events",
  fundraising: "Fundraising",
  classroom_activities: "Classroom Activities",
  policies: "Policies",
  procedures: "Procedures",
  budget: "Budget",
  volunteers: "Volunteers",
  communications: "Communications",
  onboarding: "Onboarding",
  other: "Other",
} as const;

// ─── Notifications ──────────────────────────────────────────────────────────

/**
 * Which settings-page section a notification type appears under — and, not
 * coincidentally, the Android notification channel it is delivered on. The
 * keys are the channel ids created in `push-primer.tsx`, so `push.ts` derives
 * the FCM `channelId` from a type's `group` with no second mapping to keep in
 * step. A parent who mutes "Conversations" in Android's own app settings has
 * muted exactly the group the preferences page calls Conversations.
 */
export const NOTIFICATION_GROUPS = {
  conversations: "Conversations",
  tasks: "Tasks and assignments",
  volunteering: "Volunteering",
  board: "Board and approvals",
  announcements: "Announcements",
} as const;

export type NotificationGroup = keyof typeof NOTIFICATION_GROUPS;

export interface NotificationTypeSpec {
  label: string;
  /** Second line in the preferences UI — say what triggers it, concretely. */
  description: string;
  group: NotificationGroup;
  /** Defaults when the user has no `notification_preferences` row. */
  defaults: { inApp: boolean; push: boolean };
  /**
   * Delivered even inside quiet hours. Reserve for things that are useless
   * late: a board announcement is not one, a waitlist promotion at 9pm the
   * night before the event is.
   */
  bypassQuietHours?: boolean;
  /** Only offered to PTA board members in the preferences UI. */
  boardOnly?: boolean;
}

/**
 * Every kind of notification the app can send.
 *
 * A category set per the rules above: a slug→spec record where **the slug is
 * what's stored**, in a `text` column rather than a `pgEnum`. That is
 * deliberate — adding a type must not require a migration, and
 * `notification_preferences` is sparse (a missing row means "use `defaults`")
 * so it needs no backfill either.
 */
export const NOTIFICATION_TYPES = {
  classroom_message: {
    label: "Classroom messages",
    group: "conversations",
    defaults: { inApp: true, push: true },
    description: "Someone posts on a classroom message board you're on.",
  },
  committee_message: {
    label: "Committee messages",
    group: "conversations",
    defaults: { inApp: true, push: true },
    description: "Someone posts on a committee board you're on.",
  },
  event_plan_message: {
    label: "Event discussions",
    group: "conversations",
    defaults: { inApp: true, push: true },
    description: "Someone posts in an event plan you're helping with.",
  },
  mention: {
    label: "Mentions",
    group: "conversations",
    defaults: { inApp: true, push: true },
    description: "Someone types @your name in a message.",
    bypassQuietHours: true,
  },

  task_assigned: {
    label: "Tasks assigned to you",
    group: "tasks",
    defaults: { inApp: true, push: true },
    description: "A classroom, committee, or event task is assigned to you.",
  },
  task_due_soon: {
    label: "Task reminders",
    group: "tasks",
    defaults: { inApp: true, push: true },
    description: "A task you own is due tomorrow.",
  },

  signup_promoted: {
    label: "Off the waitlist",
    group: "volunteering",
    defaults: { inApp: true, push: true },
    description: "A spot opened and you moved into it.",
    bypassQuietHours: true,
  },
  shift_reminder: {
    label: "Shift reminders",
    group: "volunteering",
    defaults: { inApp: true, push: true },
    description: "A shift or committee slot you claimed is tomorrow.",
  },
  hours_approved: {
    label: "Volunteer hours",
    group: "volunteering",
    defaults: { inApp: true, push: false },
    description: "The board approves or returns hours you logged.",
  },

  approval_requested: {
    label: "Approvals waiting",
    group: "board",
    defaults: { inApp: true, push: true },
    description: "An event plan is submitted and needs board votes.",
    boardOnly: true,
  },
  approval_decided: {
    label: "Approval results",
    group: "board",
    defaults: { inApp: true, push: true },
    description: "A plan you lead is approved or sent back.",
  },
  new_member_pending: {
    label: "Members waiting",
    group: "board",
    defaults: { inApp: true, push: false },
    description: "Someone joins with a code that needs approval.",
    boardOnly: true,
  },
  feedback_reply: {
    label: "Feedback replies",
    group: "board",
    defaults: { inApp: true, push: true },
    description: "Someone replies on a feedback thread you're in.",
  },

  announcement: {
    label: "School announcements",
    group: "announcements",
    defaults: { inApp: true, push: true },
    description: "The PTA board sends a message to the whole school.",
  },
} as const satisfies Record<string, NotificationTypeSpec>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

/** Slug→label, for `categoryLabel()` / `<CategoryBadge>`. */
export const NOTIFICATION_TYPE_LABELS: Record<string, string> =
  Object.fromEntries(
    Object.entries(NOTIFICATION_TYPES).map(([slug, spec]) => [slug, spec.label])
  );

export function isNotificationType(
  value: string | null | undefined
): value is NotificationType {
  return !!value && value in NOTIFICATION_TYPES;
}

/**
 * The spec for a stored type slug, or null for one that no longer exists.
 *
 * Rows outlive the taxonomy: a type removed from the record above still has
 * inbox rows filed under it. Callers fall back rather than crash, which is the
 * same bargain `categoryLabel()` makes.
 */
export function notificationTypeSpec(
  type: string
): NotificationTypeSpec | null {
  return isNotificationType(type) ? NOTIFICATION_TYPES[type] : null;
}

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

/**
 * Approval is the *end* of planning an event, not the start of it — a plan
 * lives in `draft` while its tasks, budget and volunteers are being worked out,
 * and only goes up for a board vote once it's essentially planned. So the label
 * is "Planning": "Draft" made a plan with real work behind it read like an
 * abandoned stub.
 *
 * The slug stays `draft` (it's the stored enum value); only the label moved.
 */
export const EVENT_PLAN_STATUSES = {
  draft: "Planning",
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

/** Labels for `committee_member_role`, for rosters and exports. */
export const COMMITTEE_MEMBER_ROLES = {
  chair: "Chair",
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
export const ONBOARDING_RESOURCE_CATEGORIES = {
  role_trainings: "PTA Board Role Specific Trainings",
  handbooks: "Handbooks",
  tools: "Tools",
  general_trainings: "General Trainings",
  contact_info: "Contact Info",
} as const;

export type OnboardingResourceCategory =
  keyof typeof ONBOARDING_RESOURCE_CATEGORIES;

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
