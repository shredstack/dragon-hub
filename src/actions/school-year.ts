"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
  isSchoolAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { committees, schoolMemberships, schools } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import {
  getSchoolCurrentYear,
  getNextSchoolYear,
  getPreviousSchoolYear,
  getDefaultSchoolYears,
  parseSchoolYear,
  assertValidSchoolYear,
} from "@/lib/school-year";
import { performRollover, isLeadershipRole } from "@/lib/school-year-rollover";
import { findClassroomsToPromote } from "@/lib/classroom-rollover";

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
  const availableYears =
    school.availableSchoolYears ?? getDefaultSchoolYears().available;

  const all = await db.query.schoolMemberships.findMany({
    where: eq(schoolMemberships.schoolId, schoolId),
  });

  const currentYear = all.filter((m) => m.schoolYear === currentSchoolYear);
  const approved = currentYear.filter((m) => m.status === "approved");
  const leadership = approved.filter((m) => isLeadershipRole(m.role));

  // Members who were approved last year but haven't rejoined for this one.
  const previousYear = getPreviousSchoolYear(currentSchoolYear);
  const currentUserIds = new Set(approved.map((m) => m.userId));
  const awaitingRejoin = all.filter(
    (m) =>
      m.schoolYear === previousYear &&
      !isLeadershipRole(m.role) &&
      !currentUserIds.has(m.userId)
  );

  const nextSchoolYear = getNextSchoolYear(currentSchoolYear);

  return {
    currentSchoolYear,
    previousSchoolYear: previousYear,
    nextSchoolYear,
    currentJoinCode: school.joinCode,
    availableYears,
    stats: {
      currentYearApproved: approved.length,
      currentYearLeadership: leadership.length,
      awaitingRejoin: awaitingRejoin.length,
    },
    /** True when the school has no admin/board for its own active year. */
    lockoutRisk: leadership.length === 0,
  };
}

/**
 * Preview exactly what a rollover to `targetYear` will do, without changing
 * anything. The wizard shows this before the admin confirms.
 */
export async function previewRollover(targetYear: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  assertValidSchoolYear(targetYear);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  if (!school) throw new Error("School not found");

  const fromYear = school.currentSchoolYear ?? CURRENT_SCHOOL_YEAR;
  if (targetYear === fromYear) {
    throw new Error(`${targetYear} is already the current school year.`);
  }
  if (parseSchoolYear(targetYear) < parseSchoolYear(fromYear)) {
    throw new Error(
      `Cannot roll back to ${targetYear}. Use the year selector to view past-year data instead.`
    );
  }

  const all = await db.query.schoolMemberships.findMany({
    where: eq(schoolMemberships.schoolId, schoolId),
    with: { user: true },
  });

  const outgoing = all.filter(
    (m) => m.schoolYear === fromYear && m.status === "approved"
  );
  const alreadyInTarget = new Set(
    all.filter((m) => m.schoolYear === targetYear).map((m) => m.userId)
  );

  const carriedOver = outgoing
    .filter((m) => isLeadershipRole(m.role))
    .map((m) => ({
      membershipId: m.id,
      name: m.user?.name ?? "Unknown",
      email: m.user?.email ?? "",
      role: m.role,
      boardPosition: m.boardPosition,
      alreadyPresent: alreadyInTarget.has(m.userId),
    }));

  const mustRejoin = outgoing
    .filter((m) => !isLeadershipRole(m.role))
    .map((m) => ({
      membershipId: m.id,
      name: m.user?.name ?? "Unknown",
      email: m.user?.email ?? "",
      role: m.role,
    }));

  // Rooms that would be copied into the new year, so the wizard can say how
  // many rather than leaving it as a surprise.
  const classroomsToCopy = await findClassroomsToPromote(db, schoolId, targetYear);

  // Same, for committees: this year's non-archived committees whose name isn't
  // already taken in the target year. Roster never carries — just the config.
  const [sourceCommittees, targetCommittees] = await Promise.all([
    db.query.committees.findMany({
      where: and(
        eq(committees.schoolId, schoolId),
        eq(committees.schoolYear, fromYear),
        isNull(committees.archivedAt)
      ),
      columns: { id: true, name: true },
    }),
    db.query.committees.findMany({
      where: and(
        eq(committees.schoolId, schoolId),
        eq(committees.schoolYear, targetYear)
      ),
      columns: { name: true },
    }),
  ]);
  const takenCommitteeNames = new Set(targetCommittees.map((c) => c.name));
  const committeesToCopy = sourceCommittees.filter(
    (c) => !takenCommitteeNames.has(c.name)
  );

  return {
    fromYear,
    targetYear,
    currentJoinCode: school.joinCode,
    suggestedJoinCode: generateJoinCode(school.name, targetYear),
    carriedOver,
    mustRejoin,
    classroomsToCopy: classroomsToCopy
      .filter((c) => c.schoolYear === fromYear)
      .map((c) => ({ id: c.id, name: c.name, gradeLevel: c.gradeLevel })),
    committeesToCopy: committeesToCopy.map((c) => ({ id: c.id, name: c.name })),
  };
}

/**
 * Roll the school over to a new school year — atomically.
 *
 * Replaces the old three-button dance (change year → generate code → expire
 * memberships), where doing them in the wrong order, or stopping halfway,
 * locked every user out of the school.
 *
 * In one transaction:
 *   1. Carry leadership (admin / PTA board) forward into the new year, keeping
 *      role and board position. They are NEVER expired by a rollover — board
 *      turnover is an explicit roster edit, not a side effect of the calendar.
 *   2. Expire ordinary members for the outgoing year so they must re-enter the
 *      new join code.
 *   3. Rotate the join code.
 *   4. Advance `school.currentSchoolYear` and add the year to the picker.
 *   5. Copy the outgoing year's classrooms into the new year — configuration
 *      only, so each new-year room starts with an empty roster.
 *
 * Then verifies leadership survived, rolling back if not. Prior-year data
 * (including last year's classroom rows and everything hanging off them) stays
 * intact and viewable via the year picker.
 */
export async function rolloverSchoolYear(input: {
  targetYear: string;
  newJoinCode?: string;
  /** Extra membership IDs (ordinary members) to carry over without rejoining. */
  alsoCarryOver?: string[];
  /** Copy the outgoing year's classrooms into the new year. Defaults to true. */
  copyClassrooms?: boolean;
  /** Copy the outgoing year's committees into the new year as drafts. Defaults to true. */
  copyCommittees?: boolean;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const isAdmin = await isSchoolAdmin(user.id!, schoolId);
  if (!isAdmin) throw new Error("Unauthorized: School Admin access required");

  const result = await performRollover({
    schoolId,
    actorId: user.id!,
    targetYear: input.targetYear,
    newJoinCode: input.newJoinCode,
    alsoCarryOver: input.alsoCarryOver,
    copyClassrooms: input.copyClassrooms,
    copyCommittees: input.copyCommittees,
  });

  revalidatePath("/admin/school-year");
  revalidatePath("/admin/members");
  revalidatePath("/admin/board");
  revalidatePath("/admin/classrooms");
  revalidatePath("/admin/committees");
  revalidatePath("/classrooms");
  revalidatePath("/committees");
  revalidatePath("/dashboard");

  return result;
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

  assertValidSchoolYear(year);

  // Guard rail: changing the active year is only safe if that year already has
  // an approved admin / PTA board member. Advancing to an empty year is what
  // caused the 2026-2027 lockout — use rolloverSchoolYear for that instead,
  // which carries leadership forward atomically.
  const leadership = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, year),
      eq(schoolMemberships.status, "approved")
    ),
  });
  if (!leadership.some((m) => isLeadershipRole(m.role))) {
    throw new Error(
      `${year} has no admin or PTA board member yet, so switching to it would lock ` +
        `everyone out. Use "Start new school year" to roll over instead — it carries ` +
        `your board forward automatically.`
    );
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
