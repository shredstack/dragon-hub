import "server-only";
import { db } from "@/lib/db";
import {
  classroomTeachers,
  classrooms,
  schoolMemberships,
  users,
} from "@/lib/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import type { PersonBadge } from "@/lib/school-person-badges-shared";

/**
 * Who's who on a board-side roster, in one query for the whole screen.
 *
 * "Mrs. Chen wants to help with Field Day" is a different fact from a parent's
 * hand, and the board asked to see the difference at a glance. Resolved once
 * per screen rather than per row: the interest roster, the help-request queue
 * and the plan roster all render the same map through `<PersonBadges>`, so none
 * of them grows its own answer.
 *
 * **Board and lead surfaces only.** A badge is a directory entry — "Mrs. Chen
 * (Teacher) loves this" on a page for families labels a teacher who never asked
 * to be labelled — so this never reaches the member-facing projection, even at
 * a school that turned `showReactorNames` on.
 *
 * A person can hold two (the PTA treasurer who also teaches 3rd grade), which
 * is why badges are a list rather than a field.
 */
export async function getPersonBadges(
  schoolId: string,
  schoolYear: string
): Promise<Map<string, PersonBadge[]>> {
  const [memberships, teacherRows] = await Promise.all([
    db
      .select({
        userId: schoolMemberships.userId,
        role: schoolMemberships.role,
        isSchoolStaff: schoolMemberships.isSchoolStaff,
      })
      .from(schoolMemberships)
      .where(
        and(
          eq(schoolMemberships.schoolId, schoolId),
          eq(schoolMemberships.schoolYear, schoolYear),
          eq(schoolMemberships.status, "approved")
        )
      ),
    // Teacher-of-record comes from `classroom_teachers`, never
    // `classroom_members`: the membership row only exists once someone signs
    // in, so a roster built from it is empty in September — exactly when the
    // board needs it. Matched by lowercased email, which is what
    // `setClassroomTeachers()` stores, so plain equality is right and
    // `lower(...)` is not needed.
    //
    // The account's email must be *verified*: this keys off something a board
    // member typed by hand, and an unverified match would let a typo hand a
    // stranger a teacher badge.
    db
      .selectDistinct({ userId: users.id })
      .from(classroomTeachers)
      .innerJoin(classrooms, eq(classrooms.id, classroomTeachers.classroomId))
      .innerJoin(users, eq(users.email, classroomTeachers.email))
      .where(
        and(
          eq(classrooms.schoolId, schoolId),
          eq(classrooms.schoolYear, schoolYear),
          isNotNull(users.emailVerified)
        )
      ),
  ]);

  const badges = new Map<string, PersonBadge[]>();
  const add = (userId: string, badge: PersonBadge) => {
    const list = badges.get(userId) ?? [];
    if (!list.includes(badge)) list.push(badge);
    badges.set(userId, list);
  };

  for (const row of teacherRows) add(row.userId, "teacher");
  for (const row of memberships) {
    if (row.role === "pta_board") add(row.userId, "pta_board");
    if (row.role === "admin" || row.isSchoolStaff) add(row.userId, "staff");
  }

  return badges;
}
