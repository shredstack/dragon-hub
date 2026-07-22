/**
 * Everything the dashboard shows, gathered in one place.
 *
 * The dashboard's job is to answer "what should I do next," so every query here
 * is scoped exactly the way its destination page is scoped — same school, same
 * school year, same active/completed filters. A dashboard that promises rows
 * the page then filters away is worse than no dashboard, because the user
 * learns not to trust the numbers.
 */

import { db } from "@/lib/db";
import {
  calendarEvents,
  classroomMembers,
  classroomMessages,
  classroomTasks,
  classrooms,
  eventCatalog,
  eventInterest,
  eventPlanApprovals,
  eventPlanTasks,
  eventPlans,
  onboardingChecklistItems,
  onboardingProgress,
  volunteerHours,
} from "@/lib/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  isCurrentOrLaterYear,
  parseSchoolYear,
  schoolYearDateRange,
} from "@/lib/school-year";

/** A single thing the user personally owes someone. */
export interface ActionItem {
  id: string;
  title: string;
  /** Where the work lives — a classroom name or an event plan title. */
  context: string;
  dueDate: Date | null;
  href: string;
  source: "classroom" | "event";
}

export interface UpcomingEvent {
  id: string;
  title: string;
  startTime: Date;
  location: string | null;
  eventType: string | null;
}

export interface ClassroomSummary {
  id: string;
  name: string;
  gradeLevel: string | null;
  /** Messages posted by other people in the last week. */
  recentMessages: number;
}

/** Queue items that only exist for the board. */
export interface BoardQueue {
  hoursAwaitingApproval: number;
  plansAwaitingMyVote: { id: string; title: string }[];
  /** Catalog events nobody has offered to lead this year. */
  eventsNeedingLeads: { id: string; title: string }[];
  onboarding: { completed: number; total: number } | null;
}

export interface DashboardData {
  schoolYear: string;
  classrooms: ClassroomSummary[];
  actionItems: ActionItem[];
  /** Hours the user logged that the board hasn't approved yet. */
  pendingHours: number;
  /** The user's approved hours inside this school year. */
  myApprovedHours: number;
  /** Every approved hour the school logged this year, the user's included. */
  schoolApprovedHours: number;
  upcomingEvents: UpcomingEvent[];
  board: BoardQueue | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Enough to fill the panel and prove there's more, without a scrollbar. */
const ACTION_ITEM_LIMIT = 6;
const UPCOMING_EVENT_LIMIT = 5;

export async function getDashboardData({
  userId,
  schoolId,
  schoolYear,
  isBoardMember,
  now,
}: {
  userId: string;
  schoolId: string;
  schoolYear: string;
  isBoardMember: boolean;
  /** Passed in so every "is it this week" comparison uses one instant. */
  now: Date;
}): Promise<DashboardData> {
  const currentYearStart = parseSchoolYear(schoolYear);
  const { start: yearStart, end: yearEnd } = schoolYearDateRange(schoolYear);
  const weekAgo = new Date(now.getTime() - WEEK_MS);

  // This year's active rooms, exactly as /classrooms lists them. Everything
  // classroom-scoped below hangs off these ids, so a stale membership from a
  // prior year can't leak tasks or messages onto the dashboard.
  const myClassrooms = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
    })
    .from(classrooms)
    .innerJoin(classroomMembers, eq(classrooms.id, classroomMembers.classroomId))
    .where(
      and(
        eq(classroomMembers.userId, userId),
        eq(classrooms.active, true),
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear)
      )
    )
    .orderBy(asc(classrooms.name));

  const classroomIds = myClassrooms.map((c) => c.id);

  const [
    classroomTaskRows,
    eventTaskRows,
    messageCounts,
    hoursSummary,
    schoolHours,
    upcomingEvents,
  ] = await Promise.all([
    classroomIds.length
      ? db
          .select({
            id: classroomTasks.id,
            title: classroomTasks.title,
            dueDate: classroomTasks.dueDate,
            classroomId: classroomTasks.classroomId,
          })
          .from(classroomTasks)
          .where(
            and(
              eq(classroomTasks.assignedTo, userId),
              eq(classroomTasks.completed, false),
              inArray(classroomTasks.classroomId, classroomIds)
            )
          )
      : Promise.resolve([]),

    // Completed plans are read-only history, so their open tasks are noise.
    db
      .select({
        id: eventPlanTasks.id,
        title: eventPlanTasks.title,
        dueDate: eventPlanTasks.dueDate,
        planId: eventPlans.id,
        planTitle: eventPlans.title,
        planYear: eventPlans.schoolYear,
      })
      .from(eventPlanTasks)
      .innerJoin(eventPlans, eq(eventPlans.id, eventPlanTasks.eventPlanId))
      .where(
        and(
          eq(eventPlanTasks.assignedTo, userId),
          eq(eventPlanTasks.completed, false),
          eq(eventPlans.schoolId, schoolId),
          ne(eventPlans.status, "completed")
        )
      ),

    // Public messages only. Whether someone may read the room-parents-only
    // board depends on their classroom role *and* their volunteer signups
    // (see isUserRoomParentForClassroom), which this count can't cheaply
    // reproduce — and a badge that counts posts the user can't open is worse
    // than one that undercounts. Room parents see the private board itself on
    // the classroom page regardless.
    classroomIds.length
      ? db
          .select({
            classroomId: classroomMessages.classroomId,
            count: sql<number>`count(*)`,
          })
          .from(classroomMessages)
          .where(
            and(
              inArray(classroomMessages.classroomId, classroomIds),
              eq(classroomMessages.accessLevel, "public"),
              gte(classroomMessages.createdAt, weekAgo),
              // Your own posts aren't news to you.
              or(
                isNull(classroomMessages.authorId),
                ne(classroomMessages.authorId, userId)
              )
            )
          )
          .groupBy(classroomMessages.classroomId)
      : Promise.resolve([]),

    // Pending is deliberately not year-bound: an entry from a past year that
    // nobody ever approved is still waiting on someone, and hiding it would
    // let it sit forever. Approved hours are year-bound because that's the
    // number the hero attributes to this year's community.
    db
      .select({
        pending: sql<number>`count(*) filter (where ${volunteerHours.approved} = false)`,
        approved: sql<string>`coalesce(sum(${volunteerHours.hours}) filter (
          where ${volunteerHours.approved} = true
            and ${volunteerHours.date} between ${yearStart} and ${yearEnd}
        ), 0)`,
      })
      .from(volunteerHours)
      .where(
        and(
          eq(volunteerHours.userId, userId),
          eq(volunteerHours.schoolId, schoolId)
        )
      ),

    db
      .select({
        total: sql<string>`coalesce(sum(${volunteerHours.hours}), 0)`,
      })
      .from(volunteerHours)
      .where(
        and(
          eq(volunteerHours.schoolId, schoolId),
          eq(volunteerHours.approved, true),
          gte(volunteerHours.date, yearStart),
          lte(volunteerHours.date, yearEnd)
        )
      ),

    db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        startTime: calendarEvents.startTime,
        location: calendarEvents.location,
        eventType: calendarEvents.eventType,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.schoolId, schoolId),
          gte(calendarEvents.startTime, now)
        )
      )
      .orderBy(asc(calendarEvents.startTime))
      .limit(UPCOMING_EVENT_LIMIT),
  ]);

  const classroomNames = new Map(myClassrooms.map((c) => [c.id, c.name]));
  const messagesByClassroom = new Map(
    messageCounts.map((m) => [m.classroomId, Number(m.count)])
  );

  const actionItems: ActionItem[] = [
    ...classroomTaskRows.map((t) => ({
      id: t.id,
      title: t.title,
      context: classroomNames.get(t.classroomId) ?? "Your classroom",
      dueDate: t.dueDate,
      href: `/classrooms/${t.classroomId}`,
      source: "classroom" as const,
    })),
    ...eventTaskRows
      .filter((t) => isCurrentOrLaterYear(t.planYear, currentYearStart))
      .map((t) => ({
        id: t.id,
        title: t.title,
        context: t.planTitle,
        dueDate: t.dueDate,
        href: `/events/${t.planId}`,
        source: "event" as const,
      })),
  ].sort(sortByDueDate);

  return {
    schoolYear,
    classrooms: myClassrooms.map((c) => ({
      ...c,
      recentMessages: messagesByClassroom.get(c.id) ?? 0,
    })),
    actionItems: actionItems.slice(0, ACTION_ITEM_LIMIT),
    pendingHours: Number(hoursSummary[0]?.pending ?? 0),
    myApprovedHours: Number(hoursSummary[0]?.approved ?? 0),
    schoolApprovedHours: Number(schoolHours[0]?.total ?? 0),
    upcomingEvents,
    board: isBoardMember
      ? await getBoardQueue({ userId, schoolId, schoolYear, currentYearStart })
      : null,
  };
}

/** Undated work sinks below dated work rather than pretending to be urgent. */
function sortByDueDate(a: ActionItem, b: ActionItem): number {
  if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title);
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.getTime() - b.dueDate.getTime();
}

async function getBoardQueue({
  userId,
  schoolId,
  schoolYear,
  currentYearStart,
}: {
  userId: string;
  schoolId: string;
  schoolYear: string;
  currentYearStart: number;
}): Promise<BoardQueue> {
  const [
    hoursRow,
    awaitingVote,
    needingLeads,
    checklistTotal,
    checklistDone,
  ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(volunteerHours)
        .where(
          and(
            eq(volunteerHours.schoolId, schoolId),
            eq(volunteerHours.approved, false)
          )
        ),

      // A plan the board hasn't finished voting on stalls until every member
      // weighs in, so this lists only the ones still missing *your* vote.
      db
        .select({
          id: eventPlans.id,
          title: eventPlans.title,
          schoolYear: eventPlans.schoolYear,
        })
        .from(eventPlans)
        .leftJoin(
          eventPlanApprovals,
          and(
            eq(eventPlanApprovals.eventPlanId, eventPlans.id),
            eq(eventPlanApprovals.userId, userId)
          )
        )
        .where(
          and(
            eq(eventPlans.schoolId, schoolId),
            eq(eventPlans.status, "pending_approval"),
            isNull(eventPlanApprovals.id)
          )
        )
        .orderBy(desc(eventPlans.updatedAt)),

      // A recurring event nobody has offered to lead is the failure mode that
      // actually sinks a PTA year, and it's invisible everywhere else. Note the
      // signal is catalog interest, not event plans: a plan always has a lead
      // (creation adds one and the last one can't be removed), so it can only
      // ever tell you about events someone already picked up.
      db
        .select({
          id: eventCatalog.id,
          title: eventCatalog.title,
          typicalMonth: eventCatalog.typicalMonth,
        })
        .from(eventCatalog)
        .leftJoin(
          eventInterest,
          and(
            eq(eventInterest.eventCatalogId, eventCatalog.id),
            eq(eventInterest.schoolYear, schoolYear),
            eq(eventInterest.interestLevel, "lead")
          )
        )
        .where(
          and(
            eq(eventCatalog.schoolId, schoolId),
            eq(eventCatalog.isActive, true),
            isNull(eventInterest.id)
          )
        )
        .orderBy(asc(eventCatalog.typicalMonth), asc(eventCatalog.title)),

      db
        .select({ count: sql<number>`count(*)` })
        .from(onboardingChecklistItems)
        .where(eq(onboardingChecklistItems.schoolId, schoolId)),

      db
        .select({ count: sql<number>`count(*)` })
        .from(onboardingProgress)
        .where(
          and(
            eq(onboardingProgress.userId, userId),
            eq(onboardingProgress.schoolId, schoolId),
            eq(onboardingProgress.schoolYear, schoolYear)
          )
        ),
    ]);

  const total = Number(checklistTotal[0]?.count ?? 0);

  return {
    hoursAwaitingApproval: Number(hoursRow[0]?.count ?? 0),
    plansAwaitingMyVote: awaitingVote
      .filter((p) => isCurrentOrLaterYear(p.schoolYear, currentYearStart))
      .map(({ id, title }) => ({ id, title })),
    eventsNeedingLeads: needingLeads.map(({ id, title }) => ({ id, title })),
    onboarding: total
      ? { completed: Number(checklistDone[0]?.count ?? 0), total }
      : null,
  };
}
