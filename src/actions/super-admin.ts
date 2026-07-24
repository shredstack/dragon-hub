"use server";

import { seedStandardBoardPositions } from "@/lib/board-positions";
import { seedStandardSchoolAdminPositions } from "@/lib/school-admin-positions";
import { generateUniqueCode, syncPtaJoinCode } from "@/lib/join-codes";
import { assertAuthenticated, assertSuperAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { schools, schoolMemberships, users } from "@/lib/db/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import { getDefaultSchoolYears, getSchoolCurrentYear } from "@/lib/school-year";
import type { SchoolRole, SchoolMembershipStatus } from "@/types";

/**
 * Join codes used to be derived from the school's name — "Draper Elementary"
 * became `DRAPER2026`. Because codes are globally unique and redemption
 * resolves the *school* from the code, that meant anyone who could read a sign
 * outside a school could join it. They are now drawn from the CSPRNG; see
 * `generateUniqueCode` in `@/lib/join-codes`.
 */

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
        // Correlate to each school's OWN active year rather than a global
        // constant, so a rolled-over school still reports real member counts.
        eq(schoolMemberships.schoolYear, schools.currentSchoolYear)
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
        eq(schoolMemberships.schoolYear, school.currentSchoolYear ?? CURRENT_SCHOOL_YEAR)
      )
    );

  return {
    ...school,
    currentSchoolYear: school.currentSchoolYear ?? CURRENT_SCHOOL_YEAR,
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
    // Deliberately NOT filtered by year: when a school is mid-rollover or
    // locked out, the super admin needs to see every row to repair it.
    .where(eq(schoolMemberships.schoolId, schoolId))
    .orderBy(desc(schoolMemberships.schoolYear), desc(schoolMemberships.createdAt));
}

export async function createSchool(data: {
  name: string;
  mascot?: string;
  address?: string;
  state?: string;
  district?: string;
}) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const joinCode = await generateUniqueCode();

  // current_school_year is NOT NULL — set it (and the picker options) explicitly
  // rather than leaning on the column default, so a new school starts with a
  // year that agrees with every year-scoped query from its first render.
  const yearDefaults = getDefaultSchoolYears();

  const [school] = await db
    .insert(schools)
    .values({
      name: data.name,
      joinCode,
      mascot: data.mascot,
      address: data.address,
      state: data.state,
      district: data.district,
      currentSchoolYear: yearDefaults.current,
      availableSchoolYears: yearDefaults.available,
      createdBy: user.id,
    })
    .returning();

  // A school with no board positions has an empty picker everywhere positions
  // are assigned, so give it the standard slate up front. It can rename, retire
  // or add to it from /admin/board/positions.
  await seedStandardBoardPositions(school.id);
  await seedStandardSchoolAdminPositions(school.id);

  // Redemption reads school_join_codes; the column above is the PTA code's
  // display home, so the row has to exist or the code admits nobody.
  await syncPtaJoinCode(school.id, joinCode);

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

  const newCode = await generateUniqueCode();

  const [updated] = await db
    .update(schools)
    .set({ joinCode: newCode })
    .where(eq(schools.id, schoolId))
    .returning();

  // Redemption reads school_join_codes, not this column. This rotation path
  // used to skip the mirror, so a super admin rotating a code left the old one
  // still redeemable — the exact drift syncPtaJoinCode exists to prevent.
  await syncPtaJoinCode(schoolId, newCode);

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

  const schoolYear = await getSchoolCurrentYear(schoolId);

  // Check if they already have a membership for this school/year
  const existingMembership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.userId, targetUser.id),
      eq(schoolMemberships.schoolYear, schoolYear)
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
      schoolYear,
      status: "approved",
      source: "super_admin",
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

/**
 * Takes someone off a school's roster. Matches what the menu item says and what
 * the school-level `removeMember` does: `removed`, not `revoked`, so they can
 * rejoin with the code. Use `setMemberStatus` to set `revoked` when re-entry
 * should require an administrator.
 */
export async function removeMember(membershipId: string) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  await db
    .update(schoolMemberships)
    .set({ status: "removed", boardPosition: null })
    .where(eq(schoolMemberships.id, membershipId));

  revalidatePath("/super-admin/schools");
  return { success: true };
}

/**
 * Break glass: set a membership's status directly.
 *
 * Exists because a botched school-year rollover could previously leave every
 * membership `expired`, which hid the per-member actions and left no in-app way
 * to restore anyone — recovery required direct database access.
 */
export async function setMemberStatus(
  membershipId: string,
  status: SchoolMembershipStatus
) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const [updated] = await db
    .update(schoolMemberships)
    .set({
      status,
      ...(status === "approved" ? { approvedAt: new Date() } : {}),
    })
    .where(eq(schoolMemberships.id, membershipId))
    .returning();

  if (!updated) throw new Error("Membership not found");

  revalidatePath("/super-admin/schools");
  revalidatePath(`/super-admin/schools/${updated.schoolId}`);
  return updated;
}

/**
 * Break glass: give a school a working set of leadership for its active year.
 *
 * Mirrors `scripts/repair-school-access.ts`:
 *   - restores expired/revoked admin & PTA board rows to approved
 *   - carries leadership forward into the school's active year
 *
 * Safe to run on a healthy school (no-op) and never touches year-scoped content.
 */
export async function repairSchoolAccess(schoolId: string) {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  if (!school) throw new Error("School not found");

  const currentYear = school.currentSchoolYear ?? CURRENT_SCHOOL_YEAR;
  const isLeadership = (role: string) => role === "admin" || role === "pta_board";

  const all = await db.query.schoolMemberships.findMany({
    where: eq(schoolMemberships.schoolId, schoolId),
  });

  const leadershipRows = all.filter((m) => isLeadership(m.role));
  if (leadershipRows.length === 0) {
    throw new Error(
      "This school has never had an admin or PTA board member. Use \"Assign School Admin\" above to grant access."
    );
  }

  const alreadyHealthy = all.some(
    (m) =>
      m.schoolYear === currentYear &&
      m.status === "approved" &&
      isLeadership(m.role)
  );
  if (alreadyHealthy) {
    return { restored: 0, carried: 0, currentYear, alreadyHealthy: true };
  }

  // Recover from the most recent year that has leadership.
  const sourceYear = leadershipRows
    .map((m) => m.schoolYear)
    .sort((a, b) => parseInt(b.slice(0, 4), 10) - parseInt(a.slice(0, 4), 10))[0];
  const source = leadershipRows.filter((m) => m.schoolYear === sourceYear);

  let restored = 0;
  let carried = 0;

  for (const m of source.filter((m) => m.status !== "approved")) {
    await db
      .update(schoolMemberships)
      .set({ status: "approved", approvedAt: m.approvedAt ?? new Date() })
      .where(eq(schoolMemberships.id, m.id));
    restored++;
  }

  if (sourceYear !== currentYear) {
    const inCurrent = new Map(
      all.filter((m) => m.schoolYear === currentYear).map((m) => [m.userId, m])
    );
    for (const m of source) {
      const existing = inCurrent.get(m.userId);
      if (existing) {
        await db
          .update(schoolMemberships)
          .set({
            role: m.role,
            status: "approved",
            boardPosition: m.boardPosition,
            approvedAt: existing.approvedAt ?? new Date(),
          })
          .where(eq(schoolMemberships.id, existing.id));
      } else {
        await db.insert(schoolMemberships).values({
          schoolId,
          userId: m.userId,
          role: m.role,
          boardPosition: m.boardPosition,
          adminPosition: m.adminPosition,
          source: m.source,
          joinCodeId: m.joinCodeId,
          schoolYear: currentYear,
          status: "approved",
          invitedBy: user.id!,
          approvedAt: new Date(),
          renewedFrom: m.id,
        });
      }
      carried++;
    }
  }

  revalidatePath(`/super-admin/schools/${schoolId}`);
  return { restored, carried, currentYear, alreadyHealthy: false };
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
        eq(schoolMemberships.schoolYear, schools.currentSchoolYear)
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
