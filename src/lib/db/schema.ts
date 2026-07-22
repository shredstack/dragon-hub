import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  decimal,
  date,
  integer,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
  customType,
  jsonb,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ─── Custom Types ────────────────────────────────────────────────────────────

// PostgreSQL tsvector type for full-text search
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// PostgreSQL pgvector type for embeddings (1536 dimensions for OpenAI text-embedding-3-small)
const vector = customType<{ data: number[] }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    if (typeof value === "string") {
      // Parse [1,2,3] format
      return JSON.parse(value.replace(/^\[/, "[").replace(/\]$/, "]"));
    }
    return value as number[];
  },
});

// ─── Auth.js Required Tables ────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// ─── Mobile App Push Notification Tokens ────────────────────────────────────

export const pushPlatformEnum = pgEnum("push_platform", ["ios", "android"]);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: pushPlatformEnum("platform").notNull(),
    deviceId: text("device_id"),
    appVersion: text("app_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("push_tokens_token_unique").on(t.token),
    index("push_tokens_user_id_idx").on(t.userId),
  ]
);

// ─── App Enums ──────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "teacher",
  "room_parent",
  "pta_board",
  "volunteer",
]);

export const eventPlanStatusEnum = pgEnum("event_plan_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "completed",
]);

export const eventPlanMemberRoleEnum = pgEnum("event_plan_member_role", [
  "lead",
  "member",
]);

export const approvalVoteEnum = pgEnum("approval_vote", [
  "approve",
  "reject",
]);

export const calendarTypeEnum = pgEnum("calendar_type", ["pta", "school"]);

export const taskTimingTagEnum = pgEnum("task_timing_tag", [
  "day_of",
  "days_before",
  "week_plus_before",
]);

export const meetingStatusEnum = pgEnum("meeting_status", [
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const meetingRsvpStatusEnum = pgEnum("meeting_rsvp_status", [
  "invited",
  "accepted",
  "declined",
  "tentative",
]);

// ─── Multi-School Enums ─────────────────────────────────────────────────────

export const schoolMembershipStatusEnum = pgEnum("school_membership_status", [
  "approved", // Active membership (set immediately on valid code)
  "expired", // Past school year, needs renewal
  "revoked", // Access blocked — the join code will not let them back in
  "removed", // Taken off the roster; free to rejoin with the code or a volunteer signup
]);

export const schoolRoleEnum = pgEnum("school_role", [
  "admin", // School Admin
  "pta_board", // PTA Board
  "member", // Regular member
]);

// ─── PTA Minutes & Knowledge Enums ─────────────────────────────────────────

export const minutesStatusEnum = pgEnum("minutes_status", [
  "pending",
  "approved",
]);

export const articleStatusEnum = pgEnum("article_status", [
  "draft",
  "published",
  "archived",
]);

export const minutesDocumentTypeEnum = pgEnum("minutes_document_type", [
  "minutes",
  "agenda",
]);

export const driveFolderTypeEnum = pgEnum("drive_folder_type", [
  "general",
  "minutes",
]);

export const ptaBoardPositionEnum = pgEnum("pta_board_position", [
  "president",
  "vice_president",
  "secretary",
  "treasurer",
  "president_elect",
  "vp_elect",
  "legislative_vp",
  "public_relations_vp",
  "membership_vp",
  "room_parent_vp",
]);

// ─── Email Campaign Enums ───────────────────────────────────────────────────

export const emailCampaignStatusEnum = pgEnum("email_campaign_status", [
  "draft",
  "review",
  "sent",
]);

export const emailAudienceEnum = pgEnum("email_audience", [
  "all",
  "pta_only",
]);

export const emailContentStatusEnum = pgEnum("email_content_status", [
  "pending",
  "included",
  "skipped",
]);

export const emailSectionTypeEnum = pgEnum("email_section_type", [
  "recurring",
  "custom",
  "calendar_summary",
]);

export const sectionPositionTypeEnum = pgEnum("section_position_type", [
  "from_start", // Position counting from beginning (0 = first, 1 = second, etc.)
  "from_end", // Position counting from end (0 = last, 1 = second-to-last, etc.)
]);

// ─── Onboarding Enums ──────────────────────────────────────────────────────

export const onboardingGuideStatusEnum = pgEnum("onboarding_guide_status", [
  "generating",
  "ready",
  "failed",
]);

// How a handoff note came to exist. AI-generated notes are drafted from raw
// bullet notes the author pasted in; they're saved as brand-new notes so an
// existing note is never overwritten by generation.
export const handoffNoteSourceEnum = pgEnum("handoff_note_source", [
  "manual",
  "ai_generated",
]);

// ─── Volunteer Signup Enums ────────────────────────────────────────────────

export const volunteerSignupSourceEnum = pgEnum("volunteer_signup_source", [
  "qr_code",
  "manual",
]);

export const volunteerSignupStatusEnum = pgEnum("volunteer_signup_status", [
  "active",
  "removed",
]);

export const volunteerRoleEnum = pgEnum("volunteer_role", [
  "room_parent",
  "party_volunteer",
]);

// ─── Volunteer Interest Campaign Enums ─────────────────────────────────────
// Campaigns are the general-PTA-events counterpart to the room parent signup:
// a board member configures a list of events, parents scan a QR code and flag
// which ones they'd consider helping with. Interest is non-binding — the actual
// time-slot commitment happens later in SignUpGenius.

export const volunteerCampaignStatusEnum = pgEnum("volunteer_campaign_status", [
  "draft",
  "active",
  "closed",
]);

export const volunteerInterestLevelEnum = pgEnum("volunteer_interest_level", [
  "interested", // "count me in if you need hands"
  "lead", // "I'd like to help run this"
]);

export const messageAccessLevelEnum = pgEnum("message_access_level", [
  "public",
  "room_parents_only",
]);

// How a document got into the document index (drive_file_index)
export const documentSourceEnum = pgEnum("document_source", [
  "google_drive", // Synced from a connected Drive folder
  "upload", // Uploaded directly to DragonHub, stored in Vercel Blob
  "drive_link", // One-off Drive file shared with the service account
]);

// Text-extraction / embedding pipeline state for a document
export const documentProcessingStatusEnum = pgEnum(
  "document_processing_status",
  ["pending", "ready", "failed"]
);

// ─── Districts Reference ─────────────────────────────────────────────────────
// Static reference table of US school districts from NCES data
// See docs/updating-district-data.md for how to update this data

export const districts = pgTable(
  "districts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateCode: text("state_code").notNull(), // e.g., "UT", "CA"
    stateName: text("state_name").notNull(), // e.g., "Utah", "California"
    name: text("name").notNull(), // e.g., "Alpine School District"
    ncesId: text("nces_id"), // NCES district ID for reference
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("districts_state_name_unique").on(table.stateCode, table.name),
  ]
);

// ─── Schools ────────────────────────────────────────────────────────────────

export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  mascot: text("mascot"),
  address: text("address"),
  state: text("state"), // For state-level PTA resources (e.g., "Utah", "California")
  district: text("district"), // School district for district-level PTA resources
  settings: text("settings"), // JSON for flexibility
  active: boolean("active").default(true),
  // School year configuration.
  // currentSchoolYear is the SINGLE source of truth for a school's active year.
  // Never read CURRENT_SCHOOL_YEAR directly in a year-scoped query — use
  // getSchoolCurrentYear(schoolId) so a rolled-over school stays consistent.
  currentSchoolYear: text("current_school_year").notNull().default("2025-2026"),
  availableSchoolYears: text("available_school_years").array(), // Years available in dropdowns
  // Volunteer signup system
  volunteerQrCode: text("volunteer_qr_code").unique(),
  volunteerSettings: jsonb("volunteer_settings").$type<{ roomParentLimit: number; partyTypes: string[]; enabled: boolean }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
});

export const schoolMemberships = pgTable(
  "school_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: schoolRoleEnum("role").notNull().default("member"),
    boardPosition: ptaBoardPositionEnum("board_position"),
    schoolYear: text("school_year").notNull(),
    status: schoolMembershipStatusEnum("status").notNull().default("approved"),
    invitedBy: uuid("invited_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    renewedFrom: uuid("renewed_from"), // FK to previous membership for tracking renewals
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("school_memberships_unique").on(
      table.schoolId,
      table.userId,
      table.schoolYear
    ),
  ]
);

export const superAdmins = pgTable("super_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedBy: uuid("granted_by").references(() => users.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow(),
  notes: text("notes"),
});

// ─── Classrooms ─────────────────────────────────────────────────────────────

// ─── DLI Groups ─────────────────────────────────────────────────────────────
// School-level configuration for Dual Language Immersion classroom groups

export const dliGroups = pgTable(
  "dli_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g., "Red - Chinese Homeroom"
    language: text("language"), // e.g., "Chinese", "Spanish"
    color: text("color"), // Optional hex color for UI badges
    sortOrder: integer("sort_order").default(0),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("dli_groups_school_name_unique").on(table.schoolId, table.name),
  ]
);

export const classrooms = pgTable("classrooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").references(() => schools.id), // Will be NOT NULL after migration
  name: text("name").notNull(),
  gradeLevel: text("grade_level"),
  teacherEmail: text("teacher_email"),
  schoolYear: text("school_year").notNull(),
  active: boolean("active").default(true),
  // Some "classrooms" are really internal groups (e.g. the PTA Board) that
  // borrow the classroom message board / roster plumbing. They should never
  // show up on the public volunteer sign-up page.
  excludeFromSignup: boolean("exclude_from_signup").default(false),
  // DLI (Dual Language Immersion) support
  isDli: boolean("is_dli").default(false),
  dliGroupId: uuid("dli_group_id").references(() => dliGroups.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const classroomMembers = pgTable(
  "classroom_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("classroom_members_unique").on(
      table.classroomId,
      table.userId
    ),
  ]
);

export const classroomMessages = pgTable("classroom_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  classroomId: uuid("classroom_id")
    .notNull()
    .references(() => classrooms.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id),
  message: text("message").notNull(),
  accessLevel: messageAccessLevelEnum("access_level").default("public").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const classroomTasks = pgTable("classroom_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  classroomId: uuid("classroom_id")
    .notNull()
    .references(() => classrooms.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completed: boolean("completed").default(false),
  assignedTo: uuid("assigned_to").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Volunteer Hours ────────────────────────────────────────────────────────

export const volunteerHours = pgTable("volunteer_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").references(() => schools.id), // Will be NOT NULL after migration
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  eventName: text("event_name").notNull(),
  hours: decimal("hours", { precision: 5, scale: 2 }).notNull(),
  date: date("date").notNull(),
  category: text("category"),
  notes: text("notes"),
  approved: boolean("approved").default(false),
  approvedBy: uuid("approved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Calendar Events ────────────────────────────────────────────────────────

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").references(() => schools.id), // Will be NOT NULL after migration
  googleEventId: text("google_event_id").unique(),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  location: text("location"),
  calendarSource: text("calendar_source"),
  eventType: text("event_type"),
  classroomId: uuid("classroom_id").references(() => classrooms.id),
  lastSynced: timestamp("last_synced", { withTimezone: true }).defaultNow(),
  // PTA board enhancement fields
  ptaDescription: text("pta_description"),
  ptaDescriptionUpdatedBy: uuid("pta_description_updated_by").references(
    () => users.id
  ),
  ptaDescriptionUpdatedAt: timestamp("pta_description_updated_at", {
    withTimezone: true,
  }),
});

// ─── Event Flyers ────────────────────────────────────────────────────────────

export const eventFlyers = pgTable("event_flyers", {
  id: uuid("id").primaryKey().defaultRandom(),
  calendarEventId: uuid("calendar_event_id")
    .notNull()
    .references(() => calendarEvents.id, { onDelete: "cascade" }),
  blobUrl: text("blob_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  sortOrder: integer("sort_order").default(0),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Budget ─────────────────────────────────────────────────────────────────

export const budgetCategories = pgTable("budget_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").references(() => schools.id), // Will be NOT NULL after migration
  name: text("name").notNull(),
  allocatedAmount: decimal("allocated_amount", { precision: 10, scale: 2 }),
  schoolYear: text("school_year").notNull(),
  sheetRowId: text("sheet_row_id"),
  lastSynced: timestamp("last_synced", { withTimezone: true }).defaultNow(),
  embedding: vector("embedding"), // pgvector embedding for semantic search
});

export const budgetTransactions = pgTable("budget_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").references(() => schools.id), // Will be NOT NULL after migration
  categoryId: uuid("category_id").references(() => budgetCategories.id),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  date: date("date").notNull(),
  sheetRowId: text("sheet_row_id"),
  lastSynced: timestamp("last_synced", { withTimezone: true }).defaultNow(),
});

// ─── Fundraisers ────────────────────────────────────────────────────────────

export const fundraisers = pgTable("fundraisers", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").references(() => schools.id), // Will be NOT NULL after migration
  auction32Id: text("auction_32_id").unique(),
  name: text("name").notNull(),
  goalAmount: decimal("goal_amount", { precision: 10, scale: 2 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  active: boolean("active").default(true),
  lastSynced: timestamp("last_synced", { withTimezone: true }).defaultNow(),
  embedding: vector("embedding"), // pgvector embedding for semantic search
});

export const fundraiserStats = pgTable("fundraiser_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  fundraiserId: uuid("fundraiser_id")
    .notNull()
    .references(() => fundraisers.id),
  totalRaised: decimal("total_raised", { precision: 10, scale: 2 }),
  totalDonors: integer("total_donors"),
  snapshotTime: timestamp("snapshot_time", {
    withTimezone: true,
  }).defaultNow(),
});

// ─── School Integrations ───────────────────────────────────────────────────

export const schoolCalendarIntegrations = pgTable(
  "school_calendar_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull(),
    name: text("name"),
    calendarType: calendarTypeEnum("calendar_type").default("pta"),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("school_calendar_unique").on(table.schoolId, table.calendarId),
  ]
);

export const schoolDriveIntegrations = pgTable(
  "school_drive_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull(),
    name: text("name"),
    folderType: driveFolderTypeEnum("folder_type").default("general"),
    maxDepth: integer("max_depth").default(5), // 0 = no subfolders, 1-5 = depth levels
    schoolYear: text("school_year"), // Optional school year for this folder's documents
    active: boolean("active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("school_drive_unique").on(table.schoolId, table.folderId),
  ]
);

export const schoolGoogleIntegrations = pgTable("school_google_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .unique()
    .references(() => schools.id, { onDelete: "cascade" }),
  serviceAccountEmail: text("service_account_email").notNull(),
  privateKey: text("private_key").notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
});

export const schoolBudgetIntegrations = pgTable("school_budget_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .unique()
    .references(() => schools.id, { onDelete: "cascade" }),
  sheetId: text("sheet_id").notNull(),
  name: text("name"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
});

// ─── Room Parents ──────────────────────────────────────────────────────────

export const roomParents = pgTable("room_parents", {
  id: uuid("id").primaryKey().defaultRandom(),
  classroomId: uuid("classroom_id")
    .notNull()
    .references(() => classrooms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Volunteer Signups ─────────────────────────────────────────────────────
// Tracks both room parents and party volunteers from QR code signup or manual entry

export const volunteerSignups = pgTable(
  "volunteer_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    role: volunteerRoleEnum("role").notNull(),
    partyTypes: text("party_types").array(), // ['halloween', 'valentines', etc.]
    signupSource: volunteerSignupSourceEnum("signup_source")
      .notNull()
      .default("qr_code"),
    status: volunteerSignupStatusEnum("status").notNull().default("active"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: uuid("removed_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("volunteer_signups_unique_active").on(
      table.classroomId,
      table.email,
      table.role
    ),
  ]
);

// ─── Knowledge Articles ─────────────────────────────────────────────────────

export const knowledgeArticles = pgTable(
  "knowledge_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary"),
    body: text("body").notNull(),
    category: text("category"),
    tags: text("tags").array(),
    status: articleStatusEnum("status").default("draft").notNull(),
    googleDriveUrl: text("google_drive_url"),
    sourceMinutesId: uuid("source_minutes_id").references(() => ptaMinutes.id, {
      onDelete: "set null",
    }),
    aiGenerated: boolean("ai_generated").default(false),
    schoolYear: text("school_year"),
    createdBy: uuid("created_by").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    embedding: vector("embedding"), // pgvector embedding for semantic search
  },
  (table) => [
    uniqueIndex("knowledge_articles_slug_unique").on(table.schoolId, table.slug),
  ]
);

// ─── Event Plans ───────────────────────────────────────────────────────────

export const eventPlans = pgTable("event_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").references(() => schools.id), // Will be NOT NULL after migration
  title: text("title").notNull(),
  description: text("description"),
  eventType: text("event_type"),
  // Which recurring event this is a year's instance of. This is the spine of
  // year-over-year knowledge transfer: contacts, tips, and estimates live on
  // the catalog entry, and each year's plan inherits them.
  eventCatalogId: uuid("event_catalog_id").references(
    (): AnyPgColumn => eventCatalog.id,
    { onDelete: "set null" }
  ),
  // Set when the organizer explicitly said "this isn't a recurring event".
  // Distinguishes a deliberate one-off from a plan nobody has categorized yet.
  isOneOff: boolean("is_one_off").default(false).notNull(),
  eventDate: timestamp("event_date", { withTimezone: true }),
  location: text("location"),
  budget: text("budget"),
  tags: text("tags").array(),
  schoolYear: text("school_year").notNull(),
  status: eventPlanStatusEnum("status").default("draft").notNull(),
  calendarEventId: uuid("calendar_event_id").references(
    () => calendarEvents.id
  ),
  // Where volunteers claim actual time slots once the event firms up.
  // DragonHub tracks intent; SignUpGenius tracks commitment.
  signupGeniusUrl: text("signup_genius_url"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  embedding: vector("embedding"), // pgvector embedding for semantic search
});

export const eventPlanMembers = pgTable(
  "event_plan_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventPlanId: uuid("event_plan_id")
      .notNull()
      .references(() => eventPlans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: eventPlanMemberRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("event_plan_members_unique").on(
      table.eventPlanId,
      table.userId
    ),
  ]
);

export const eventPlanTasks = pgTable("event_plan_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventPlanId: uuid("event_plan_id")
    .notNull()
    .references(() => eventPlans.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  completed: boolean("completed").default(false),
  assignedTo: uuid("assigned_to").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  sortOrder: integer("sort_order").default(0),
  timingTag: taskTimingTagEnum("timing_tag"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const eventPlanMessages = pgTable("event_plan_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventPlanId: uuid("event_plan_id")
    .notNull()
    .references(() => eventPlans.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id),
  message: text("message").notNull(),
  isAiResponse: boolean("is_ai_response").default(false),
  aiSources: text("ai_sources"), // JSON stringified SourceUsed[]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const eventPlanApprovals = pgTable(
  "event_plan_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventPlanId: uuid("event_plan_id")
      .notNull()
      .references(() => eventPlans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vote: approvalVoteEnum("vote").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("event_plan_approvals_unique").on(
      table.eventPlanId,
      table.userId
    ),
  ]
);

export const eventPlanResources = pgTable("event_plan_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventPlanId: uuid("event_plan_id")
    .notNull()
    .references(() => eventPlans.id, { onDelete: "cascade" }),
  knowledgeArticleId: uuid("knowledge_article_id").references(
    () => knowledgeArticles.id,
    { onDelete: "set null" }
  ),
  // Set when this resource is an uploaded/linked document in the document index
  documentId: uuid("document_id").references(() => driveFileIndex.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  url: text("url"),
  notes: text("notes"),
  addedBy: uuid("added_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const eventPlanAiRecommendations = pgTable(
  "event_plan_ai_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventPlanId: uuid("event_plan_id")
      .notNull()
      .references(() => eventPlans.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    additionalContext: text("additional_context"),
    response: text("response").notNull(), // JSON stringified EventRecommendation
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  }
);

// ─── Event Plan Meetings ────────────────────────────────────────────────────

export const eventPlanMeetings = pgTable("event_plan_meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventPlanId: uuid("event_plan_id")
    .notNull()
    .references(() => eventPlans.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location").notNull(), // Address or general location
  meetingRoom: text("meeting_room"), // Optional room name (e.g., "Room 101", "Library")
  meetingDate: timestamp("meeting_date", { withTimezone: true }).notNull(),
  startTime: text("start_time").notNull(), // Display string like "7:00 PM"
  endTime: text("end_time"), // Optional end time
  topic: text("topic").notNull(),
  agenda: text("agenda"), // Optional markdown/plain text
  status: meetingStatusEnum("status").default("scheduled").notNull(),
  googleDocUrl: text("google_doc_url"), // URL after notes export to Drive
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const eventPlanMeetingParticipants = pgTable(
  "event_plan_meeting_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => eventPlanMeetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rsvpStatus: meetingRsvpStatusEnum("rsvp_status").default("invited").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("meeting_participants_unique").on(table.meetingId, table.userId),
  ]
);

export const eventPlanMeetingNotes = pgTable("event_plan_meeting_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => eventPlanMeetings.id, { onDelete: "cascade" }),
  content: text("content").notNull(), // Meeting notes body — stored as HTML
  summary: text("summary"), // Optional AI-generated summary
  actionItems: text("action_items"), // JSON stringified array of action items
  attendees: text("attendees"), // JSON stringified array of attendee names
  recordedBy: uuid("recorded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const eventPlanMeetingImages = pgTable("event_plan_meeting_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => eventPlanMeetings.id, { onDelete: "cascade" }),
  blobUrl: text("blob_url").notNull(), // Vercel Blob URL
  fileName: text("file_name").notNull(),
  rawTranscription: text("raw_transcription"), // What the AI initially read
  correctedTranscription: text("corrected_transcription"), // What the user confirmed
  organizedContent: text("organized_content"), // Final organized HTML
  confidence: text("confidence"), // "high" | "medium" | "low"
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── Document Index ─────────────────────────────────────────────────────────
// Table name is historical: this is the school-wide document index. It holds
// files synced from connected Google Drive folders (source: "google_drive"),
// documents uploaded directly to DragonHub (source: "upload"), and one-off
// Google Drive links shared with the service account (source: "drive_link").
// Everything in here feeds the same full-text and semantic search paths.

export const driveFileIndex = pgTable(
  "drive_file_index",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id").references(
      () => schoolDriveIntegrations.id,
      { onDelete: "set null" }
    ), // Link to source integration
    integrationName: text("integration_name"), // Denormalized for search vector
    fileId: text("file_id").notNull(), // Drive file id, or "upload:<uuid>" for uploads
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    parentFolderId: text("parent_folder_id"),
    textContent: text("text_content"),
    searchVector: tsvector("search_vector"), // Full-text search vector (filename A, integration name B, content C)
    lastIndexedAt: timestamp("last_indexed_at", {
      withTimezone: true,
    }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    embedding: vector("embedding"), // pgvector embedding for semantic search

    // ── Uploaded / linked document fields ──
    source: documentSourceEnum("source").default("google_drive").notNull(),
    blobUrl: text("blob_url"), // Vercel Blob URL for uploads
    webUrl: text("web_url"), // Canonical external link (drive_link source)
    fileSize: integer("file_size"),
    schoolYear: text("school_year"), // Enables the same year-boost Drive integrations get
    title: text("title"), // User-supplied label; falls back to fileName
    description: text("description"),
    processingStatus: documentProcessingStatusEnum("processing_status")
      .default("ready")
      .notNull(),
    processingError: text("processing_error"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),

    // ── Optional attachment points (a document may be standalone) ──
    eventPlanId: uuid("event_plan_id").references(() => eventPlans.id, {
      onDelete: "set null",
    }),
    meetingId: uuid("meeting_id").references(() => eventPlanMeetings.id, {
      onDelete: "set null",
    }),
    knowledgeArticleId: uuid("knowledge_article_id").references(
      () => knowledgeArticles.id,
      { onDelete: "set null" }
    ),
  },
  (table) => [
    uniqueIndex("drive_file_index_unique").on(table.schoolId, table.fileId),
    index("drive_file_index_source_idx").on(table.schoolId, table.source),
    index("drive_file_index_event_plan_idx").on(table.eventPlanId),
    index("drive_file_index_meeting_idx").on(table.meetingId),
  ]
);

// ─── PTA Minutes ───────────────────────────────────────────────────────────

export const ptaMinutes = pgTable(
  "pta_minutes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    googleFileId: text("google_file_id").notNull(),
    googleDriveUrl: text("google_drive_url").notNull(),
    fileName: text("file_name").notNull(),
    documentType: minutesDocumentTypeEnum("document_type").default("minutes").notNull(),
    meetingDate: date("meeting_date"),
    meetingMonth: integer("meeting_month"), // 1-12
    meetingYear: integer("meeting_year"), // e.g., 2025
    schoolYear: text("school_year").notNull(),
    textContent: text("text_content"),
    aiSummary: text("ai_summary"),
    // Rich AI analysis fields
    aiKeyItems: text("ai_key_items").array(), // Key discussion points
    aiActionItems: text("ai_action_items").array(), // Action items with owners
    aiImprovements: text("ai_improvements").array(), // Suggestions for next time
    tags: text("tags").array(), // Topic tags
    aiExtractedDate: date("ai_extracted_date"), // Date extracted from content by AI
    dateConfidence: text("date_confidence"), // "high" | "medium" | "low"
    status: minutesStatusEnum("status").default("pending").notNull(),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("pta_minutes_unique").on(table.schoolId, table.googleFileId),
  ]
);

// ─── Tags ───────────────────────────────────────────────────────────────────
// Shared tags used across minutes, knowledge articles, event plans, etc.

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // Normalized lowercase name
    displayName: text("display_name").notNull(), // User-friendly display name
    usageCount: integer("usage_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("tags_unique").on(table.schoolId, table.name),
  ]
);

// ─── PTA Agendas ───────────────────────────────────────────────────────────

export const ptaAgendas = pgTable("pta_agendas", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  targetMonth: integer("target_month").notNull(),
  targetYear: integer("target_year").notNull(),
  content: text("content").notNull(),
  aiGeneratedContent: text("ai_generated_content"),
  sourceMinutesIds: uuid("source_minutes_ids").array(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Email Campaigns ────────────────────────────────────────────────────────

export const emailCampaigns = pgTable("email_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  weekStart: date("week_start").notNull(),
  weekEnd: date("week_end").notNull(),
  status: emailCampaignStatusEnum("status").notNull().default("draft"),
  ptaHtml: text("pta_html"),
  schoolHtml: text("school_html"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentBy: uuid("sent_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const emailSections = pgTable("email_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => emailCampaigns.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  linkUrl: text("link_url"),
  linkText: text("link_text"),
  imageUrl: text("image_url"),
  imageAlt: text("image_alt"),
  imageLinkUrl: text("image_link_url"),
  sectionType: emailSectionTypeEnum("section_type").notNull().default("custom"),
  recurringKey: text("recurring_key"),
  audience: emailAudienceEnum("audience").notNull().default("all"),
  sortOrder: integer("sort_order").notNull().default(0),
  submittedBy: uuid("submitted_by").references(() => users.id),
  sourceContentItemId: uuid("source_content_item_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const emailContentItems = pgTable("email_content_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  linkUrl: text("link_url"),
  linkText: text("link_text"),
  audience: emailAudienceEnum("audience").notNull().default("all"),
  targetDate: date("target_date"),
  status: emailContentStatusEnum("status").notNull().default("pending"),
  includedInCampaignId: uuid("included_in_campaign_id").references(
    () => emailCampaigns.id
  ),
  submittedBy: uuid("submitted_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const emailContentImages = pgTable("email_content_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  contentItemId: uuid("content_item_id")
    .notNull()
    .references(() => emailContentItems.id, { onDelete: "cascade" }),
  blobUrl: text("blob_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  linkUrl: text("link_url"),
  sortOrder: integer("sort_order").default(0),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const emailRecurringSections = pgTable(
  "email_recurring_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    bodyTemplate: text("body_template").notNull(),
    linkUrl: text("link_url"),
    linkText: text("link_text"),
    imageUrl: text("image_url"),
    audience: emailAudienceEnum("audience").notNull().default("all"),
    positionType: sectionPositionTypeEnum("position_type")
      .notNull()
      .default("from_end"),
    positionIndex: integer("position_index").notNull().default(0),
    defaultSortOrder: integer("default_sort_order").notNull().default(99),
    active: boolean("active").default(true),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("email_recurring_sections_school_key").on(
      table.schoolId,
      table.key
    ),
  ]
);

// ─── Onboarding Hub ─────────────────────────────────────────────────────────

export const onboardingResources = pgTable("onboarding_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  position: ptaBoardPositionEnum("position"), // NULL = all positions
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  category: text("category"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const onboardingChecklistItems = pgTable("onboarding_checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  position: ptaBoardPositionEnum("position"), // NULL = all positions
  title: text("title").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// State-level onboarding resources (managed by super admins)
export const stateOnboardingResources = pgTable("state_onboarding_resources", {
  id: uuid("id").primaryKey().defaultRandom(),
  state: text("state").notNull(), // e.g., "Utah", "California"
  position: ptaBoardPositionEnum("position"), // NULL = all positions
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  category: text("category"),
  sortOrder: integer("sort_order").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// District-level onboarding resources (managed by super admins)
export const districtOnboardingResources = pgTable(
  "district_onboarding_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    state: text("state").notNull(),
    district: text("district").notNull(), // e.g., "Alpine School District"
    position: ptaBoardPositionEnum("position"), // NULL = all positions
    title: text("title").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    category: text("category"),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  }
);

export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    checklistItemId: uuid("checklist_item_id")
      .notNull()
      .references(() => onboardingChecklistItems.id, { onDelete: "cascade" }),
    schoolYear: text("school_year").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("onboarding_progress_unique").on(
      table.userId,
      table.checklistItemId,
      table.schoolYear
    ),
  ]
);

// Handoff notes are append-only history: a position accumulates many notes
// across years (and more than one per year, since a role can change hands or an
// author can write several). Nothing here is unique-constrained — the newest
// note is simply the default one shown, and every prior note stays readable.
export const boardHandoffNotes = pgTable(
  "board_handoff_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    position: ptaBoardPositionEnum("position").notNull(),
    schoolYear: text("school_year").notNull(),
    fromUserId: uuid("from_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    toUserId: uuid("to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title"), // Optional label to tell same-year notes apart
    source: handoffNoteSourceEnum("source").default("manual").notNull(),
    rawNotes: text("raw_notes"), // Original bullets an AI-generated note came from
    keyAccomplishments: text("key_accomplishments"),
    ongoingProjects: text("ongoing_projects"),
    tipsAndAdvice: text("tips_and_advice"),
    importantContacts: text("important_contacts"),
    filesAndResources: text("files_and_resources"), // JSON array
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    embedding: vector("embedding"), // pgvector embedding for semantic search
  },
  (table) => [
    index("board_handoff_notes_position_idx").on(
      table.schoolId,
      table.position,
      table.schoolYear
    ),
  ]
);

// Cached AI roll-up of every handoff note for a position, so an incoming board
// member can skim years of accumulated advice as bullets instead of reading
// each note end to end. Regenerated on demand; one row per school + position.
export const boardHandoffSummaries = pgTable(
  "board_handoff_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    position: ptaBoardPositionEnum("position").notNull(),
    content: text("content"), // JSON stringified HandoffSummaryContent
    sourceNoteIds: text("source_note_ids"), // JSON array of note ids summarized
    noteCount: integer("note_count").default(0).notNull(),
    yearRange: text("year_range"), // e.g. "2022-2023 – 2025-2026"
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    generatedBy: uuid("generated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("board_handoff_summaries_unique").on(
      table.schoolId,
      table.position
    ),
  ]
);

export const onboardingGuides = pgTable(
  "onboarding_guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    position: ptaBoardPositionEnum("position").notNull(),
    schoolYear: text("school_year").notNull(),
    status: onboardingGuideStatusEnum("status").default("generating").notNull(),
    content: text("content"),
    sourcesUsed: text("sources_used"), // JSON stringified SourceUsed[]
    knowledgeArticleId: uuid("knowledge_article_id").references(
      () => knowledgeArticles.id,
      { onDelete: "set null" }
    ),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    generatedBy: uuid("generated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("onboarding_guides_unique").on(
      table.schoolId,
      table.position,
      table.schoolYear
    ),
  ]
);

// One row per *recurring* event the school runs — "Field Day", not "Field Day
// 2026". Identity is the slug; a year's instance is an event_plans row pointing
// back here. This is where knowledge that outlives a school year is kept.
export const eventCatalog = pgTable(
  "event_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    // Identity key, derived from the title. Previously event_type held this
    // job while also being asked to be a category, which let two Field Days
    // coexist under different type strings.
    slug: text("slug").notNull(),
    // Category from EVENT_CATEGORIES — "fundraiser", "party", etc.
    category: text("category"),
    /** @deprecated Superseded by slug (identity) and category. */
    eventType: text("event_type"),
    title: text("title").notNull(),
    description: text("description"),
    /** @deprecated Superseded by typicalMonth + timingNote. */
    typicalTiming: text("typical_timing"),
    // 1-12. Sortable and filterable, unlike the free text it replaces.
    typicalMonth: integer("typical_month"),
    // Nuance a month can't carry: "second week of", "week before spring break".
    timingNote: text("timing_note"),
    estimatedVolunteers: text("estimated_volunteers"),
    estimatedBudget: text("estimated_budget"),
    keyTasks: text("key_tasks"), // JSON array
    tips: text("tips"), // JSON array
    tags: text("tags").array(),
    // ─── Volunteer-facing copy ──────────────────────────────────────────
    // What a parent deciding whether to sign up needs to know. It lives here
    // rather than on each volunteer campaign because it's a fact about the
    // event, not about one year's recruiting push — "what you'd actually be
    // doing at Field Day" is the same answer every spring.
    volunteerResponsibilities: text("volunteer_responsibilities"),
    timeCommitment: text("time_commitment"),
    // Visual hook so events stand out on a signup page. Emoji is the
    // zero-effort default; imageUrl points at a media library blob.
    iconEmoji: text("icon_emoji"),
    imageUrl: text("image_url"),
    relatedPositions: ptaBoardPositionEnum("related_positions").array(),
    sourceEventPlanIds: uuid("source_event_plan_ids").array(),
    // Retired events stay for history but drop out of the planning picker.
    isActive: boolean("is_active").default(true).notNull(),
    aiGenerated: boolean("ai_generated").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("event_catalog_slug_unique").on(table.schoolId, table.slug),
  ]
);

// ─── Contacts ──────────────────────────────────────────────────────────────
// A school-wide directory of the people and vendors a PTA actually calls: the
// bounce house company, the bulk cookie place, the district facilities desk.
// Deliberately school-scoped rather than event-scoped — the bounce house vendor
// serves both Field Day and Back to School Night, and their phone number should
// only ever be wrong in one place.

export const schoolContacts = pgTable(
  "school_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    organization: text("organization"),
    // Category from CONTACT_CATEGORIES — "vendor", "school_staff", etc.
    category: text("category"),
    phone: text("phone"),
    email: text("email"),
    website: text("website"),
    address: text("address"),
    notes: text("notes"),
    tags: text("tags").array(),
    // Stamped when a plan that links this contact is completed, so a directory
    // can show "last used 2024-2025" and stale vendors are obvious.
    lastUsedYear: text("last_used_year"),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("school_contacts_school_idx").on(table.schoolId)]
);

// Joins a contact to either a recurring event (evergreen — inherited by every
// future year) or a single year's plan (this year only, promotable to the
// catalog). Exactly one of the two targets is set, enforced by a CHECK.
export const eventContactLinks = pgTable(
  "event_contact_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => schoolContacts.id, { onDelete: "cascade" }),
    eventCatalogId: uuid("event_catalog_id").references(() => eventCatalog.id, {
      onDelete: "cascade",
    }),
    eventPlanId: uuid("event_plan_id").references(() => eventPlans.id, {
      onDelete: "cascade",
    }),
    // What this contact is for in the context of this event: "bounce houses",
    // "bulk cookies". The single most useful field on the whole join.
    usedFor: text("used_for"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("event_contact_links_catalog_idx").on(table.eventCatalogId),
    index("event_contact_links_plan_idx").on(table.eventPlanId),
    index("event_contact_links_contact_idx").on(table.contactId),
    // The same contact twice on one event is always a mistake. Two PARTIAL
    // uniques rather than one composite, because the unused target column is
    // NULL and NULLs never collide. These exist in 0033; declaring them here
    // keeps `drizzle-kit generate` from proposing to drop them.
    uniqueIndex("event_contact_links_catalog_unique")
      .on(table.contactId, table.eventCatalogId)
      .where(sql`${table.eventCatalogId} IS NOT NULL`),
    uniqueIndex("event_contact_links_plan_unique")
      .on(table.contactId, table.eventPlanId)
      .where(sql`${table.eventPlanId} IS NOT NULL`),
    check(
      "event_contact_links_one_target",
      sql`(${table.eventCatalogId} IS NOT NULL AND ${table.eventPlanId} IS NULL) OR (${table.eventCatalogId} IS NULL AND ${table.eventPlanId} IS NOT NULL)`
    ),
  ]
);

// ─── Event Plan Wrap-Ups ───────────────────────────────────────────────────
// Captured when a plan completes, then folded back into the catalog entry.
// Without this the catalog decays into whatever someone typed once, years ago.

export const eventPlanWrapUps = pgTable(
  "event_plan_wrap_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventPlanId: uuid("event_plan_id")
      .notNull()
      .references(() => eventPlans.id, { onDelete: "cascade" }),
    whatWorked: text("what_worked"),
    whatToChange: text("what_to_change"),
    actualCost: text("actual_cost"),
    actualVolunteers: text("actual_volunteers"),
    // True once the notes have been merged into the catalog entry's tips and
    // estimates, so a second save doesn't duplicate the tips.
    appliedToCatalog: boolean("applied_to_catalog").default(false).notNull(),
    submittedBy: uuid("submitted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("event_plan_wrap_ups_plan_unique").on(table.eventPlanId),
  ]
);

export const eventInterest = pgTable(
  "event_interest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventCatalogId: uuid("event_catalog_id")
      .notNull()
      .references(() => eventCatalog.id, { onDelete: "cascade" }),
    schoolYear: text("school_year").notNull(),
    interestLevel: text("interest_level").notNull(), // "lead", "help", "observe"
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("event_interest_unique").on(
      table.userId,
      table.eventCatalogId,
      table.schoolYear
    ),
  ]
);

// ─── Volunteer Interest Campaigns ──────────────────────────────────────────
// A campaign is one QR-code-backed public page listing events parents can
// express interest in. Any board member can run one (Fun Run VP, Hospitality,
// etc.), so a school can have several active at once.

export const volunteerCampaigns = pgTable(
  "volunteer_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    qrCode: text("qr_code").notNull().unique(),
    title: text("title").notNull(),
    // Editorial blurb shown above the event list — this is the flyer copy.
    intro: text("intro"),
    schoolYear: text("school_year").notNull(),
    status: volunteerCampaignStatusEnum("status").notNull().default("draft"),
    // When true, this campaign's events are appended to the room parent signup
    // page so a Back to School Night scan captures both in one pass. Only one
    // campaign per school/year should have this on (enforced in the action).
    showOnRoomParentSignup: boolean("show_on_room_parent_signup")
      .notNull()
      .default(false),
    // Board position running the campaign, for "who do I ask about this?"
    ownerPosition: ptaBoardPositionEnum("owner_position"),
    contactEmail: text("contact_email"),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("volunteer_campaigns_school_year_idx").on(
      table.schoolId,
      table.schoolYear
    ),
  ]
);

export const volunteerCampaignEvents = pgTable(
  "volunteer_campaign_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => volunteerCampaigns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    // Free-text "what you'd actually be doing" — the thing parents ask about.
    volunteerResponsibilities: text("volunteer_responsibilities"),
    // Human-readable, not a real date: "Late October", "Second week of May".
    typicalTiming: text("typical_timing"),
    timeCommitment: text("time_commitment"),
    // Visual hook so events stand out on the signup page. Emoji is the
    // zero-effort default; imageUrl points at a media library blob.
    iconEmoji: text("icon_emoji"),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    // Provenance only — editing campaign copy never mutates the catalog.
    eventCatalogId: uuid("event_catalog_id").references(() => eventCatalog.id, {
      onDelete: "set null",
    }),
    eventPlanId: uuid("event_plan_id").references(() => eventPlans.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("volunteer_campaign_events_campaign_idx").on(table.campaignId),
  ]
);

// Non-binding interest from a parent. userId is nullable because most rows are
// created by people with no account yet — same pattern as volunteer_signups.
export const volunteerInterests = pgTable(
  "volunteer_interests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => volunteerCampaigns.id, { onDelete: "cascade" }),
    campaignEventId: uuid("campaign_event_id")
      .notNull()
      .references(() => volunteerCampaignEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    interestLevel: volunteerInterestLevelEnum("interest_level")
      .notNull()
      .default("interested"),
    notes: text("notes"),
    schoolYear: text("school_year").notNull(),
    signupSource: volunteerSignupSourceEnum("signup_source")
      .notNull()
      .default("qr_code"),
    status: volunteerSignupStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: uuid("removed_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("volunteer_interests_unique").on(
      table.campaignEventId,
      table.email
    ),
    index("volunteer_interests_campaign_idx").on(table.campaignId),
  ]
);

// ─── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  schoolMemberships: many(schoolMemberships),
  classroomMemberships: many(classroomMembers),
  volunteerHours: many(volunteerHours),
  classroomMessages: many(classroomMessages),
  eventPlanMemberships: many(eventPlanMembers),
}));

// ─── School Relations ───────────────────────────────────────────────────────

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  creator: one(users, {
    fields: [schools.createdBy],
    references: [users.id],
  }),
  memberships: many(schoolMemberships),
  dliGroups: many(dliGroups),
  classrooms: many(classrooms),
  volunteerHours: many(volunteerHours),
  calendarEvents: many(calendarEvents),
  volunteerCampaigns: many(volunteerCampaigns),
  budgetCategories: many(budgetCategories),
  budgetTransactions: many(budgetTransactions),
  fundraisers: many(fundraisers),
  knowledgeArticles: many(knowledgeArticles),
  eventPlans: many(eventPlans),
  ptaMinutes: many(ptaMinutes),
  ptaAgendas: many(ptaAgendas),
  tags: many(tags),
  calendarIntegrations: many(schoolCalendarIntegrations),
  driveIntegrations: many(schoolDriveIntegrations),
  googleIntegration: one(schoolGoogleIntegrations),
  budgetIntegration: one(schoolBudgetIntegrations),
  driveFileIndex: many(driveFileIndex),
  emailCampaigns: many(emailCampaigns),
  emailContentItems: many(emailContentItems),
  emailRecurringSections: many(emailRecurringSections),
  // Onboarding
  onboardingResources: many(onboardingResources),
  onboardingChecklistItems: many(onboardingChecklistItems),
  onboardingProgress: many(onboardingProgress),
  boardHandoffNotes: many(boardHandoffNotes),
  onboardingGuides: many(onboardingGuides),
  eventCatalog: many(eventCatalog),
  contacts: many(schoolContacts),
  eventInterest: many(eventInterest),
  mediaLibrary: many(mediaLibrary),
  volunteerSignups: many(volunteerSignups),
}));

export const schoolMembershipsRelations = relations(
  schoolMemberships,
  ({ one }) => ({
    school: one(schools, {
      fields: [schoolMemberships.schoolId],
      references: [schools.id],
    }),
    user: one(users, {
      fields: [schoolMemberships.userId],
      references: [users.id],
    }),
    inviter: one(users, {
      fields: [schoolMemberships.invitedBy],
      references: [users.id],
      relationName: "membershipInviter",
    }),
  })
);

export const superAdminsRelations = relations(superAdmins, ({ one }) => ({
  user: one(users, {
    fields: [superAdmins.userId],
    references: [users.id],
  }),
  granter: one(users, {
    fields: [superAdmins.grantedBy],
    references: [users.id],
    relationName: "superAdminGranter",
  }),
}));

export const schoolCalendarIntegrationsRelations = relations(
  schoolCalendarIntegrations,
  ({ one }) => ({
    school: one(schools, {
      fields: [schoolCalendarIntegrations.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [schoolCalendarIntegrations.createdBy],
      references: [users.id],
    }),
  })
);

export const schoolDriveIntegrationsRelations = relations(
  schoolDriveIntegrations,
  ({ one, many }) => ({
    school: one(schools, {
      fields: [schoolDriveIntegrations.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [schoolDriveIntegrations.createdBy],
      references: [users.id],
    }),
    indexedFiles: many(driveFileIndex),
  })
);

export const schoolGoogleIntegrationsRelations = relations(
  schoolGoogleIntegrations,
  ({ one }) => ({
    school: one(schools, {
      fields: [schoolGoogleIntegrations.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [schoolGoogleIntegrations.createdBy],
      references: [users.id],
    }),
  })
);

export const schoolBudgetIntegrationsRelations = relations(
  schoolBudgetIntegrations,
  ({ one }) => ({
    school: one(schools, {
      fields: [schoolBudgetIntegrations.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [schoolBudgetIntegrations.createdBy],
      references: [users.id],
    }),
  })
);

export const dliGroupsRelations = relations(dliGroups, ({ one, many }) => ({
  school: one(schools, {
    fields: [dliGroups.schoolId],
    references: [schools.id],
  }),
  classrooms: many(classrooms),
}));

export const classroomsRelations = relations(classrooms, ({ one, many }) => ({
  school: one(schools, {
    fields: [classrooms.schoolId],
    references: [schools.id],
  }),
  dliGroup: one(dliGroups, {
    fields: [classrooms.dliGroupId],
    references: [dliGroups.id],
  }),
  members: many(classroomMembers),
  messages: many(classroomMessages),
  tasks: many(classroomTasks),
  calendarEvents: many(calendarEvents),
  roomParents: many(roomParents),
  volunteerSignups: many(volunteerSignups),
}));

export const classroomMembersRelations = relations(
  classroomMembers,
  ({ one }) => ({
    classroom: one(classrooms, {
      fields: [classroomMembers.classroomId],
      references: [classrooms.id],
    }),
    user: one(users, {
      fields: [classroomMembers.userId],
      references: [users.id],
    }),
  })
);

export const classroomMessagesRelations = relations(
  classroomMessages,
  ({ one }) => ({
    classroom: one(classrooms, {
      fields: [classroomMessages.classroomId],
      references: [classrooms.id],
    }),
    author: one(users, {
      fields: [classroomMessages.authorId],
      references: [users.id],
    }),
  })
);

export const classroomTasksRelations = relations(
  classroomTasks,
  ({ one }) => ({
    classroom: one(classrooms, {
      fields: [classroomTasks.classroomId],
      references: [classrooms.id],
    }),
    creator: one(users, {
      fields: [classroomTasks.createdBy],
      references: [users.id],
      relationName: "taskCreator",
    }),
    assignee: one(users, {
      fields: [classroomTasks.assignedTo],
      references: [users.id],
      relationName: "taskAssignee",
    }),
  })
);

export const roomParentsRelations = relations(roomParents, ({ one }) => ({
  classroom: one(classrooms, {
    fields: [roomParents.classroomId],
    references: [classrooms.id],
  }),
  user: one(users, {
    fields: [roomParents.userId],
    references: [users.id],
  }),
}));

export const volunteerSignupsRelations = relations(
  volunteerSignups,
  ({ one }) => ({
    school: one(schools, {
      fields: [volunteerSignups.schoolId],
      references: [schools.id],
    }),
    classroom: one(classrooms, {
      fields: [volunteerSignups.classroomId],
      references: [classrooms.id],
    }),
    user: one(users, {
      fields: [volunteerSignups.userId],
      references: [users.id],
    }),
    creator: one(users, {
      fields: [volunteerSignups.createdBy],
      references: [users.id],
      relationName: "volunteerSignupCreator",
    }),
    remover: one(users, {
      fields: [volunteerSignups.removedBy],
      references: [users.id],
      relationName: "volunteerSignupRemover",
    }),
  })
);

export const volunteerHoursRelations = relations(volunteerHours, ({ one }) => ({
  school: one(schools, {
    fields: [volunteerHours.schoolId],
    references: [schools.id],
  }),
  user: one(users, {
    fields: [volunteerHours.userId],
    references: [users.id],
  }),
}));

export const calendarEventsRelations = relations(
  calendarEvents,
  ({ one, many }) => ({
    school: one(schools, {
      fields: [calendarEvents.schoolId],
      references: [schools.id],
    }),
    classroom: one(classrooms, {
      fields: [calendarEvents.classroomId],
      references: [classrooms.id],
    }),
    flyers: many(eventFlyers),
    ptaDescriptionUpdater: one(users, {
      fields: [calendarEvents.ptaDescriptionUpdatedBy],
      references: [users.id],
      relationName: "ptaDescriptionUpdater",
    }),
  })
);

export const eventFlyersRelations = relations(eventFlyers, ({ one }) => ({
  calendarEvent: one(calendarEvents, {
    fields: [eventFlyers.calendarEventId],
    references: [calendarEvents.id],
  }),
  uploader: one(users, {
    fields: [eventFlyers.uploadedBy],
    references: [users.id],
  }),
}));

export const budgetCategoriesRelations = relations(
  budgetCategories,
  ({ one, many }) => ({
    school: one(schools, {
      fields: [budgetCategories.schoolId],
      references: [schools.id],
    }),
    transactions: many(budgetTransactions),
  })
);

export const budgetTransactionsRelations = relations(
  budgetTransactions,
  ({ one }) => ({
    school: one(schools, {
      fields: [budgetTransactions.schoolId],
      references: [schools.id],
    }),
    category: one(budgetCategories, {
      fields: [budgetTransactions.categoryId],
      references: [budgetCategories.id],
    }),
  })
);

export const fundraisersRelations = relations(fundraisers, ({ one, many }) => ({
  school: one(schools, {
    fields: [fundraisers.schoolId],
    references: [schools.id],
  }),
  stats: many(fundraiserStats),
}));

export const fundraiserStatsRelations = relations(
  fundraiserStats,
  ({ one }) => ({
    fundraiser: one(fundraisers, {
      fields: [fundraiserStats.fundraiserId],
      references: [fundraisers.id],
    }),
  })
);

export const knowledgeArticlesRelations = relations(
  knowledgeArticles,
  ({ one }) => ({
    school: one(schools, {
      fields: [knowledgeArticles.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [knowledgeArticles.createdBy],
      references: [users.id],
    }),
    sourceMinutes: one(ptaMinutes, {
      fields: [knowledgeArticles.sourceMinutesId],
      references: [ptaMinutes.id],
    }),
  })
);

// ─── PTA Minutes Relations ─────────────────────────────────────────────────

export const ptaMinutesRelations = relations(ptaMinutes, ({ one, many }) => ({
  school: one(schools, {
    fields: [ptaMinutes.schoolId],
    references: [schools.id],
  }),
  approver: one(users, {
    fields: [ptaMinutes.approvedBy],
    references: [users.id],
  }),
  generatedArticles: many(knowledgeArticles),
}));

export const ptaAgendasRelations = relations(ptaAgendas, ({ one }) => ({
  school: one(schools, {
    fields: [ptaAgendas.schoolId],
    references: [schools.id],
  }),
  creator: one(users, {
    fields: [ptaAgendas.createdBy],
    references: [users.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one }) => ({
  school: one(schools, {
    fields: [tags.schoolId],
    references: [schools.id],
  }),
}));

// ─── Event Plan Relations ──────────────────────────────────────────────────

export const volunteerCampaignsRelations = relations(
  volunteerCampaigns,
  ({ one, many }) => ({
    school: one(schools, {
      fields: [volunteerCampaigns.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [volunteerCampaigns.createdBy],
      references: [users.id],
    }),
    events: many(volunteerCampaignEvents),
    interests: many(volunteerInterests),
  })
);

export const volunteerCampaignEventsRelations = relations(
  volunteerCampaignEvents,
  ({ one, many }) => ({
    campaign: one(volunteerCampaigns, {
      fields: [volunteerCampaignEvents.campaignId],
      references: [volunteerCampaigns.id],
    }),
    catalogEntry: one(eventCatalog, {
      fields: [volunteerCampaignEvents.eventCatalogId],
      references: [eventCatalog.id],
    }),
    eventPlan: one(eventPlans, {
      fields: [volunteerCampaignEvents.eventPlanId],
      references: [eventPlans.id],
    }),
    interests: many(volunteerInterests),
  })
);

export const volunteerInterestsRelations = relations(
  volunteerInterests,
  ({ one }) => ({
    school: one(schools, {
      fields: [volunteerInterests.schoolId],
      references: [schools.id],
    }),
    campaign: one(volunteerCampaigns, {
      fields: [volunteerInterests.campaignId],
      references: [volunteerCampaigns.id],
    }),
    campaignEvent: one(volunteerCampaignEvents, {
      fields: [volunteerInterests.campaignEventId],
      references: [volunteerCampaignEvents.id],
    }),
    user: one(users, {
      fields: [volunteerInterests.userId],
      references: [users.id],
    }),
  })
);

export const eventPlansRelations = relations(
  eventPlans,
  ({ one, many }) => ({
    school: one(schools, {
      fields: [eventPlans.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [eventPlans.createdBy],
      references: [users.id],
      relationName: "eventPlanCreator",
    }),
    calendarEvent: one(calendarEvents, {
      fields: [eventPlans.calendarEventId],
      references: [calendarEvents.id],
    }),
    catalogEntry: one(eventCatalog, {
      fields: [eventPlans.eventCatalogId],
      references: [eventCatalog.id],
    }),
    members: many(eventPlanMembers),
    tasks: many(eventPlanTasks),
    messages: many(eventPlanMessages),
    approvals: many(eventPlanApprovals),
    resources: many(eventPlanResources),
    aiRecommendations: many(eventPlanAiRecommendations),
    meetings: many(eventPlanMeetings),
    contactLinks: many(eventContactLinks),
    wrapUp: many(eventPlanWrapUps),
  })
);

export const eventPlanMembersRelations = relations(
  eventPlanMembers,
  ({ one }) => ({
    eventPlan: one(eventPlans, {
      fields: [eventPlanMembers.eventPlanId],
      references: [eventPlans.id],
    }),
    user: one(users, {
      fields: [eventPlanMembers.userId],
      references: [users.id],
    }),
  })
);

export const eventPlanTasksRelations = relations(
  eventPlanTasks,
  ({ one }) => ({
    eventPlan: one(eventPlans, {
      fields: [eventPlanTasks.eventPlanId],
      references: [eventPlans.id],
    }),
    assignee: one(users, {
      fields: [eventPlanTasks.assignedTo],
      references: [users.id],
      relationName: "eventTaskAssignee",
    }),
    creator: one(users, {
      fields: [eventPlanTasks.createdBy],
      references: [users.id],
      relationName: "eventTaskCreator",
    }),
  })
);

export const eventPlanMessagesRelations = relations(
  eventPlanMessages,
  ({ one }) => ({
    eventPlan: one(eventPlans, {
      fields: [eventPlanMessages.eventPlanId],
      references: [eventPlans.id],
    }),
    author: one(users, {
      fields: [eventPlanMessages.authorId],
      references: [users.id],
    }),
  })
);

export const eventPlanApprovalsRelations = relations(
  eventPlanApprovals,
  ({ one }) => ({
    eventPlan: one(eventPlans, {
      fields: [eventPlanApprovals.eventPlanId],
      references: [eventPlans.id],
    }),
    user: one(users, {
      fields: [eventPlanApprovals.userId],
      references: [users.id],
    }),
  })
);

export const eventPlanResourcesRelations = relations(
  eventPlanResources,
  ({ one }) => ({
    eventPlan: one(eventPlans, {
      fields: [eventPlanResources.eventPlanId],
      references: [eventPlans.id],
    }),
    knowledgeArticle: one(knowledgeArticles, {
      fields: [eventPlanResources.knowledgeArticleId],
      references: [knowledgeArticles.id],
    }),
    document: one(driveFileIndex, {
      fields: [eventPlanResources.documentId],
      references: [driveFileIndex.id],
    }),
    addedByUser: one(users, {
      fields: [eventPlanResources.addedBy],
      references: [users.id],
    }),
  })
);

export const eventPlanAiRecommendationsRelations = relations(
  eventPlanAiRecommendations,
  ({ one }) => ({
    eventPlan: one(eventPlans, {
      fields: [eventPlanAiRecommendations.eventPlanId],
      references: [eventPlans.id],
    }),
    creator: one(users, {
      fields: [eventPlanAiRecommendations.createdBy],
      references: [users.id],
    }),
  })
);

export const eventPlanMeetingsRelations = relations(
  eventPlanMeetings,
  ({ one, many }) => ({
    eventPlan: one(eventPlans, {
      fields: [eventPlanMeetings.eventPlanId],
      references: [eventPlans.id],
    }),
    creator: one(users, {
      fields: [eventPlanMeetings.createdBy],
      references: [users.id],
      relationName: "meetingCreator",
    }),
    participants: many(eventPlanMeetingParticipants),
    notes: many(eventPlanMeetingNotes),
    images: many(eventPlanMeetingImages),
    documents: many(driveFileIndex),
  })
);

export const eventPlanMeetingParticipantsRelations = relations(
  eventPlanMeetingParticipants,
  ({ one }) => ({
    meeting: one(eventPlanMeetings, {
      fields: [eventPlanMeetingParticipants.meetingId],
      references: [eventPlanMeetings.id],
    }),
    user: one(users, {
      fields: [eventPlanMeetingParticipants.userId],
      references: [users.id],
    }),
  })
);

export const eventPlanMeetingNotesRelations = relations(
  eventPlanMeetingNotes,
  ({ one }) => ({
    meeting: one(eventPlanMeetings, {
      fields: [eventPlanMeetingNotes.meetingId],
      references: [eventPlanMeetings.id],
    }),
    recorder: one(users, {
      fields: [eventPlanMeetingNotes.recordedBy],
      references: [users.id],
      relationName: "meetingNoteRecorder",
    }),
  })
);

export const eventPlanMeetingImagesRelations = relations(
  eventPlanMeetingImages,
  ({ one }) => ({
    meeting: one(eventPlanMeetings, {
      fields: [eventPlanMeetingImages.meetingId],
      references: [eventPlanMeetings.id],
    }),
    uploader: one(users, {
      fields: [eventPlanMeetingImages.uploadedBy],
      references: [users.id],
    }),
  })
);

export const driveFileIndexRelations = relations(driveFileIndex, ({ one }) => ({
  school: one(schools, {
    fields: [driveFileIndex.schoolId],
    references: [schools.id],
  }),
  integration: one(schoolDriveIntegrations, {
    fields: [driveFileIndex.integrationId],
    references: [schoolDriveIntegrations.id],
  }),
  uploader: one(users, {
    fields: [driveFileIndex.uploadedBy],
    references: [users.id],
  }),
  eventPlan: one(eventPlans, {
    fields: [driveFileIndex.eventPlanId],
    references: [eventPlans.id],
  }),
  meeting: one(eventPlanMeetings, {
    fields: [driveFileIndex.meetingId],
    references: [eventPlanMeetings.id],
  }),
  knowledgeArticle: one(knowledgeArticles, {
    fields: [driveFileIndex.knowledgeArticleId],
    references: [knowledgeArticles.id],
  }),
}));

// ─── Email Campaign Relations ───────────────────────────────────────────────

export const emailCampaignsRelations = relations(
  emailCampaigns,
  ({ one, many }) => ({
    school: one(schools, {
      fields: [emailCampaigns.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [emailCampaigns.createdBy],
      references: [users.id],
      relationName: "emailCampaignCreator",
    }),
    sender: one(users, {
      fields: [emailCampaigns.sentBy],
      references: [users.id],
      relationName: "emailCampaignSender",
    }),
    sections: many(emailSections),
    contentItems: many(emailContentItems),
  })
);

export const emailSectionsRelations = relations(emailSections, ({ one }) => ({
  campaign: one(emailCampaigns, {
    fields: [emailSections.campaignId],
    references: [emailCampaigns.id],
  }),
  submitter: one(users, {
    fields: [emailSections.submittedBy],
    references: [users.id],
  }),
}));

export const emailContentItemsRelations = relations(
  emailContentItems,
  ({ one, many }) => ({
    school: one(schools, {
      fields: [emailContentItems.schoolId],
      references: [schools.id],
    }),
    submitter: one(users, {
      fields: [emailContentItems.submittedBy],
      references: [users.id],
    }),
    campaign: one(emailCampaigns, {
      fields: [emailContentItems.includedInCampaignId],
      references: [emailCampaigns.id],
    }),
    images: many(emailContentImages),
  })
);

export const emailContentImagesRelations = relations(
  emailContentImages,
  ({ one }) => ({
    contentItem: one(emailContentItems, {
      fields: [emailContentImages.contentItemId],
      references: [emailContentItems.id],
    }),
    uploader: one(users, {
      fields: [emailContentImages.uploadedBy],
      references: [users.id],
    }),
  })
);

export const emailRecurringSectionsRelations = relations(
  emailRecurringSections,
  ({ one }) => ({
    school: one(schools, {
      fields: [emailRecurringSections.schoolId],
      references: [schools.id],
    }),
    updater: one(users, {
      fields: [emailRecurringSections.updatedBy],
      references: [users.id],
    }),
  })
);

// ─── Onboarding Relations ───────────────────────────────────────────────────

export const onboardingResourcesRelations = relations(
  onboardingResources,
  ({ one }) => ({
    school: one(schools, {
      fields: [onboardingResources.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [onboardingResources.createdBy],
      references: [users.id],
    }),
  })
);

export const onboardingChecklistItemsRelations = relations(
  onboardingChecklistItems,
  ({ one, many }) => ({
    school: one(schools, {
      fields: [onboardingChecklistItems.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [onboardingChecklistItems.createdBy],
      references: [users.id],
    }),
    progress: many(onboardingProgress),
  })
);

export const onboardingProgressRelations = relations(
  onboardingProgress,
  ({ one }) => ({
    school: one(schools, {
      fields: [onboardingProgress.schoolId],
      references: [schools.id],
    }),
    user: one(users, {
      fields: [onboardingProgress.userId],
      references: [users.id],
    }),
    checklistItem: one(onboardingChecklistItems, {
      fields: [onboardingProgress.checklistItemId],
      references: [onboardingChecklistItems.id],
    }),
  })
);

export const boardHandoffNotesRelations = relations(
  boardHandoffNotes,
  ({ one }) => ({
    school: one(schools, {
      fields: [boardHandoffNotes.schoolId],
      references: [schools.id],
    }),
    fromUser: one(users, {
      fields: [boardHandoffNotes.fromUserId],
      references: [users.id],
      relationName: "handoffFromUser",
    }),
    toUser: one(users, {
      fields: [boardHandoffNotes.toUserId],
      references: [users.id],
      relationName: "handoffToUser",
    }),
  })
);

export const boardHandoffSummariesRelations = relations(
  boardHandoffSummaries,
  ({ one }) => ({
    school: one(schools, {
      fields: [boardHandoffSummaries.schoolId],
      references: [schools.id],
    }),
    generator: one(users, {
      fields: [boardHandoffSummaries.generatedBy],
      references: [users.id],
    }),
  })
);

export const onboardingGuidesRelations = relations(
  onboardingGuides,
  ({ one }) => ({
    school: one(schools, {
      fields: [onboardingGuides.schoolId],
      references: [schools.id],
    }),
    generator: one(users, {
      fields: [onboardingGuides.generatedBy],
      references: [users.id],
    }),
    knowledgeArticle: one(knowledgeArticles, {
      fields: [onboardingGuides.knowledgeArticleId],
      references: [knowledgeArticles.id],
    }),
  })
);

export const eventCatalogRelations = relations(
  eventCatalog,
  ({ one, many }) => ({
    school: one(schools, {
      fields: [eventCatalog.schoolId],
      references: [schools.id],
    }),
    interests: many(eventInterest),
    plans: many(eventPlans),
    contactLinks: many(eventContactLinks),
  })
);

export const schoolContactsRelations = relations(
  schoolContacts,
  ({ one, many }) => ({
    school: one(schools, {
      fields: [schoolContacts.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [schoolContacts.createdBy],
      references: [users.id],
    }),
    eventLinks: many(eventContactLinks),
  })
);

export const eventContactLinksRelations = relations(
  eventContactLinks,
  ({ one }) => ({
    contact: one(schoolContacts, {
      fields: [eventContactLinks.contactId],
      references: [schoolContacts.id],
    }),
    catalogEntry: one(eventCatalog, {
      fields: [eventContactLinks.eventCatalogId],
      references: [eventCatalog.id],
    }),
    eventPlan: one(eventPlans, {
      fields: [eventContactLinks.eventPlanId],
      references: [eventPlans.id],
    }),
  })
);

export const eventPlanWrapUpsRelations = relations(
  eventPlanWrapUps,
  ({ one }) => ({
    eventPlan: one(eventPlans, {
      fields: [eventPlanWrapUps.eventPlanId],
      references: [eventPlans.id],
    }),
    submitter: one(users, {
      fields: [eventPlanWrapUps.submittedBy],
      references: [users.id],
    }),
  })
);

export const eventInterestRelations = relations(eventInterest, ({ one }) => ({
  school: one(schools, {
    fields: [eventInterest.schoolId],
    references: [schools.id],
  }),
  user: one(users, {
    fields: [eventInterest.userId],
    references: [users.id],
  }),
  catalogEntry: one(eventCatalog, {
    fields: [eventInterest.eventCatalogId],
    references: [eventCatalog.id],
  }),
}));

// ─── Media Library ──────────────────────────────────────────────────────────

export const mediaLibrary = pgTable("media_library", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  blobUrl: text("blob_url").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  altText: text("alt_text"),
  linkUrl: text("link_url"),
  tags: text("tags").array(),
  reusable: boolean("reusable").notNull().default(true),
  sourceType: text("source_type"), // "email" | "calendar" | "event" | "direct"
  sourceId: uuid("source_id"), // Reference to original entity if applicable
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const mediaLibraryRelations = relations(mediaLibrary, ({ one }) => ({
  school: one(schools, {
    fields: [mediaLibrary.schoolId],
    references: [schools.id],
  }),
  uploader: one(users, {
    fields: [mediaLibrary.uploadedBy],
    references: [users.id],
  }),
}));

export const stateOnboardingResourcesRelations = relations(
  stateOnboardingResources,
  ({ one }) => ({
    creator: one(users, {
      fields: [stateOnboardingResources.createdBy],
      references: [users.id],
    }),
  })
);

export const districtOnboardingResourcesRelations = relations(
  districtOnboardingResources,
  ({ one }) => ({
    creator: one(users, {
      fields: [districtOnboardingResources.createdBy],
      references: [users.id],
    }),
  })
);
