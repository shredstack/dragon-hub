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
import {
  getSchoolCurrentYear,
  getSchoolYearConfig as getSchoolYearConfigHelper,
  getNextSchoolYear,
  getDefaultSchoolYears,
  generateSchoolYear,
  parseSchoolYear,
} from "@/lib/school-year";

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

  // Get school's configured year (falls back to global constant)
  const currentSchoolYear = school.currentSchoolYear ?? CURRENT_SCHOOL_YEAR;
  const availableYears = school.availableSchoolYears ?? getDefaultSchoolYears().available;

  // Count memberships by status for current year
  const currentYearMemberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, currentSchoolYear)
    ),
  });

  const approvedCount = currentYearMemberships.filter(
    (m) => m.status === "approved"
  ).length;

  // Check for any previous year memberships that are still approved (should be expired)
  const previousYearMemberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      ne(schoolMemberships.schoolYear, currentSchoolYear),
      eq(schoolMemberships.status, "approved")
    ),
  });

  const nextSchoolYear = getNextSchoolYear(currentSchoolYear);

  // Check if any memberships exist for next year (transition already started)
  const nextYearMemberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, nextSchoolYear)
    ),
  });

  return {
    currentSchoolYear,
    nextSchoolYear,
    currentJoinCode: school.joinCode,
    availableYears,
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

  // Get school's configured current year
  const currentSchoolYear = await getSchoolCurrentYear(schoolId);

  // Mark all non-current-year approved memberships as expired
  await db
    .update(schoolMemberships)
    .set({ status: "expired" })
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        ne(schoolMemberships.schoolYear, currentSchoolYear),
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

  const currentSchoolYear = school.currentSchoolYear ?? CURRENT_SCHOOL_YEAR;
  const nextSchoolYear = getNextSchoolYear(currentSchoolYear);
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

  const currentSchoolYear = await getSchoolCurrentYear(schoolId);
  const nextSchoolYear = getNextSchoolYear(currentSchoolYear);

  // Get the memberships to renew
  const membershipsToRenew = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, currentSchoolYear),
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

  const currentSchoolYear = await getSchoolCurrentYear(schoolId);
  const nextSchoolYear = getNextSchoolYear(currentSchoolYear);

  // Get current year members
  const currentMembers = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, currentSchoolYear),
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

  const currentSchoolYear = await getSchoolCurrentYear(schoolId);
  const nextSchoolYear = getNextSchoolYear(currentSchoolYear);

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

  const currentSchoolYear = await getSchoolCurrentYear(schoolId);
  const nextSchoolYear = getNextSchoolYear(currentSchoolYear);

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
    currentSchoolYear,
    nextSchoolYear,
  };
}

// ─── School Year Configuration Actions ───────────────────────────────────────

/**
 * Update the school's current school year
 */
export async function updateCurrentSchoolYear(year: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const isAdmin = await isSchoolAdmin(user.id!, schoolId);
  if (!isAdmin) throw new Error("Unauthorized: School Admin access required");

  // Validate year format (YYYY-YYYY)
  if (!/^\d{4}-\d{4}$/.test(year)) {
    throw new Error("Invalid school year format. Use YYYY-YYYY (e.g., 2025-2026)");
  }

  await db
    .update(schools)
    .set({ currentSchoolYear: year })
    .where(eq(schools.id, schoolId));

  revalidatePath("/admin/school-year");
  revalidatePath("/admin/classrooms");
  revalidatePath("/admin/members");

  return { success: true, currentSchoolYear: year };
}

/**
 * Add a school year to the available options
 */
export async function addAvailableSchoolYear(year: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const isAdmin = await isSchoolAdmin(user.id!, schoolId);
  if (!isAdmin) throw new Error("Unauthorized: School Admin access required");

  // Validate year format
  if (!/^\d{4}-\d{4}$/.test(year)) {
    throw new Error("Invalid school year format. Use YYYY-YYYY (e.g., 2025-2026)");
  }

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { availableSchoolYears: true },
  });

  const currentYears = school?.availableSchoolYears ?? getDefaultSchoolYears().available;

  // Don't add duplicates
  if (currentYears.includes(year)) {
    return { success: true, availableYears: currentYears };
  }

  // Add and sort (most recent first)
  const updatedYears = [...currentYears, year].sort((a, b) => {
    const yearA = parseSchoolYear(a);
    const yearB = parseSchoolYear(b);
    return yearB - yearA;
  });

  await db
    .update(schools)
    .set({ availableSchoolYears: updatedYears })
    .where(eq(schools.id, schoolId));

  revalidatePath("/admin/school-year");

  return { success: true, availableYears: updatedYears };
}

/**
 * Remove a school year from the available options
 */
export async function removeAvailableSchoolYear(year: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const isAdmin = await isSchoolAdmin(user.id!, schoolId);
  if (!isAdmin) throw new Error("Unauthorized: School Admin access required");

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { availableSchoolYears: true, currentSchoolYear: true },
  });

  // Can't remove the current school year
  const currentYear = school?.currentSchoolYear ?? CURRENT_SCHOOL_YEAR;
  if (year === currentYear) {
    throw new Error("Cannot remove the current school year. Change the current year first.");
  }

  const currentYears = school?.availableSchoolYears ?? getDefaultSchoolYears().available;
  const updatedYears = currentYears.filter((y) => y !== year);

  // Must have at least one year
  if (updatedYears.length === 0) {
    throw new Error("Must have at least one available school year");
  }

  await db
    .update(schools)
    .set({ availableSchoolYears: updatedYears })
    .where(eq(schools.id, schoolId));

  revalidatePath("/admin/school-year");

  return { success: true, availableYears: updatedYears };
}

/**
 * Add the next school year to available options (convenience action)
 */
export async function addNextSchoolYear() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const isAdmin = await isSchoolAdmin(user.id!, schoolId);
  if (!isAdmin) throw new Error("Unauthorized: School Admin access required");

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { availableSchoolYears: true, currentSchoolYear: true },
  });

  const currentYear = school?.currentSchoolYear ?? CURRENT_SCHOOL_YEAR;
  const nextYear = getNextSchoolYear(currentYear);

  return addAvailableSchoolYear(nextYear);
}
