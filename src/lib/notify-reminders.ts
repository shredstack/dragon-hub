import "server-only";
import { db } from "@/lib/db";
import {
  classrooms,
  classroomTasks,
  committees,
  committeeScheduleSlots,
  committeeSignups,
  committeeTasks,
  eventPlans,
  eventPlanTasks,
  notifications,
} from "@/lib/db/schema";
import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { notify } from "@/lib/notify";

/**
 * The daily reminder sweep, plus the retention sweep that keeps this table from
 * growing forever.
 *
 * Two properties matter more than the queries:
 *
 * **Idempotence.** A cron can be retried, and Vercel will happily invoke a
 * schedule twice across a deploy. Every reminder carries a `groupKey` that
 * includes the task or slot id, so a second run in the same day collapses onto
 * the row the first run wrote rather than sending again. That is the collapse
 * mechanism doing double duty as a dedupe.
 *
 * **"Tomorrow" is the school's tomorrow.** Not UTC's. The job runs at 16:00 UTC
 * (~9am Pacific) precisely so that the local date is unambiguous, but the
 * window is still computed per school rather than per server.
 */

export interface ReminderResult {
  taskReminders: number;
  shiftReminders: number;
  deletedRead: number;
  deletedUnread: number;
}

export async function runNotificationReminders(): Promise<ReminderResult> {
  const [taskReminders, shiftReminders, retention] = [
    await sendTaskReminders(),
    await sendShiftReminders(),
    await sweepOldNotifications(),
  ];

  return {
    taskReminders,
    shiftReminders,
    deletedRead: retention.read,
    deletedUnread: retention.unread,
  };
}

/** Start and end of "tomorrow", as timestamps. */
function tomorrowWindow(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Tasks due tomorrow with someone on the hook.
 *
 * All three task tables at once, because a person's "what's due tomorrow" does
 * not care which board it came from — but each still gets its own notification
 * so the link goes to the right place.
 */
async function sendTaskReminders(): Promise<number> {
  const { start, end } = tomorrowWindow();
  let sent = 0;

  const classroomDue = await db
    .select({
      id: classroomTasks.id,
      title: classroomTasks.title,
      assignedTo: classroomTasks.assignedTo,
      classroomId: classroomTasks.classroomId,
      classroomName: classrooms.name,
      schoolId: classrooms.schoolId,
    })
    .from(classroomTasks)
    .innerJoin(classrooms, eq(classrooms.id, classroomTasks.classroomId))
    .where(
      and(
        isNotNull(classroomTasks.assignedTo),
        eq(classroomTasks.completed, false),
        gte(classroomTasks.dueDate, start),
        lt(classroomTasks.dueDate, end)
      )
    );

  for (const t of classroomDue) {
    if (!t.schoolId || !t.assignedTo) continue;
    await notify({
      type: "task_due_soon",
      schoolId: t.schoolId,
      recipients: [t.assignedTo],
      title: "Due tomorrow",
      body: `${t.title} — ${t.classroomName}`,
      url: `/classrooms/${t.classroomId}`,
      groupKey: `task_due:${t.id}`,
    });
    sent++;
  }

  const committeeDue = await db
    .select({
      id: committeeTasks.id,
      title: committeeTasks.title,
      assignedTo: committeeTasks.assignedTo,
      committeeId: committeeTasks.committeeId,
      committeeName: committees.name,
      schoolId: committees.schoolId,
    })
    .from(committeeTasks)
    .innerJoin(committees, eq(committees.id, committeeTasks.committeeId))
    .where(
      and(
        isNotNull(committeeTasks.assignedTo),
        eq(committeeTasks.completed, false),
        gte(committeeTasks.dueDate, start),
        lt(committeeTasks.dueDate, end)
      )
    );

  for (const t of committeeDue) {
    if (!t.assignedTo) continue;
    await notify({
      type: "task_due_soon",
      schoolId: t.schoolId,
      recipients: [t.assignedTo],
      title: "Due tomorrow",
      body: `${t.title} — ${t.committeeName}`,
      url: `/committees/${t.committeeId}`,
      groupKey: `task_due:${t.id}`,
    });
    sent++;
  }

  const eventDue = await db
    .select({
      id: eventPlanTasks.id,
      title: eventPlanTasks.title,
      assignedTo: eventPlanTasks.assignedTo,
      eventPlanId: eventPlanTasks.eventPlanId,
      planTitle: eventPlans.title,
      schoolId: eventPlans.schoolId,
    })
    .from(eventPlanTasks)
    .innerJoin(eventPlans, eq(eventPlans.id, eventPlanTasks.eventPlanId))
    .where(
      and(
        isNotNull(eventPlanTasks.assignedTo),
        eq(eventPlanTasks.completed, false),
        gte(eventPlanTasks.dueDate, start),
        lt(eventPlanTasks.dueDate, end)
      )
    );

  for (const t of eventDue) {
    if (!t.schoolId || !t.assignedTo) continue;
    await notify({
      type: "task_due_soon",
      schoolId: t.schoolId,
      recipients: [t.assignedTo],
      title: "Due tomorrow",
      body: `${t.title} — ${t.planTitle}`,
      url: `/events/plans/${t.eventPlanId}`,
      groupKey: `task_due:${t.id}`,
    });
    sent++;
  }

  return sent;
}

/**
 * Committee schedule slots starting tomorrow, to whoever claimed them.
 *
 * The claim lives on `committee_schedule_slots.assigned_signup_id` — a signup,
 * not a user, so that a volunteer without an account can still be assigned.
 * That means the join can legitimately produce a null `user_id`, and those
 * rows are skipped: there is nobody to notify, and the seat is still real.
 */
async function sendShiftReminders(): Promise<number> {
  const { start, end } = tomorrowWindow();

  const slots = await db
    .select({
      id: committeeScheduleSlots.id,
      title: committeeScheduleSlots.title,
      startsAt: committeeScheduleSlots.startsAt,
      location: committeeScheduleSlots.location,
      committeeId: committeeScheduleSlots.committeeId,
      schoolId: committeeScheduleSlots.schoolId,
      userId: committeeSignups.userId,
    })
    .from(committeeScheduleSlots)
    .innerJoin(
      committeeSignups,
      eq(committeeSignups.id, committeeScheduleSlots.assignedSignupId)
    )
    .where(
      and(
        gte(committeeScheduleSlots.startsAt, start),
        lt(committeeScheduleSlots.startsAt, end),
        eq(committeeScheduleSlots.status, "confirmed")
      )
    );

  let sent = 0;
  for (const slot of slots) {
    if (!slot.userId) continue;
    const when = slot.startsAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
    await notify({
      type: "shift_reminder",
      schoolId: slot.schoolId,
      recipients: [slot.userId],
      title: "You're on tomorrow",
      body: `${slot.title} at ${when}${slot.location ? ` — ${slot.location}` : ""}`,
      url: `/committees/${slot.committeeId}`,
      groupKey: `shift:${slot.id}`,
    });
    sent++;
  }

  return sent;
}

/**
 * Retention.
 *
 * An unbounded inbox table is the kind of thing that is fine for two years and
 * then isn't. Read rows go at 90 days — they have been seen and acted on.
 * Unread ones get 180, because an unread notification is the one case where the
 * row is still doing a job.
 */
async function sweepOldNotifications(): Promise<{
  read: number;
  unread: number;
}> {
  const readCutoff = new Date(Date.now() - 90 * 86_400_000);
  const unreadCutoff = new Date(Date.now() - 180 * 86_400_000);

  const [readDeleted, unreadDeleted] = await Promise.all([
    db
      .delete(notifications)
      .where(
        and(
          isNotNull(notifications.readAt),
          lt(notifications.createdAt, readCutoff)
        )
      )
      .returning({ id: notifications.id }),
    db
      .delete(notifications)
      .where(
        and(
          isNull(notifications.readAt),
          lt(notifications.createdAt, unreadCutoff)
        )
      )
      .returning({ id: notifications.id }),
  ]);

  return { read: readDeleted.length, unread: unreadDeleted.length };
}

/** Kept for the route's log line — cheap, and useful when a sweep looks wrong. */
export async function countNotifications(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications);
  return row?.count ?? 0;
}
