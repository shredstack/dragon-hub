/**
 * Dual Language Immersion partner classrooms.
 *
 * At a DLI school a grade is split into two homerooms — the Red (Chinese) side
 * and the Blue (English) side — and the two are run as one grade. The teachers
 * plan together, and the parties most of the volunteering is for are thrown
 * together, so a Blue room parent who cannot see the Red room is cut off from
 * half of their own job.
 *
 * **There is no partner table, deliberately.** `dli_groups` is a school-level
 * list of *strands* ("Red — Chinese Homeroom"), not a per-grade pairing, so the
 * partnership is already fully expressed by the two columns a classroom
 * carries: `is_dli` and `grade_level`. Two active DLI rooms in the same grade
 * and the same school year are partners. A table would just be a second, more
 * easily wrong copy of that fact.
 *
 * Two consequences worth knowing:
 *
 * - **Grade matching goes through `getGradeSortOrder`, never string equality.**
 *   `grade_level` is free text and both "1st" and "1st Grade" are alive in
 *   production (see `grade-levels.ts`). Comparing the raw strings would leave
 *   two rooms in the same grade unpaired for a spelling.
 * - **Partner access is participation, not governance.** It is granted through
 *   `assertClassroomMember`, which a partner passes, and not through
 *   `assertClassroomRole`, which they don't — so a Blue room parent can read
 *   and post in Red, and cannot manage Red's roster, tasks or signups. That is
 *   the same line school admins sit on; see the table in CLAUDE.md.
 */

import { db } from "@/lib/db";
import { classroomMembers, classrooms } from "@/lib/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { getGradeSortOrder } from "@/lib/grade-levels";

/**
 * Sort orders that mean "we don't know what grade this is" — 998 for an
 * unparseable label, 999 for none at all. Two rooms that are both mysteries are
 * not thereby partners, so these never pair.
 */
function isPairableGrade(gradeLevel: string | null): boolean {
  const order = getGradeSortOrder(gradeLevel);
  return order < 998;
}

export interface DliPartnerClassroom {
  id: string;
  name: string;
  gradeLevel: string | null;
  schoolYear: string;
  dliGroupId: string | null;
}

/**
 * The other DLI rooms in this room's grade, for this room's school year.
 *
 * Empty for a non-DLI room, for a DLI room whose grade nobody filled in, and
 * for a grade that only runs one DLI homeroom — all of which are ordinary
 * states, not errors.
 */
export async function getDliPartnerClassrooms(
  classroomId: string
): Promise<DliPartnerClassroom[]> {
  const classroom = await db.query.classrooms.findFirst({
    where: eq(classrooms.id, classroomId),
    columns: {
      id: true,
      schoolId: true,
      schoolYear: true,
      gradeLevel: true,
      isDli: true,
      active: true,
    },
  });

  if (
    !classroom?.schoolId ||
    !classroom.isDli ||
    !classroom.active ||
    !isPairableGrade(classroom.gradeLevel)
  ) {
    return [];
  }

  // Grade can't be compared in SQL — free text, see the module comment — so the
  // year's DLI rooms come back and are matched here. A school year has a few
  // dozen of them at most.
  const sameYearDliRooms = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
      schoolYear: classrooms.schoolYear,
      dliGroupId: classrooms.dliGroupId,
    })
    .from(classrooms)
    .where(
      and(
        eq(classrooms.schoolId, classroom.schoolId),
        eq(classrooms.schoolYear, classroom.schoolYear),
        eq(classrooms.isDli, true),
        eq(classrooms.active, true),
        ne(classrooms.id, classroom.id)
      )
    );

  const grade = getGradeSortOrder(classroom.gradeLevel);
  return sameYearDliRooms.filter(
    (room) => getGradeSortOrder(room.gradeLevel) === grade
  );
}

/** Just the ids — the shape the access checks want. */
export async function getDliPartnerClassroomIds(
  classroomId: string
): Promise<string[]> {
  return (await getDliPartnerClassrooms(classroomId)).map((room) => room.id);
}

/**
 * Whether `userId` reaches `classroomId` by being a real member of its DLI
 * partner — the Blue room parent standing at Red's door.
 *
 * Deliberately checks for a **real `classroom_members` row** in the partner,
 * not partner-of-partner: access hops exactly once, so it can't chain across a
 * school. Someone who is themselves only a partner-member of Blue does not
 * thereby reach Red.
 */
export async function isDliPartnerMember(
  userId: string,
  classroomId: string
): Promise<boolean> {
  const partnerIds = await getDliPartnerClassroomIds(classroomId);
  if (partnerIds.length === 0) return false;

  const membership = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.userId, userId),
      inArray(classroomMembers.classroomId, partnerIds)
    ),
    columns: { id: true },
  });

  return !!membership;
}

/**
 * Every classroom this user reaches as a DLI partner, given the rooms they are
 * a real member of. Built for the Classrooms list, which needs all of them at
 * once and would otherwise issue a query per room.
 *
 * Returns a map from partner room id to the user's own room that opens it, so
 * the list can say *why* an unfamiliar room is on someone's page.
 */
export async function getDliPartnerRoomsForMemberships(
  memberClassroomIds: string[]
): Promise<Map<string, DliPartnerClassroom & { viaClassroomId: string }>> {
  const partners = new Map<
    string,
    DliPartnerClassroom & { viaClassroomId: string }
  >();

  for (const classroomId of memberClassroomIds) {
    for (const partner of await getDliPartnerClassrooms(classroomId)) {
      // A room the user is already a real member of is theirs, not a partner's.
      if (memberClassroomIds.includes(partner.id)) continue;
      if (!partners.has(partner.id)) {
        partners.set(partner.id, { ...partner, viaClassroomId: classroomId });
      }
    }
  }

  return partners;
}
