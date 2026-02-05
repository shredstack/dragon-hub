"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  assertSuperAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  users,
  classroomMembers,
  schoolMemberships,
  classrooms,
  schools,
  classroomMessages,
  classroomTasks,
  roomParents,
  knowledgeArticles,
  eventPlanTasks,
  eventPlanMessages,
  eventPlanResources,
  volunteerHours,
  superAdmins,
} from "@/lib/db/schema";
import { ilike, or, sql, eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";

export async function searchUsers(query: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Search only users who are members of the current school
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .innerJoin(
      schoolMemberships,
      and(
        eq(users.id, schoolMemberships.userId),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
        eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
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

export async function deleteUser(userId: string) {
  const currentUser = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSuperAdmin(currentUser.id!);

  // Prevent self-deletion
  if (currentUser.id === userId) {
    throw new Error("You cannot delete your own account");
  }

  // Verify the target user is a member of this school
  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  if (!membership) {
    throw new Error("User is not a member of this school");
  }

  // Use a transaction to ensure atomicity - all updates and deletion succeed or fail together
  await db.transaction(async (tx) => {
    // Nullify foreign key references that don't have cascade delete
    await Promise.all([
      tx.update(schools).set({ createdBy: null }).where(eq(schools.createdBy, userId)),
      tx.update(schoolMemberships).set({ invitedBy: null }).where(eq(schoolMemberships.invitedBy, userId)),
      tx.update(classroomMessages).set({ authorId: null }).where(eq(classroomMessages.authorId, userId)),
      tx.update(classroomTasks).set({ createdBy: null }).where(eq(classroomTasks.createdBy, userId)),
      tx.update(classroomTasks).set({ assignedTo: null }).where(eq(classroomTasks.assignedTo, userId)),
      tx.update(roomParents).set({ userId: null }).where(eq(roomParents.userId, userId)),
      tx.update(knowledgeArticles).set({ createdBy: null }).where(eq(knowledgeArticles.createdBy, userId)),
      tx.update(eventPlanTasks).set({ createdBy: null }).where(eq(eventPlanTasks.createdBy, userId)),
      tx.update(eventPlanTasks).set({ assignedTo: null }).where(eq(eventPlanTasks.assignedTo, userId)),
      tx.update(eventPlanMessages).set({ authorId: null }).where(eq(eventPlanMessages.authorId, userId)),
      tx.update(eventPlanResources).set({ addedBy: null }).where(eq(eventPlanResources.addedBy, userId)),
      tx.update(volunteerHours).set({ approvedBy: null }).where(eq(volunteerHours.approvedBy, userId)),
      tx.update(superAdmins).set({ grantedBy: null }).where(eq(superAdmins.grantedBy, userId)),
    ]);

    // Delete the user - cascade will handle remaining related records
    await tx.delete(users).where(eq(users.id, userId));
  });

  revalidatePath("/admin/members");
  return { success: true };
}
