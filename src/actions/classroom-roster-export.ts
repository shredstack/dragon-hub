"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { classroomMembers, classrooms } from "@/lib/db/schema";
import { assertAuthenticated, isSchoolLeadership } from "@/lib/auth-helpers";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { buildMemberExport } from "@/lib/member-export-data";
import { buildClassroomRosterFilters } from "@/lib/classroom-roster-export";
import type { ClassroomRosterExportInput } from "@/lib/classroom-roster-export";
import type { MemberExportResult } from "@/lib/member-export";

/**
 * Export one classroom's volunteer and teacher roster.
 *
 * The auth boundary, and nothing else — the shaping is
 * `buildClassroomRosterFilters` and the query is `buildMemberExport`, exactly
 * as the board's own export uses them.
 *
 * **Who may run it: the room's own people, plus school leadership.** A real
 * `classroom_members` row of any role is enough — a teacher, a room parent, a
 * volunteer on the roster — because everything this returns is already on the
 * classroom page they can open. Leadership passes as it does everywhere else.
 *
 * **A DLI partner deliberately does not.** A 1st grade Blue room parent can
 * read and post in 1st grade Red, and can see its volunteers on the page; that
 * grant is for coordinating a shared party, not for taking a copy of the other
 * room's contact list. The partner hop is participation, and a bulk export of
 * contact details is the point where that stops being the same thing. See the
 * DLI section in CLAUDE.md.
 */
async function assertCanExportClassroomRoster(classroomId: string) {
  const user = await assertAuthenticated();
  const userId = user.id!;

  const classroom = await db.query.classrooms.findFirst({
    where: eq(classrooms.id, classroomId),
  });
  // `classrooms.school_id` is nullable in the schema; an unattached room has no
  // school to scope an export to, and nothing to authorize against.
  if (!classroom?.schoolId) throw new Error("Classroom not found");

  const membership = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.classroomId, classroomId),
      eq(classroomMembers.userId, userId)
    ),
  });

  if (!membership && !(await isSchoolLeadership(userId, classroom.schoolId))) {
    throw new Error("Unauthorized: Not a classroom member");
  }

  return { classroom, schoolId: classroom.schoolId };
}

export async function exportClassroomRoster(
  classroomId: string,
  input: ClassroomRosterExportInput
): Promise<MemberExportResult> {
  const { classroom, schoolId } = await assertCanExportClassroomRoster(
    classroomId
  );

  // The export is built over the school's current year — the signups, seats and
  // waitlists it reads are all scoped to it. A room from an earlier year would
  // therefore come back empty, which is worth saying rather than reporting as
  // "nobody volunteered".
  const schoolYear = await getSchoolCurrentYear(schoolId);
  if (classroom.schoolYear !== schoolYear) {
    throw new Error(
      `${classroom.name} is a ${classroom.schoolYear} classroom, and exports cover the current ${schoolYear} year.`
    );
  }

  return buildMemberExport(
    schoolId,
    buildClassroomRosterFilters(classroomId, input)
  );
}
