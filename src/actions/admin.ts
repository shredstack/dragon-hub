"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users, classroomMembers, schoolMemberships, classrooms } from "@/lib/db/schema";
import { ilike, or, sql, eq, and } from "drizzle-orm";
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
