import { db } from "@/lib/db";
import {
  classroomMembers,
  classrooms,
  committeeSignups,
  schoolMemberships,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { PTA_MEMBER_SOURCES } from "@/types";

/**
 * Who belongs in the PTA's member directory.
 *
 * The rule is provenance, not role: someone is the PTA's to see if they came in
 * through a PTA door. A principal admitted by the school's own staff code is
 * not — he shows up on the School Staff roster instead.
 *
 * The signup half of the union is not redundant with the `source` column, and
 * dropping it would quietly break the case it exists for. `school_memberships`
 * is unique on (school, user, year), so a principal who is already a member and
 * *then* signs up to run the cakewalk keeps his original `source`: the linking
 * code finds an existing membership and skips the insert. The signup rows are
 * the actual evidence that someone took part in something the PTA runs, so the
 * directory asks them directly.
 *
 * Takes `schoolId` so the signup lookups stand on their own instead of
 * correlating against the outer row. A correlated `exists (... where
 * volunteer_signups.user_id = school_memberships.user_id)` reads fine but only
 * survives a plain `db.select()`: the relational query builder aliases the
 * table to `"schoolMemberships"`, the base name goes out of scope, and Postgres
 * rejects the whole query with `invalid reference to FROM-clause entry`. These
 * subqueries name only their own table, so the filter drops into either builder.
 */
/**
 * Who holds school administrator access.
 *
 * Staff access is additive, so the role column alone doesn't answer it: someone
 * admitted by a staff code holds `role = 'admin'`, but a PTA board member who
 * also works in the office holds `role = 'pta_board'` and the `is_school_staff`
 * flag. Asking only for the role drops that second person off the staff roster
 * and out of the position picker — the mistake `isSchoolAdminRole` deliberately
 * doesn't make, so the SQL side of the same question lives here rather than
 * being re-typed per query.
 *
 * Says nothing about status; callers add the `approved` / `!= removed` bound
 * they need, because "who is waiting" and "who holds it" are different lists.
 */
export function schoolStaffMemberFilter() {
  return or(
    eq(schoolMemberships.role, "admin"),
    eq(schoolMemberships.isSchoolStaff, true)
  );
}

/**
 * Teachers of record who have signed in, for the year given.
 *
 * Provenance says a teacher is not the PTA's: they are admitted by the board
 * naming their address on the classroom form, which lands `source =
 * 'classroom_teacher'` — deliberately outside `PTA_MEMBER_SOURCES`. That rule is
 * right about *governance* and wrong about the directory. The board typed the
 * address itself, the teacher's room is the unit the PTA organises around, and a
 * room parent VP who cannot see which of her teachers have accounts cannot do
 * the job. So the PTA directory unions them in; the School Staff roster is still
 * where someone admitted by the school's own access code belongs.
 *
 * Matches on the classroom role rather than the source column alone, because a
 * teacher who first joined some other way (a parent at the same school who later
 * took a classroom) keeps that original `source` — memberships are unique on
 * (school, user, year), so the linking code finds the row and skips the insert.
 * The `classroom_members` row is the evidence that survives either path.
 */
export function teacherMemberFilter(schoolId: string, schoolYear: string) {
  return or(
    eq(schoolMemberships.source, "classroom_teacher"),
    inArray(
      schoolMemberships.userId,
      db
        .select({ userId: classroomMembers.userId })
        .from(classroomMembers)
        .innerJoin(classrooms, eq(classroomMembers.classroomId, classrooms.id))
        .where(
          and(
            eq(classrooms.schoolId, schoolId),
            eq(classrooms.schoolYear, schoolYear),
            eq(classroomMembers.role, "teacher")
          )
        )
    )
  );
}

/**
 * Who the PTA's member directory shows: everyone who came through a PTA door,
 * plus this year's teachers of record. Both halves are needed — see
 * `ptaSourcedMemberFilter` and `teacherMemberFilter` for why each exists.
 */
export function directoryMemberFilter(schoolId: string, schoolYear: string) {
  return or(
    ptaSourcedMemberFilter(schoolId),
    teacherMemberFilter(schoolId, schoolYear)
  );
}

export function ptaSourcedMemberFilter(schoolId: string) {
  return or(
    inArray(schoolMemberships.source, [...PTA_MEMBER_SOURCES]),
    inArray(
      schoolMemberships.userId,
      db
        .select({ userId: volunteerSignups.userId })
        .from(volunteerSignups)
        .where(
          and(
            eq(volunteerSignups.schoolId, schoolId),
            // A signup that never verified has no user; leaving the NULLs in
            // the IN-list makes the whole comparison NULL for non-matches.
            isNotNull(volunteerSignups.userId)
          )
        )
    ),
    inArray(
      schoolMemberships.userId,
      db
        .select({ userId: committeeSignups.userId })
        .from(committeeSignups)
        .where(
          and(
            eq(committeeSignups.schoolId, schoolId),
            isNotNull(committeeSignups.userId)
          )
        )
    )
  );
}
