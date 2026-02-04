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

// ─── Classrooms ─────────────────────────────────────────────────────────────

export const classrooms = pgTable("classrooms", {
  id: uuid("id").primaryKey().defaultRandom(),
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
});

// ─── Budget ─────────────────────────────────────────────────────────────────

export const budgetCategories = pgTable("budget_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  allocatedAmount: decimal("allocated_amount", { precision: 10, scale: 2 }),
  schoolYear: text("school_year").notNull(),
  sheetRowId: text("sheet_row_id"),
  lastSynced: timestamp("last_synced", { withTimezone: true }).defaultNow(),
});

export const budgetTransactions = pgTable("budget_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
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

// ─── Relations ──────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  classroomMemberships: many(classroomMembers),
  volunteerHours: many(volunteerHours),
  classroomMessages: many(classroomMessages),
}));

export const classroomsRelations = relations(classrooms, ({ many }) => ({
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
  user: one(users, {
    fields: [volunteerHours.userId],
    references: [users.id],
  }),
}));

export const calendarEventsRelations = relations(
  calendarEvents,
  ({ one }) => ({
    classroom: one(classrooms, {
      fields: [calendarEvents.classroomId],
      references: [classrooms.id],
    }),
  })
);

export const budgetCategoriesRelations = relations(
  budgetCategories,
  ({ many }) => ({
    transactions: many(budgetTransactions),
  })
);

export const budgetTransactionsRelations = relations(
  budgetTransactions,
  ({ one }) => ({
    category: one(budgetCategories, {
      fields: [budgetTransactions.categoryId],
      references: [budgetCategories.id],
    }),
  })
);

export const fundraisersRelations = relations(fundraisers, ({ many }) => ({
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
