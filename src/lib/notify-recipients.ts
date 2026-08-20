import "server-only";
import { db } from "@/lib/db";
import {
  classroomMembers,
  committeeMembers,
  eventPlanMembers,
  schoolMemberships,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import type { AnnouncementAudience } from "@/actions/notifications";

/**
 * Who gets told, for each kind of thing that happens.
 *
 * Centralized here rather than inlined at each call site so that authorization
 * and notification cannot drift apart. Two rules run through every function
 * below, and both are the kind that look like bugs to the next reader:
 *
 * **1. Restricted posts notify only who can read them.** A `room_parents_only`
 * classroom message notifies room parents and teachers; a `chairsOnly`
 * committee post notifies chairs. This is not a nicety — a push notification
 * carries the message body on the lock screen, so notifying someone who cannot
 * open the thread is a disclosure bug wearing a UX bug's clothes.
 *
 * **2. Virtual members are deliberately excluded.** Per CLAUDE.md, school
 * admins are members of every classroom and every committee *in the auth
 * helper*, with no roster row. That is correct for access and wrong for
 * notification: it would push every classroom's chatter at the principal's
 * phone, all day, until they turned notifications off — losing the ones that
 * were for them. Recipients come from real `classroom_members` /
 * `committee_members` / `event_plan_members` rows only. **This is intentional;
 * do not "fix" it by routing these through the auth helpers.**
 */

export async function classroomRecipients(
  classroomId: string,
  opts?: { roomParentsOnly?: boolean }
): Promise<string[]> {
  const rows = await db
    .select({ userId: classroomMembers.userId, role: classroomMembers.role })
    .from(classroomMembers)
    .where(eq(classroomMembers.classroomId, classroomId));

  const filtered = opts?.roomParentsOnly
    ? rows.filter((r) => r.role === "room_parent" || r.role === "teacher")
    : rows;

  return unique(filtered.map((r) => r.userId));
}

export async function committeeRecipients(
  committeeId: string,
  opts?: { chairsOnly?: boolean }
): Promise<string[]> {
  const rows = await db
    .select({ userId: committeeMembers.userId, role: committeeMembers.role })
    .from(committeeMembers)
    .where(eq(committeeMembers.committeeId, committeeId));

  const filtered = opts?.chairsOnly
    ? rows.filter((r) => r.role === "chair")
    : rows;

  return unique(filtered.map((r) => r.userId));
}

/**
 * Everyone on an event plan.
 *
 * `event_plan_members.user_id` is nullable by design — a placeholder row names
 * a committee chair the board has assigned who has no account yet — so this
 * filters them out rather than producing nulls for `notify()` to drop.
 */
export async function eventPlanRecipients(
  eventPlanId: string
): Promise<string[]> {
  const rows = await db
    .select({ userId: eventPlanMembers.userId })
    .from(eventPlanMembers)
    .where(
      and(
        eq(eventPlanMembers.eventPlanId, eventPlanId),
        isNotNull(eventPlanMembers.userId)
      )
    );
  return unique(rows.map((r) => r.userId!));
}

/**
 * Who hears that someone asked to help plan an event: the PTA board, plus the
 * current year's plan leads.
 *
 * The leads are the point. A committee chair running Field Day is often
 * deliberately *not* on the board, and they are the person who knows whether
 * they need another pair of hands — so a queue only the board can see is a
 * queue that sits.
 *
 * Leads come from real `event_plan_members` rows. School admins are members of
 * every plan in the auth helper and are **not** notified here: participation is
 * not notification, and approving is governance they don't hold anyway.
 *
 * Returned split rather than unioned, because the two halves get *different*
 * links: the board's queue lives in the PTA Board Hub and a lead who isn't on
 * the board can't open it. `leads` therefore excludes anyone already in
 * `board`, so nobody is told twice about one request.
 */
export async function eventHelpRequestRecipients(
  schoolId: string,
  eventPlanId: string | null
): Promise<{ board: string[]; leads: string[] }> {
  const board = await boardRecipients(schoolId);
  if (!eventPlanId) return { board, leads: [] };

  const rows = await db
    .select({ userId: eventPlanMembers.userId })
    .from(eventPlanMembers)
    .where(
      and(
        eq(eventPlanMembers.eventPlanId, eventPlanId),
        eq(eventPlanMembers.role, "lead"),
        isNotNull(eventPlanMembers.userId)
      )
    );

  const boardSet = new Set(board);
  return {
    board,
    leads: unique(rows.map((r) => r.userId!)).filter((id) => !boardSet.has(id)),
  };
}

/** The PTA board for a school, in its current year. */
export async function boardRecipients(schoolId: string): Promise<string[]> {
  const year = await getSchoolCurrentYear(schoolId);
  const rows = await db
    .select({ userId: schoolMemberships.userId })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, year),
        eq(schoolMemberships.status, "approved"),
        eq(schoolMemberships.role, "pta_board")
      )
    );
  return unique(rows.map((r) => r.userId));
}

/**
 * Every approved member of the school, for the current year.
 *
 * Announcements only. Nothing else in the app has a legitimate reason to
 * notify the entire school at once, and this function existing is what makes
 * that reachable — so keep its callers to one.
 */
export async function schoolRecipients(schoolId: string): Promise<string[]> {
  const year = await getSchoolCurrentYear(schoolId);
  const rows = await db
    .select({ userId: schoolMemberships.userId })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, year),
        eq(schoolMemberships.status, "approved")
      )
    );
  return unique(rows.map((r) => r.userId));
}

/**
 * The audience picker on /admin/announcements, resolved.
 *
 * The committee and classroom branches re-check school ownership, because the
 * id arrives from a form: a committee id from another school would otherwise
 * let a board member here broadcast to a roster over there.
 */
export async function resolveAnnouncementRecipients(
  schoolId: string,
  audience: AnnouncementAudience
): Promise<string[]> {
  switch (audience.kind) {
    case "everyone":
      return schoolRecipients(schoolId);
    case "board":
      return boardRecipients(schoolId);
    case "committee": {
      const committee = await db.query.committees.findFirst({
        where: (c, { eq: e }) => e(c.id, audience.id),
        columns: { id: true, schoolId: true },
      });
      if (!committee || committee.schoolId !== schoolId) return [];
      return committeeRecipients(audience.id);
    }
    case "classroom": {
      const classroom = await db.query.classrooms.findFirst({
        where: (c, { eq: e }) => e(c.id, audience.id),
        columns: { id: true, schoolId: true },
      });
      if (!classroom || classroom.schoolId !== schoolId) return [];
      return classroomRecipients(audience.id);
    }
  }
}

/**
 * The school a set of users actually belongs to, filtered to one school.
 *
 * Used by the mention path: a mention must not reach someone who is not a
 * member of the board being posted on, and `extractMentions` matches on names
 * supplied by the caller, so this is the check that keeps a typo'd match from
 * becoming a cross-school notification.
 */
export async function restrictToSchoolMembers(
  schoolId: string,
  userIds: string[]
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const year = await getSchoolCurrentYear(schoolId);
  const rows = await db
    .select({ userId: schoolMemberships.userId })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, year),
        eq(schoolMemberships.status, "approved"),
        inArray(schoolMemberships.userId, userIds)
      )
    );
  return unique(rows.map((r) => r.userId));
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
