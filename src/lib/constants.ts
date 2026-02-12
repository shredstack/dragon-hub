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

// PTA Board positions (for pta_board role members)
export const PTA_BOARD_POSITIONS = {
  president: "President",
  vice_president: "Vice President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  president_elect: "President Elect",
  vp_elect: "VP Elect",
  legislative_vp: "Legislative VP",
  public_relations_vp: "Public Relations VP",
  membership_vp: "Membership VP",
  room_parent_vp: "Room Parent VP",
} as const;

export const SCHOOL_MEMBERSHIP_STATUSES = {
  approved: "Approved",
  expired: "Expired",
  revoked: "Revoked",
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

export const EVENT_PLAN_STATUSES = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
} as const;

export const EVENT_PLAN_MEMBER_ROLES = {
  lead: "Lead",
  member: "Member",
} as const;

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
