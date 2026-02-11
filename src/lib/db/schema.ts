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
  uniqueIndex,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ─── Custom Types ────────────────────────────────────────────────────────────

// PostgreSQL tsvector type for full-text search
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
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

// ─── Multi-School Enums ─────────────────────────────────────────────────────

export const schoolMembershipStatusEnum = pgEnum("school_membership_status", [
  "approved", // Active membership (set immediately on valid code)
  "expired", // Past school year, needs renewal
  "revoked", // Admin removed access
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

// ─── Onboarding Enums ──────────────────────────────────────────────────────

export const onboardingGuideStatusEnum = pgEnum("onboarding_guide_status", [
  "generating",
  "ready",
  "failed",
]);

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

export const classrooms = pgTable("classrooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").references(() => schools.id), // Will be NOT NULL after migration
  name: text("name").notNull(),
  gradeLevel: text("grade_level"),
  teacherEmail: text("teacher_email"),
  schoolYear: text("school_year").notNull(),
  active: boolean("active").default(true),
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
  eventDate: timestamp("event_date", { withTimezone: true }),
  location: text("location"),
  budget: text("budget"),
  schoolYear: text("school_year").notNull(),
  status: eventPlanStatusEnum("status").default("draft").notNull(),
  calendarEventId: uuid("calendar_event_id").references(
    () => calendarEvents.id
  ),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
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

// ─── Drive File Index ───────────────────────────────────────────────────────

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
    fileId: text("file_id").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type"),
    parentFolderId: text("parent_folder_id"),
    textContent: text("text_content"),
    searchVector: tsvector("search_vector"), // Full-text search vector (filename A, integration name B, content C)
    lastIndexedAt: timestamp("last_indexed_at", {
      withTimezone: true,
    }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("drive_file_index_unique").on(table.schoolId, table.fileId),
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
    keyAccomplishments: text("key_accomplishments"),
    ongoingProjects: text("ongoing_projects"),
    tipsAndAdvice: text("tips_and_advice"),
    importantContacts: text("important_contacts"),
    filesAndResources: text("files_and_resources"), // JSON array
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("board_handoff_notes_unique").on(
      table.schoolId,
      table.position,
      table.schoolYear
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

export const eventCatalog = pgTable(
  "event_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    typicalTiming: text("typical_timing"),
    estimatedVolunteers: text("estimated_volunteers"),
    estimatedBudget: text("estimated_budget"),
    keyTasks: text("key_tasks"), // JSON array
    tips: text("tips"), // JSON array
    relatedPositions: ptaBoardPositionEnum("related_positions").array(),
    sourceEventPlanIds: uuid("source_event_plan_ids").array(),
    aiGenerated: boolean("ai_generated").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("event_catalog_unique").on(table.schoolId, table.eventType),
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
  classrooms: many(classrooms),
  volunteerHours: many(volunteerHours),
  calendarEvents: many(calendarEvents),
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
  eventInterest: many(eventInterest),
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

export const classroomsRelations = relations(classrooms, ({ one, many }) => ({
  school: one(schools, {
    fields: [classrooms.schoolId],
    references: [schools.id],
  }),
  members: many(classroomMembers),
  messages: many(classroomMessages),
  tasks: many(classroomTasks),
  calendarEvents: many(calendarEvents),
  roomParents: many(roomParents),
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
    members: many(eventPlanMembers),
    tasks: many(eventPlanTasks),
    messages: many(eventPlanMessages),
    approvals: many(eventPlanApprovals),
    resources: many(eventPlanResources),
    aiRecommendations: many(eventPlanAiRecommendations),
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

export const driveFileIndexRelations = relations(driveFileIndex, ({ one }) => ({
  school: one(schools, {
    fields: [driveFileIndex.schoolId],
    references: [schools.id],
  }),
  integration: one(schoolDriveIntegrations, {
    fields: [driveFileIndex.integrationId],
    references: [schoolDriveIntegrations.id],
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
