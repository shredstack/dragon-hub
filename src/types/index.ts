import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  users,
  schools,
  schoolMemberships,
  superAdmins,
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
  eventPlans,
  eventPlanMembers,
  eventPlanTasks,
  eventPlanMessages,
  eventPlanApprovals,
  eventPlanResources,
} from "@/lib/db/schema";

// Select types (reading from DB)
export type User = InferSelectModel<typeof users>;
export type School = InferSelectModel<typeof schools>;
export type SchoolMembership = InferSelectModel<typeof schoolMemberships>;
export type SuperAdmin = InferSelectModel<typeof superAdmins>;
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
export type NewSchool = InferInsertModel<typeof schools>;
export type NewSchoolMembership = InferInsertModel<typeof schoolMemberships>;
export type NewSuperAdmin = InferInsertModel<typeof superAdmins>;
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

// Event Plans
export type EventPlan = InferSelectModel<typeof eventPlans>;
export type EventPlanMember = InferSelectModel<typeof eventPlanMembers>;
export type EventPlanTask = InferSelectModel<typeof eventPlanTasks>;
export type EventPlanMessage = InferSelectModel<typeof eventPlanMessages>;
export type EventPlanApproval = InferSelectModel<typeof eventPlanApprovals>;
export type EventPlanResource = InferSelectModel<typeof eventPlanResources>;

export type NewEventPlan = InferInsertModel<typeof eventPlans>;
export type NewEventPlanMember = InferInsertModel<typeof eventPlanMembers>;
export type NewEventPlanTask = InferInsertModel<typeof eventPlanTasks>;
export type NewEventPlanMessage = InferInsertModel<typeof eventPlanMessages>;
export type NewEventPlanApproval = InferInsertModel<typeof eventPlanApprovals>;
export type NewEventPlanResource = InferInsertModel<typeof eventPlanResources>;

export type EventPlanWithDetails = EventPlan & {
  creator: User | null;
  members: (EventPlanMember & { user: User })[];
  taskCount: number;
  completedTaskCount: number;
  approvalCount: number;
  rejectionCount: number;
};

export type UserRole = "teacher" | "room_parent" | "pta_board" | "volunteer";
export type EventPlanMemberRole = "lead" | "member";
export type EventPlanStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "completed";

// School types
export type SchoolRole = "admin" | "pta_board" | "member";
export type SchoolMembershipStatus = "approved" | "expired" | "revoked";
export type PtaBoardPosition =
  | "president"
  | "vice_president"
  | "secretary"
  | "treasurer"
  | "president_elect"
  | "vp_elect"
  | "legislative_vp"
  | "public_relations_vp"
  | "membership_vp"
  | "room_parent_vp";

// Extended school types
export type SchoolWithMemberCount = School & {
  memberCount: number;
};

export type SchoolMembershipWithUser = SchoolMembership & {
  user: User;
};

export type SchoolMembershipWithSchool = SchoolMembership & {
  school: School;
};

export type UserWithSchoolMembership = User & {
  schoolMembership: SchoolMembership | null;
};
