"use server";

import {
  assertAuthenticated,
  assertSchoolAdminRole,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  users,
  classroomMembers,
  schoolMemberships,
  classrooms,
} from "@/lib/db/schema";
import { ilike, or, sql, eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { deleteUserAndReleaseSeats } from "@/lib/account-deletion";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { releaseSignupSeatsForUser } from "@/lib/signup-seats";

export async function searchUsers(query: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);
  await assertPtaBoardMember(user.id!, schoolId);

  // Search only users who are members of the current school
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .innerJoin(
      schoolMemberships,
      and(
        eq(users.id, schoolMemberships.userId),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, schoolYear),
        eq(schoolMemberships.status, "approved")
      )
    )
    .where(
      or(
        ilike(users.email, `%${query}%`),
        ilike(users.name, `%${query}%`)
      )
    )
    .limit(20);
}

export async function getAllUsersWithRoles() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);
  await assertPtaBoardMember(user.id!, schoolId);

  // Get users who are members of the current school, with their classroom roles
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      schoolRole: schoolMemberships.role,
      classroomCount: sql<number>`count(distinct ${classroomMembers.classroomId})`,
      classroomRoles: sql<string>`string_agg(distinct ${classroomMembers.role}::text, ', ')`,
    })
    .from(users)
    .innerJoin(
      schoolMemberships,
      and(
        eq(users.id, schoolMemberships.userId),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, schoolYear),
        eq(schoolMemberships.status, "approved")
      )
    )
    .leftJoin(
      classroomMembers,
      eq(users.id, classroomMembers.userId)
    )
    .leftJoin(
      classrooms,
      and(
        eq(classroomMembers.classroomId, classrooms.id),
        eq(classrooms.schoolId, schoolId)
      )
    )
    .groupBy(users.id, schoolMemberships.role)
    .orderBy(users.name);
}

/**
 * Permanently deletes an account platform-wide — every school, every year, and
 * every record that cascades off `users` (their volunteer hours included).
 *
 * This is NOT how you take someone off the roster; `removeMember` is. It exists
 * for spam and duplicate signups, so it's gated to the School Admin role rather
 * than the whole PTA board, and the school-membership check below only confirms
 * the target is yours to act on — the deletion itself is not school-scoped.
 *
 * Seats come first and deliberately outside the transaction. A signup row is
 * the seat, and `user_id` is set-null on delete, so deleting the account alone
 * would leave an `active` row holding a room parent spot or a per-classroom
 * committee cap under the name the parent typed — a spot nobody could see was
 * empty, with the waitlist behind it never moving. `releaseSignupSeatsForUser`
 * hands them back through the ordinary removal path, which promotes and emails
 * whoever is next; that path opens its own transactions, so it must not be
 * nested inside this one.
 */
export async function deleteUser(userId: string) {
  const currentUser = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);
  await assertSchoolAdminRole(currentUser.id!, schoolId);

  // Prevent self-deletion
  if (currentUser.id === userId) {
    throw new Error("You cannot delete your own account");
  }

  // Verify the target user is a member of this school
  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear)
    ),
  });

  if (!membership) {
    throw new Error("User is not a member of this school");
  }

  // Release seats, then delete. Shared with the self-service path in
  // src/actions/account.ts — the *authorization* above is what differs between
  // them, and deliberately stays different.
  const released = await deleteUserAndReleaseSeats({
    userId,
    actorId: currentUser.id!,
  });

  revalidatePath("/admin/members");
  // Both of these count seats, so neither can be left showing the deleted
  // person still holding one. The public sign-up page needs no help: it renders
  // per request, which is why it reported the stale "full" honestly.
  if (released.volunteer > 0) revalidatePath("/admin/room-parents");
  if (released.committee > 0) revalidatePath("/admin/committees");
  return { success: true, released };
}
