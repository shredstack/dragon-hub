/**
 * Giving back every seat one person is holding.
 *
 * A signup row *is* the seat — not the account attached to it. Both
 * `volunteer_signups.user_id` and `committee_signups.user_id` are ON DELETE SET
 * NULL, so erasing an account leaves the row behind, still `active`, still
 * counting against a room parent limit or a per-classroom committee cap, under
 * whatever name the parent typed into the form. Taking someone off the roster
 * has the same shape: the membership goes `removed` while the seat stays taken.
 *
 * Both callers want the same thing, so it lives here once. It runs through the
 * ordinary `deactivate*` helpers rather than a bulk UPDATE, which is the whole
 * point: classroom and committee memberships re-derive, and whoever is next in
 * line is promoted and emailed exactly as if a board member had removed the
 * person by hand. A seat that quietly frees itself without promoting anyone is
 * the bug this module exists to prevent.
 *
 * Deliberately not a "use server" module: it is called from inside server
 * actions, not from a form.
 */

import { db } from "@/lib/db";
import { classrooms, committeeSignups, volunteerSignups } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { deactivateCommitteeSignup } from "@/lib/committee-onboarding";
import { deactivateVolunteerSignup } from "@/lib/volunteer-onboarding";

export interface ReleasedSeats {
  /** Room parent / party volunteer rows deactivated. */
  volunteer: number;
  /** Committee rows deactivated, per-classroom and school-wide alike. */
  committee: number;
}

/**
 * Deactivate every signup this user still holds — `active` and `waitlisted`
 * both, since a place in line is a claim on a future seat.
 *
 * Scope it with `schoolId` / `schoolYear` when the reason is local (someone
 * leaving one school's roster); omit them when the account itself is going away
 * and every school it touched should get its seats back.
 */
export async function releaseSignupSeatsForUser(params: {
  userId: string;
  /** Recorded as `removed_by`, and credited as the promoter of anyone moved up. */
  removedBy: string;
  schoolId?: string;
  /**
   * `volunteer_signups` has no year of its own — the year lives on the
   * classroom — so this filters those rows through their classroom.
   */
  schoolYear?: string;
}): Promise<ReleasedSeats> {
  const { userId, removedBy, schoolId, schoolYear } = params;

  const volunteerRows = await db
    .select({
      id: volunteerSignups.id,
      classroomId: volunteerSignups.classroomId,
      userId: volunteerSignups.userId,
      role: volunteerSignups.role,
    })
    .from(volunteerSignups)
    .innerJoin(classrooms, eq(classrooms.id, volunteerSignups.classroomId))
    .where(
      and(
        eq(volunteerSignups.userId, userId),
        ne(volunteerSignups.status, "removed"),
        schoolId ? eq(volunteerSignups.schoolId, schoolId) : undefined,
        schoolYear ? eq(classrooms.schoolYear, schoolYear) : undefined
      )
    );

  const committeeRows = await db
    .select({
      id: committeeSignups.id,
      committeeId: committeeSignups.committeeId,
      classroomId: committeeSignups.classroomId,
      userId: committeeSignups.userId,
    })
    .from(committeeSignups)
    .where(
      and(
        eq(committeeSignups.userId, userId),
        ne(committeeSignups.status, "removed"),
        schoolId ? eq(committeeSignups.schoolId, schoolId) : undefined,
        schoolYear ? eq(committeeSignups.schoolYear, schoolYear) : undefined
      )
    );

  // Sequentially, not in parallel: each deactivation ends in a promotion sweep
  // that takes a row lock on the classroom or committee, and someone signed up
  // for two rooms of the same committee would have those sweeps contend.
  for (const row of volunteerRows) {
    await deactivateVolunteerSignup(row, removedBy);
  }
  for (const row of committeeRows) {
    await deactivateCommitteeSignup(row, removedBy);
  }

  return { volunteer: volunteerRows.length, committee: committeeRows.length };
}
