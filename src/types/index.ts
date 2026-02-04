import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  users,
  classrooms,
  classroomMembers,
  classroomMessages,
  classroomTasks,
  roomParents,
  volunteerHours,
  calendarEvents,
  budgetCategories,
  budgetTransactions,
  fundraisers,
  fundraiserStats,
  knowledgeArticles,
} from "@/lib/db/schema";

// Select types (reading from DB)
export type User = InferSelectModel<typeof users>;
export type Classroom = InferSelectModel<typeof classrooms>;
export type ClassroomMember = InferSelectModel<typeof classroomMembers>;
export type ClassroomMessage = InferSelectModel<typeof classroomMessages>;
export type ClassroomTask = InferSelectModel<typeof classroomTasks>;
export type VolunteerHour = InferSelectModel<typeof volunteerHours>;
export type CalendarEvent = InferSelectModel<typeof calendarEvents>;
export type BudgetCategory = InferSelectModel<typeof budgetCategories>;
export type BudgetTransaction = InferSelectModel<typeof budgetTransactions>;
export type Fundraiser = InferSelectModel<typeof fundraisers>;
export type FundraiserStat = InferSelectModel<typeof fundraiserStats>;
export type KnowledgeArticle = InferSelectModel<typeof knowledgeArticles>;
export type RoomParent = InferSelectModel<typeof roomParents>;

// Insert types (writing to DB)
export type NewUser = InferInsertModel<typeof users>;
export type NewClassroom = InferInsertModel<typeof classrooms>;
export type NewClassroomMember = InferInsertModel<typeof classroomMembers>;
export type NewClassroomMessage = InferInsertModel<typeof classroomMessages>;
export type NewClassroomTask = InferInsertModel<typeof classroomTasks>;
export type NewVolunteerHour = InferInsertModel<typeof volunteerHours>;
export type NewCalendarEvent = InferInsertModel<typeof calendarEvents>;
export type NewBudgetCategory = InferInsertModel<typeof budgetCategories>;
export type NewBudgetTransaction = InferInsertModel<typeof budgetTransactions>;
export type NewFundraiser = InferInsertModel<typeof fundraisers>;
export type NewFundraiserStat = InferInsertModel<typeof fundraiserStats>;
export type NewKnowledgeArticle = InferInsertModel<typeof knowledgeArticles>;
export type NewRoomParent = InferInsertModel<typeof roomParents>;

// Extended types with relations
export type ClassroomWithMembers = Classroom & {
  members: (ClassroomMember & { user: User })[];
};

export type ClassroomMessageWithAuthor = ClassroomMessage & {
  author: User | null;
};

export type ClassroomTaskWithAssignee = ClassroomTask & {
  assignee: User | null;
  creator: User | null;
};

export type VolunteerHourWithUser = VolunteerHour & {
  user: User;
};

export type BudgetCategoryWithTransactions = BudgetCategory & {
  transactions: BudgetTransaction[];
  totalSpent: number;
};

export type FundraiserWithStats = Fundraiser & {
  stats: FundraiserStat[];
  latestStats: FundraiserStat | null;
};

export type UserRole = "teacher" | "room_parent" | "pta_board" | "volunteer";
