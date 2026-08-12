/**
 * Putting a teacher inside the classroom the board said was theirs.
 *
 * The teacher list (`classroom_teachers`) was display-only: the board typed
 * addresses into the classroom form, they rendered next to the room name, and
 * nothing else ever looked at them. A teacher who signed in with exactly that
 * address landed on an empty Classrooms page, because classroom access comes
 * from a `classroom_members` row and only volunteer signups ever wrote one.
 *
 * A room can name **several** teachers — a half-day room is one teacher in the
 * morning and another in the afternoon — and each of them gets their own
 * `teacher` row. They are peers: neither is the room's "real" teacher, and
 * nothing here treats the first one differently.
 *
 * This is the fourth linker alongside `volunteer-linking.ts` and the committee
 * and event-plan ones in `auth.ts`, and it works the same way: the email is the
 * claim, signing in is the proof, and the row is written on the way in.
 *
 * Two rules are load-bearing:
 *
 *  - **The address must be verified.** Everything here keys off an email a
 *    board member typed by hand, and a typo would otherwise hand a stranger the
 *    room parents' private message board. Every sign-in path in this app
 *    (magic link, Google, Apple) stamps `emailVerified`, so requiring it costs
 *    nothing real and closes that door.
 *  - **The designation is the admission, and grants nothing beyond it.** A
 *    teacher who has never joined the school gets a `member` membership (source
 *    `classroom_teacher`) so sign-in alone is enough to reach their room. It is
 *    school `member`, never `admin` or `pta_board`: the `teacher` role is scoped
 *    to the classroom, where it means "can post and run tasks in this room",
 *    and confers no governance anywhere. A `revoked` membership is left alone,
 *    exactly as `linkExistingAccountToSchool` leaves it — that status means
 *    "not without an administrator".
 */

import { db } from "@/lib/db";
import {
  classroomMembers,
  classroomTeachers,
  classrooms,
  schoolMemberships,
  users,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";

/**
 * Every active classroom in its school's *current* year that names this address
 * as one of its teachers.
 *
 * Current-year only, deliberately: each school year gets its own classroom row,
 * and a teacher who has been at the school for six years would otherwise
 * collect six rooms on their Classrooms page. Last year's membership row stays
 * where it is — it is that year's history.
 */
async function currentYearClassroomsForTeacher(email: string) {
  const rooms = await db
    .selectDistinct({
      id: classrooms.id,
      schoolId: classrooms.schoolId,
      schoolYear: classrooms.schoolYear,
    })
    .from(classroomTeachers)
    .innerJoin(classrooms, eq(classrooms.id, classroomTeachers.classroomId))
    .where(
      and(
        eq(classrooms.active, true),
        isNotNull(classrooms.schoolId),
        // Stored lowercased by `setClassroomTeachers`, so plain equality is a
        // case-insensitive match and the index on `email` is usable.
        eq(classroomTeachers.email, email.trim().toLowerCase())
      )
    );

  const currentYearBySchool = new Map<string, string>();
  const matches: Array<{ id: string; schoolId: string; schoolYear: string }> =
    [];

  for (const room of rooms) {
    if (!room.schoolId) continue;
    let currentYear = currentYearBySchool.get(room.schoolId);
    if (currentYear === undefined) {
      currentYear = await getSchoolCurrentYear(room.schoolId);
      currentYearBySchool.set(room.schoolId, currentYear);
    }
    if (room.schoolYear !== currentYear) continue;
    matches.push({
      id: room.id,
      schoolId: room.schoolId,
      schoolYear: room.schoolYear,
    });
  }

  return matches;
}

/**
 * Makes sure this teacher belongs to the school, so their classroom is
 * reachable at all. Returns false when a `revoked` membership says to stay out.
 */
async function ensureTeacherSchoolMembership(
  userId: string,
  schoolId: string,
  schoolYear: string
): Promise<boolean> {
  const existing = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear)
    ),
  });

  if (existing) {
    if (existing.status === "revoked") return false;
    // `removed` or `expired` and now teaching a room again — the same
    // reinstatement `linkExistingAccountToSchool` does for a volunteer. Role is
    // untouched: a board member who also teaches keeps `pta_board`.
    if (existing.status !== "approved") {
      await db
        .update(schoolMemberships)
        .set({ status: "approved", approvedAt: new Date() })
        .where(eq(schoolMemberships.id, existing.id));
    }
    return true;
  }

  await db.insert(schoolMemberships).values({
    userId,
    schoolId,
    role: "member",
    schoolYear,
    status: "approved",
    source: "classroom_teacher",
    approvedAt: new Date(),
  });
  return true;
}

/**
 * Gives `userId` the `teacher` role in `classroomId`, without demoting anyone.
 *
 * An existing row is upgraded to `teacher` from the volunteer-side roles only —
 * a teacher who also volunteers in another parent's room should not have their
 * `pta_board` row rewritten by teaching one.
 */
async function ensureTeacherClassroomMembership(
  userId: string,
  classroomId: string
) {
  const existing = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.userId, userId),
      eq(classroomMembers.classroomId, classroomId)
    ),
  });

  if (!existing) {
    await db
      .insert(classroomMembers)
      .values({ userId, classroomId, role: "teacher" })
      .onConflictDoNothing();
    return;
  }

  if (existing.role === "volunteer" || existing.role === "room_parent") {
    await db
      .update(classroomMembers)
      .set({ role: "teacher" })
      .where(eq(classroomMembers.id, existing.id));
  }
}

/**
 * Called on sign-in, next to the volunteer / committee / event-plan linkers.
 *
 * Safe to re-run: every write is an upsert or a no-op, which it has to be,
 * because the `signIn` event fires on every single sign-in.
 */
export async function linkTeacherClassroomsToUser(
  userId: string,
  email: string
): Promise<{ linked: number }> {
  // The claim is an address someone typed into a form; the proof is that this
  // account demonstrably owns it. Without that this is an open door.
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { emailVerified: true },
  });
  if (!user?.emailVerified) return { linked: 0 };

  const rooms = await currentYearClassroomsForTeacher(email);
  if (rooms.length === 0) return { linked: 0 };

  let linked = 0;
  for (const room of rooms) {
    const admitted = await ensureTeacherSchoolMembership(
      userId,
      room.schoolId,
      room.schoolYear
    );
    if (!admitted) continue;
    await ensureTeacherClassroomMembership(userId, room.id);
    linked += 1;
  }

  return { linked };
}

/**
 * The other direction: the board just set or changed a classroom's teachers,
 * and they may well already have accounts.
 *
 * Without this, editing the list would do nothing until each teacher happened
 * to sign in again — which for someone already signed in is "next week". Call
 * it from the classroom create/update path and from year rollover, after any
 * `setClassroomTeachers()` write has committed.
 *
 * It also *removes* teachers who have come off the list, which is the half a
 * sign-in-time linker structurally cannot do: a half-day room that swaps its
 * afternoon teacher mid-year must not leave the previous one reading the room's
 * board. Only rows this mechanism granted (`role = 'teacher'`) are touched, so
 * a teacher who is also a room parent in that room keeps that seat.
 */
export async function syncClassroomTeacherMembership(
  classroomId: string
): Promise<void> {
  const classroom = await db.query.classrooms.findFirst({
    where: eq(classrooms.id, classroomId),
    columns: { id: true, schoolId: true, schoolYear: true, active: true },
  });
  if (!classroom?.schoolId) return;

  // A deactivated room grants nothing, matching the sign-in linker, which only
  // ever looks at active classrooms. Deactivating therefore retires every
  // teacher's access rather than leaving it dangling.
  const emails = classroom.active
    ? (
        await db
          .select({ email: classroomTeachers.email })
          .from(classroomTeachers)
          .where(eq(classroomTeachers.classroomId, classroomId))
      ).map((t) => t.email)
    : [];

  // Each address is a claim; owning the account is the proof. An unverified or
  // not-yet-existing account keeps the room's other teachers linked regardless
  // — one teacher who hasn't signed in must not hold up the other.
  const accounts = emails.length
    ? await db
        .select({ id: users.id, emailVerified: users.emailVerified })
        .from(users)
        .where(inArray(sql`lower(${users.email})`, emails))
    : [];

  const keepUserIds = accounts.filter((a) => a.emailVerified).map((a) => a.id);

  // Retire anyone no longer named. Scoped to `teacher` rows so a room parent or
  // a board member sitting in this classroom is never swept up.
  await db
    .delete(classroomMembers)
    .where(
      and(
        eq(classroomMembers.classroomId, classroomId),
        eq(classroomMembers.role, "teacher"),
        ...(keepUserIds.length
          ? [notInArray(classroomMembers.userId, keepUserIds)]
          : [])
      )
    );

  for (const userId of keepUserIds) {
    const admitted = await ensureTeacherSchoolMembership(
      userId,
      classroom.schoolId,
      classroom.schoolYear
    );
    if (!admitted) continue;
    await ensureTeacherClassroomMembership(userId, classroomId);
  }
}

/**
 * Which of `emails` belong to an account that is actually inside `classroomId`
 * as a teacher — i.e. who has signed in and been linked.
 *
 * `/admin/classrooms` uses this to say "hasn't signed in yet" beside the one
 * address that hasn't landed, rather than beside the whole room. The list is
 * typed by hand and is what grants the access, so a typo has to be visible.
 */
export async function linkedTeacherEmailsForClassrooms(
  classroomIds: string[]
): Promise<Set<string>> {
  if (classroomIds.length === 0) return new Set();

  const rows = await db
    .select({
      classroomId: classroomMembers.classroomId,
      email: users.email,
    })
    .from(classroomMembers)
    .innerJoin(users, eq(users.id, classroomMembers.userId))
    .where(
      and(
        inArray(classroomMembers.classroomId, classroomIds),
        eq(classroomMembers.role, "teacher")
      )
    );

  return new Set(
    rows
      .filter((r) => r.email)
      .map((r) => `${r.classroomId}:${r.email!.trim().toLowerCase()}`)
  );
}

/** The key `linkedTeacherEmailsForClassrooms`'s set is built from. */
export function linkedTeacherKey(classroomId: string, email: string): string {
  return `${classroomId}:${email.trim().toLowerCase()}`;
}
