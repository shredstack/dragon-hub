"use server";

import { assertAuthenticated, assertSuperAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { schools, schoolMemberships, users, superAdmins } from "@/lib/db/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import type { SchoolRole } from "@/types";

function generateJoinCode(schoolName: string): string {
  // Generate code like "DRAPER2026" from school name
  const abbrev = schoolName
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 6);
  const year = CURRENT_SCHOOL_YEAR.split("-")[1]; // Get "2026" from "2025-2026"
  return `${abbrev}${year}`;
}

export async function listAllSchools() {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  return db
    .select({
      id: schools.id,
      name: schools.name,
      joinCode: schools.joinCode,
      mascot: schools.mascot,
      address: schools.address,
      active: schools.active,
      createdAt: schools.createdAt,
      memberCount: sql<number>`count(distinct ${schoolMemberships.userId})::int`,
    })
    .from(schools)
    .leftJoin(
      schoolMemberships,
      and(
        eq(schools.id, schoolMemberships.schoolId),
        eq(schoolMemberships.status, "approved"),
        eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
      )
    )
    .groupBy(schools.id)
    .orderBy(schools.name);
}

export async function getSchoolDetails(schoolId: string) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) throw new Error("School not found");

  // Get member count
  const memberStats = await db
    .select({
      totalMembers: sql<number>`count(*)::int`,
      adminCount: sql<number>`count(*) filter (where ${schoolMemberships.role} = 'admin')::int`,
      ptaBoardCount: sql<number>`count(*) filter (where ${schoolMemberships.role} = 'pta_board')::int`,
      memberCount: sql<number>`count(*) filter (where ${schoolMemberships.role} = 'member')::int`,
    })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.status, "approved"),
        eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
      )
    );

  return {
    ...school,
    stats: memberStats[0],
  };
}

export async function getSchoolMembers(schoolId: string) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  return db
    .select({
      id: schoolMemberships.id,
      userId: schoolMemberships.userId,
      role: schoolMemberships.role,
      status: schoolMemberships.status,
      schoolYear: schoolMemberships.schoolYear,
      createdAt: schoolMemberships.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(schoolMemberships)
    .innerJoin(users, eq(schoolMemberships.userId, users.id))
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
      )
    )
    .orderBy(desc(schoolMemberships.createdAt));
}

export async function createSchool(data: {
  name: string;
  mascot?: string;
  address?: string;
}) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const joinCode = generateJoinCode(data.name);

  // Check if join code already exists
  const existing = await db.query.schools.findFirst({
    where: eq(schools.joinCode, joinCode),
  });

  if (existing) {
    throw new Error(
      `Join code ${joinCode} already exists. Please use a different school name.`
    );
  }

  const [school] = await db
    .insert(schools)
    .values({
      name: data.name,
      joinCode,
      mascot: data.mascot,
      address: data.address,
      createdBy: user.id,
    })
    .returning();

  revalidatePath("/super-admin/schools");
  return school;
}

export async function updateSchool(
  schoolId: string,
  data: {
    name?: string;
    mascot?: string;
    address?: string;
    active?: boolean;
  }
) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const [school] = await db
    .update(schools)
    .set(data)
    .where(eq(schools.id, schoolId))
    .returning();

  revalidatePath("/super-admin/schools");
  revalidatePath(`/super-admin/schools/${schoolId}`);
  return school;
}

export async function regenerateJoinCode(schoolId: string) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });

  if (!school) throw new Error("School not found");

  // Generate new code with random suffix to avoid collision
  const baseCode = generateJoinCode(school.name);
  const randomSuffix = Math.random().toString(36).substring(2, 4).toUpperCase();
  const newCode = `${baseCode}${randomSuffix}`;

  const [updated] = await db
    .update(schools)
    .set({ joinCode: newCode })
    .where(eq(schools.id, schoolId))
    .returning();

  revalidatePath("/super-admin/schools");
  revalidatePath(`/super-admin/schools/${schoolId}`);
  return updated;
}

export async function assignSchoolAdmin(schoolId: string, userEmail: string) {
  const currentUser = await assertAuthenticated();
  await assertSuperAdmin(currentUser.id!);

  // Find the user by email
  const targetUser = await db.query.users.findFirst({
    where: eq(users.email, userEmail),
  });

  if (!targetUser) {
    throw new Error(`User with email ${userEmail} not found`);
  }

  // Check if they already have a membership for this school/year
  const existingMembership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.userId, targetUser.id),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  if (existingMembership) {
    // Update existing membership to admin
    await db
      .update(schoolMemberships)
      .set({ role: "admin", status: "approved" })
      .where(eq(schoolMemberships.id, existingMembership.id));
  } else {
    // Create new admin membership
    await db.insert(schoolMemberships).values({
      schoolId,
      userId: targetUser.id,
      role: "admin",
      schoolYear: CURRENT_SCHOOL_YEAR,
      status: "approved",
      invitedBy: currentUser.id,
      approvedAt: new Date(),
    });
  }

  revalidatePath(`/super-admin/schools/${schoolId}`);
  return { success: true };
}

export async function updateMemberRole(
  membershipId: string,
  role: SchoolRole
) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const [updated] = await db
    .update(schoolMemberships)
    .set({ role })
    .where(eq(schoolMemberships.id, membershipId))
    .returning();

  revalidatePath("/super-admin/schools");
  return updated;
}

export async function removeMember(membershipId: string) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  await db
    .update(schoolMemberships)
    .set({ status: "revoked" })
    .where(eq(schoolMemberships.id, membershipId));

  revalidatePath("/super-admin/schools");
  return { success: true };
}

export async function getSuperAdminStats() {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const [stats] = await db
    .select({
      totalSchools: sql<number>`count(distinct ${schools.id})::int`,
      activeSchools: sql<number>`count(distinct ${schools.id}) filter (where ${schools.active} = true)::int`,
      totalUsers: sql<number>`count(distinct ${users.id})::int`,
      totalMemberships: sql<number>`count(distinct ${schoolMemberships.id})::int`,
    })
    .from(schools)
    .leftJoin(users, sql`true`)
    .leftJoin(
      schoolMemberships,
      and(
        eq(schoolMemberships.status, "approved"),
        eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
      )
    );

  return stats;
}

export async function searchUsersGlobal(query: string) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(
      sql`${users.email} ilike ${`%${query}%`} or ${users.name} ilike ${`%${query}%`}`
    )
    .limit(20);
}
