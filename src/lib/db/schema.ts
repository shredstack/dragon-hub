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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

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

// ─── Schools ────────────────────────────────────────────────────────────────

export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  mascot: text("mascot"),
  address: text("address"),
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

export const knowledgeArticles = pgTable("knowledge_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").references(() => schools.id), // Will be NOT NULL after migration
  title: text("title").notNull(),
  description: text("description"),
  googleDriveUrl: text("google_drive_url").notNull(),
  category: text("category"),
  tags: text("tags").array(),
  schoolYear: text("school_year"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
});

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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const eventPlanMessages = pgTable("event_plan_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventPlanId: uuid("event_plan_id")
    .notNull()
    .references(() => eventPlans.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id),
  message: text("message").notNull(),
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
  calendarIntegrations: many(schoolCalendarIntegrations),
  driveIntegrations: many(schoolDriveIntegrations),
  googleIntegration: one(schoolGoogleIntegrations),
  budgetIntegration: one(schoolBudgetIntegrations),
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
  ({ one }) => ({
    school: one(schools, {
      fields: [schoolDriveIntegrations.schoolId],
      references: [schools.id],
    }),
    creator: one(users, {
      fields: [schoolDriveIntegrations.createdBy],
      references: [users.id],
    }),
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
  })
);

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
