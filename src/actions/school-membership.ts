"use server";

import {
  assertAuthenticated,
  getSchoolByJoinCode,
  getUserSchoolMembership,
  setCurrentSchoolId,
  assertSchoolMember,
  isSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { schoolMemberships, schools } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import type { SchoolRole } from "@/types";

export async function joinSchool(joinCode: string) {
  const user = await assertAuthenticated();

  // Normalize the join code (uppercase, trim)
  const normalizedCode = joinCode.trim().toUpperCase();

  // Find the school by join code
  const school = await getSchoolByJoinCode(normalizedCode);

  if (!school) {
    throw new Error("Invalid school code. Please check and try again.");
  }

  // Check if user already has a membership for this school/year
  const existingMembership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.schoolId, school.id),
      eq(schoolMemberships.userId, user.id!),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  if (existingMembership) {
    if (existingMembership.status === "approved") {
      // Already a member, just set the cookie and return
      await setCurrentSchoolId(school.id);
      return { success: true, school, alreadyMember: true };
    } else if (existingMembership.status === "revoked") {
      throw new Error(
        "Your access to this school has been revoked. Please contact a school administrator."
      );
    } else if (existingMembership.status === "expired") {
      // Renew the membership
      await db
        .update(schoolMemberships)
        .set({
          status: "approved",
          approvedAt: new Date(),
          renewedFrom: existingMembership.id,
        })
        .where(eq(schoolMemberships.id, existingMembership.id));

      await setCurrentSchoolId(school.id);
      revalidatePath("/dashboard");
      return { success: true, school, renewed: true };
    }
  }

  // Create new membership (auto-approved since they have the code)
  await db.insert(schoolMemberships).values({
    schoolId: school.id,
    userId: user.id!,
    role: "member",
    schoolYear: CURRENT_SCHOOL_YEAR,
    status: "approved",
    approvedAt: new Date(),
  });

  // Set the current school cookie
  await setCurrentSchoolId(school.id);

  revalidatePath("/dashboard");
  return { success: true, school };
}

export async function getCurrentUserSchool() {
  const user = await assertAuthenticated();
  return getUserSchoolMembership(user.id!);
}

export async function leaveSchool(schoolId: string) {
  const user = await assertAuthenticated();

  // Verify they're a member
  await assertSchoolMember(user.id!, schoolId);

  // Update status to revoked (self-revoked)
  await db
    .update(schoolMemberships)
    .set({ status: "revoked" })
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.userId, user.id!),
        eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
      )
    );

  revalidatePath("/dashboard");
  return { success: true };
}

export async function getSchoolMembers(schoolId: string) {
  const user = await assertAuthenticated();

  // Only PTA board or admin can view members
  const hasAccess = await isSchoolPtaBoardOrAdmin(user.id!, schoolId);
  if (!hasAccess) {
    throw new Error("Unauthorized: You don't have access to view members");
  }

  return db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
      eq(schoolMemberships.status, "approved")
    ),
    with: {
      user: true,
    },
  });
}

export async function updateMemberRole(
  schoolId: string,
  membershipId: string,
  role: SchoolRole
) {
  const user = await assertAuthenticated();

  // Only school admin can change roles
  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.userId, user.id!),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
      eq(schoolMemberships.status, "approved")
    ),
  });

  if (!membership || membership.role !== "admin") {
    throw new Error("Unauthorized: Only school admins can change member roles");
  }

  await db
    .update(schoolMemberships)
    .set({ role })
    .where(eq(schoolMemberships.id, membershipId));

  revalidatePath("/admin/members");
  return { success: true };
}

export async function removeMember(schoolId: string, membershipId: string) {
  const user = await assertAuthenticated();

  // Only school admin or PTA board can remove members
  const hasAccess = await isSchoolPtaBoardOrAdmin(user.id!, schoolId);
  if (!hasAccess) {
    throw new Error("Unauthorized: You don't have permission to remove members");
  }

  await db
    .update(schoolMemberships)
    .set({ status: "revoked" })
    .where(eq(schoolMemberships.id, membershipId));

  revalidatePath("/admin/members");
  return { success: true };
}

export async function getSchoolInfo(schoolId: string) {
  const user = await assertAuthenticated();

  // Verify membership
  await assertSchoolMember(user.id!, schoolId);

  return db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
}
