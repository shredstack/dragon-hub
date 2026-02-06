export const CURRENT_SCHOOL_YEAR = "2025-2026";

// School-level roles (for school_memberships)
export const SCHOOL_ROLES = {
  admin: "School Admin",
  pta_board: "PTA Board",
  member: "Member",
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

// Resource source types - used for calendars, knowledge articles, events, etc.
export const RESOURCE_SOURCES = {
  pta: "PTA",
  school: "School",
} as const;

export type ResourceSource = keyof typeof RESOURCE_SOURCES;
