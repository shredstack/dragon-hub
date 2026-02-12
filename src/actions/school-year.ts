"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
  isSchoolAdmin,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { schoolMemberships, schools } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";

/**
 * Get the next school year string (e.g., "2025-2026" -> "2026-2027")
 */
function getNextSchoolYear(currentYear: string): string {
  const [start] = currentYear.split("-").map(Number);
  return `${start + 1}-${start + 2}`;
}

/**
 * Generate a new join code for a school year
 */
function generateJoinCode(schoolName: string, year: string): string {
  const abbrev = schoolName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 6);
  const yearEnd = year.split("-")[1];
  return `${abbrev}${yearEnd}`;
}

/**
 * Get school year transition status and stats
 */
export async function getSchoolYearStatus() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  if (!school) throw new Error("School not found");

  // Count memberships by status for current year
  const currentYearMemberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  const approvedCount = currentYearMemberships.filter(
    (m) => m.status === "approved"
  ).length;

  // Check for any previous year memberships that are still approved (should be expired)
  const previousYearMemberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      ne(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
      eq(schoolMemberships.status, "approved")
    ),
  });

  const nextSchoolYear = getNextSchoolYear(CURRENT_SCHOOL_YEAR);

  // Check if any memberships exist for next year (transition already started)
  const nextYearMemberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, nextSchoolYear)
    ),
  });

  return {
    currentSchoolYear: CURRENT_SCHOOL_YEAR,
    nextSchoolYear,
    currentJoinCode: school.joinCode,
    stats: {
      currentYearApproved: approvedCount,
      previousYearPending: previousYearMemberships.length,
      nextYearRenewed: nextYearMemberships.filter((m) => m.status === "approved")
        .length,
    },
    transitionStarted: nextYearMemberships.length > 0,
  };
}

/**
 * Expire all memberships from previous school years
 * Called by admin to clean up old memberships
 */
export async function expirePreviousYearMemberships() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Only school admins can perform year transitions
  const isAdmin = await isSchoolAdmin(user.id!, schoolId);
  if (!isAdmin) throw new Error("Unauthorized: School Admin access required");

  // Mark all non-current-year approved memberships as expired
  await db
    .update(schoolMemberships)
    .set({ status: "expired" })
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        ne(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
        eq(schoolMemberships.status, "approved")
      )
    );

  revalidatePath("/admin/school-year");
  revalidatePath("/admin/members");

  return { success: true };
}

/**
 * Generate a new join code for the next school year
 */
export async function generateNewYearJoinCode() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const isAdmin = await isSchoolAdmin(user.id!, schoolId);
  if (!isAdmin) throw new Error("Unauthorized: School Admin access required");

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  if (!school) throw new Error("School not found");

  const nextSchoolYear = getNextSchoolYear(CURRENT_SCHOOL_YEAR);
  const newCode = generateJoinCode(school.name, nextSchoolYear);

  await db
    .update(schools)
    .set({ joinCode: newCode })
    .where(eq(schools.id, schoolId));

  revalidatePath("/admin/school-year");

  return { joinCode: newCode, schoolYear: nextSchoolYear };
}

/**
 * Bulk renew memberships for selected users
 * Creates new memberships for the next school year
 */
export async function bulkRenewMemberships(membershipIds: string[]) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const isAdmin = await isSchoolAdmin(user.id!, schoolId);
  if (!isAdmin) throw new Error("Unauthorized: School Admin access required");

  const nextSchoolYear = getNextSchoolYear(CURRENT_SCHOOL_YEAR);

  // Get the memberships to renew
  const membershipsToRenew = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
      eq(schoolMemberships.status, "approved")
    ),
  });

  const idsToRenew = new Set(membershipIds);
  const filtered = membershipsToRenew.filter((m) => idsToRenew.has(m.id));

  if (filtered.length === 0) {
    return { renewed: 0 };
  }

  // Check for existing next-year memberships to avoid duplicates
  const existingNextYear = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, nextSchoolYear)
    ),
  });
  const existingUserIds = new Set(existingNextYear.map((m) => m.userId));

  // Create new memberships for the next school year
  const newMemberships = filtered
    .filter((m) => !existingUserIds.has(m.userId))
    .map((m) => ({
      schoolId: m.schoolId,
      userId: m.userId,
      role: m.role,
      schoolYear: nextSchoolYear,
      status: "approved" as const,
      approvedBy: user.id!,
      approvedAt: new Date(),
      renewedFrom: m.id,
    }));

  if (newMemberships.length > 0) {
    await db.insert(schoolMemberships).values(newMemberships);
  }

  revalidatePath("/admin/school-year");
  revalidatePath("/admin/members");

  return { renewed: newMemberships.length };
}

/**
 * Get members eligible for renewal (current year approved members)
 */
export async function getMembersForRenewal() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const nextSchoolYear = getNextSchoolYear(CURRENT_SCHOOL_YEAR);

  // Get current year members
  const currentMembers = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
      eq(schoolMemberships.status, "approved")
    ),
    with: {
      user: true,
    },
  });

  // Get already renewed members
  const renewedMembers = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, nextSchoolYear)
    ),
  });
  const renewedUserIds = new Set(renewedMembers.map((m) => m.userId));

  return currentMembers.map((m) => ({
    id: m.id,
    userId: m.userId,
    userName: m.user?.name || "Unknown",
    userEmail: m.user?.email || "",
    role: m.role,
    alreadyRenewed: renewedUserIds.has(m.userId),
  }));
}

/**
 * User self-renewal - renew own membership for next year
 */
export async function renewMyMembership() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Check if user has current year membership
  const currentMembership = await getSchoolMembership(user.id!, schoolId);
  if (!currentMembership) {
    throw new Error("No active membership found for current school year");
  }

  const nextSchoolYear = getNextSchoolYear(CURRENT_SCHOOL_YEAR);

  // Check if already renewed
  const existingRenewal = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.userId, user.id!),
      eq(schoolMemberships.schoolYear, nextSchoolYear)
    ),
  });

  if (existingRenewal) {
    return { success: true, alreadyRenewed: true };
  }

  // Create new membership for next year (keep same role, but as member if was admin)
  // Only school admins can promote to admin
  const newRole = currentMembership.role === "admin" ? "member" : currentMembership.role;

  await db.insert(schoolMemberships).values({
    schoolId,
    userId: user.id!,
    role: newRole,
    schoolYear: nextSchoolYear,
    status: "approved",
    approvedAt: new Date(),
    renewedFrom: currentMembership.id,
  });

  revalidatePath("/dashboard");
  revalidatePath("/renew-membership");

  return { success: true, alreadyRenewed: false };
}

/**
 * Check if user needs to renew membership
 */
export async function checkRenewalStatus() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return { needsRenewal: false, hasCurrentMembership: false };

  const currentMembership = await getSchoolMembership(user.id!, schoolId);
  if (!currentMembership) {
    return { needsRenewal: false, hasCurrentMembership: false };
  }

  const nextSchoolYear = getNextSchoolYear(CURRENT_SCHOOL_YEAR);

  const nextYearMembership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.userId, user.id!),
      eq(schoolMemberships.schoolYear, nextSchoolYear)
    ),
  });

  return {
    needsRenewal: !nextYearMembership,
    hasCurrentMembership: true,
    currentSchoolYear: CURRENT_SCHOOL_YEAR,
    nextSchoolYear,
  };
}
