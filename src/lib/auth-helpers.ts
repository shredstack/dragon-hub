import { cache } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  classroomMembers,
  eventPlans,
  eventPlanMembers,
  superAdmins,
  schoolMemberships,
  schools,
} from "@/lib/db/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import { getSchoolCurrentYear } from "@/lib/school-year";
import type { UserRole, EventPlanMemberRole, SchoolRole } from "@/types";

/** Roles that must never lose access during a school-year rollover. */
const LEADERSHIP_ROLES = ["admin", "pta_board"] as const;

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

export async function assertAuthenticated() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

// ─── Super Admin Helpers ────────────────────────────────────────────────────

export async function isSuperAdmin(userId: string): Promise<boolean> {
  const admin = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.userId, userId),
  });
  return !!admin;
}

export async function assertSuperAdmin(userId: string) {
  const isAdmin = await isSuperAdmin(userId);
  if (!isAdmin) throw new Error("Unauthorized: Super Admin access required");
}

// ─── School Context Helpers ─────────────────────────────────────────────────

const SCHOOL_COOKIE_NAME = "current_school_id";

export async function getCurrentSchoolId(): Promise<string | null> {
  // First try to get from cookie
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SCHOOL_COOKIE_NAME)?.value;
  if (cookieValue) return cookieValue;

  // Fall back to looking up user's school membership.
  // Deliberately NOT filtered by school year: the point of this lookup is to
  // find which school the user belongs to, and a user mid-rollover (whose only
  // approved row is last year's) still belongs to that school. Year-scoped
  // authorization happens later, in getSchoolMembership.
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, user.id),
      eq(schoolMemberships.status, "approved")
    ),
    orderBy: [desc(schoolMemberships.schoolYear), desc(schoolMemberships.createdAt)],
  });

  return membership?.schoolId ?? null;
}

// Note: setCurrentSchoolId can only be called from Server Actions or Route Handlers
export async function setCurrentSchoolId(schoolId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SCHOOL_COOKIE_NAME, schoolId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}

export async function clearCurrentSchoolId() {
  const cookieStore = await cookies();
  cookieStore.delete(SCHOOL_COOKIE_NAME);
}

// ─── School Membership Helpers ──────────────────────────────────────────────

export async function getSchoolMembership(userId: string, schoolId: string) {
  // Get the school's configured current year, falling back to global constant
  const currentYear = await getSchoolCurrentYear(schoolId);

  return db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, currentYear),
      eq(schoolMemberships.status, "approved")
    ),
  });
}

/**
 * Resolve a user's school-year access state in one shot.
 *
 * This is the function that decides whether someone gets into the app, so it
 * deliberately separates two questions that the old code conflated:
 *
 *   1. "Which school does this person belong to?"  — not year-scoped. Someone
 *      whose only approved row is last year's still belongs to the school.
 *   2. "Are they current for that school's active year?" — year-scoped, and
 *      resolved from `school.currentSchoolYear`, never a hardcoded constant.
 *
 * Leadership (school admin / PTA board) approved in ANY year retains access.
 * A rollover must never be able to lock the board out of their own school.
 */
export const getSchoolAccess = cache(async function getSchoolAccess(
  userId: string,
  preferredSchoolId?: string | null
) {
  const memberships = await db.query.schoolMemberships.findMany({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.status, "approved")
    ),
    with: { school: true },
    orderBy: [desc(schoolMemberships.schoolYear), desc(schoolMemberships.createdAt)],
  });

  if (memberships.length === 0) return null;

  // Prefer the school the user is actively viewing, else their newest membership.
  const anchor =
    (preferredSchoolId &&
      memberships.find((m) => m.schoolId === preferredSchoolId)) ||
    memberships[0];

  const school = anchor.school;
  if (!school) return null;

  const currentYear = school.currentSchoolYear ?? CURRENT_SCHOOL_YEAR;
  const forSchool = memberships.filter((m) => m.schoolId === school.id);

  const currentMembership =
    forSchool.find((m) => m.schoolYear === currentYear) ?? null;
  const isLeadership = forSchool.some((m) =>
    (LEADERSHIP_ROLES as readonly string[]).includes(m.role)
  );

  return {
    school,
    schoolId: school.id,
    currentYear,
    /** Approved membership for the school's active year, if any. */
    membership: currentMembership,
    /** Most recent approved membership in any year (always present). */
    latestMembership: forSchool[0],
    /** Admin or PTA board in any year — retains access across a rollover. */
    isLeadership,
    /** Has history at the school but no membership for the active year. */
    needsRenewal: !currentMembership,
  };
});

/**
 * The user's membership for their school's active year.
 * Returns the prior-year membership for leadership so the board is never
 * bounced out of their own school mid-rollover.
 */
export async function getUserSchoolMembership(userId: string) {
  const access = await getSchoolAccess(userId, await getCurrentSchoolId());
  if (!access) return undefined;
  if (access.membership) return access.membership;
  return access.isLeadership ? access.latestMembership : undefined;
}

export async function assertSchoolMember(userId: string, schoolId: string) {
  const membership = await getSchoolMembership(userId, schoolId);
  if (membership) return membership;

  // Leadership retains access across a rollover even before their row for the
  // new year exists — see findLeadershipMembership.
  const leadership = await findLeadershipMembership(userId, schoolId);
  if (leadership) return leadership;

  throw new Error("Unauthorized: Not a school member");
}

export async function assertSchoolRole(
  userId: string,
  schoolId: string,
  roles: SchoolRole[]
) {
  const membership = await assertSchoolMember(userId, schoolId);
  if (!roles.includes(membership.role as SchoolRole)) {
    throw new Error("Unauthorized: Insufficient school role");
  }
  return membership;
}

/**
 * Leadership lookup: an approved admin / PTA board membership in ANY school year.
 *
 * This is intentionally not year-scoped. It is the guarantee that a school-year
 * rollover can never lock a board out of its own school — the scenario that
 * requires a database-level rescue to undo. Board turnover is handled by
 * explicitly changing or revoking someone's membership, not by letting a year
 * change silently strip everyone's access.
 */
const findLeadershipMembership = cache(async function findLeadershipMembership(
  userId: string,
  schoolId: string
) {
  return db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.status, "approved"),
      or(
        eq(schoolMemberships.role, "admin"),
        eq(schoolMemberships.role, "pta_board")
      )
    ),
    orderBy: [desc(schoolMemberships.schoolYear)],
  });
});

export async function isSchoolAdmin(
  userId: string,
  schoolId: string
): Promise<boolean> {
  // Super admins have admin access to all schools
  if (await isSuperAdmin(userId)) return true;
  return !!(await findLeadershipMembership(userId, schoolId));
}

export async function isSchoolPtaBoardOrAdmin(
  userId: string,
  schoolId: string
): Promise<boolean> {
  // Super admins have access to all schools
  if (await isSuperAdmin(userId)) return true;
  return !!(await findLeadershipMembership(userId, schoolId));
}

/**
 * True School Admin role only — unlike `isSchoolAdmin`, which also passes every
 * PTA board member. Reserved for the handful of actions whose blast radius
 * reaches past this school (permanently deleting an account, for instance),
 * where "the whole board can do it" is too wide a door.
 */
export async function isSchoolAdminRole(
  userId: string,
  schoolId: string
): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  const membership = await findLeadershipMembership(userId, schoolId);
  return membership?.role === "admin";
}

export async function assertSchoolAdminRole(userId: string, schoolId: string) {
  if (!(await isSchoolAdminRole(userId, schoolId))) {
    throw new Error("Unauthorized: School Admin access required");
  }
}

export async function assertSchoolPtaBoardOrAdmin(
  userId: string,
  schoolId: string
) {
  const hasAccess = await isSchoolPtaBoardOrAdmin(userId, schoolId);
  if (!hasAccess) {
    throw new Error("Unauthorized: PTA Board or Admin access required");
  }
}

export async function getSchoolByJoinCode(joinCode: string) {
  return db.query.schools.findFirst({
    where: and(eq(schools.joinCode, joinCode), eq(schools.active, true)),
  });
}

// ─── Classroom Helpers ──────────────────────────────────────────────────────

export async function assertClassroomMember(userId: string, classroomId: string) {
  const member = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.userId, userId),
      eq(classroomMembers.classroomId, classroomId)
    ),
  });
  if (!member) throw new Error("Unauthorized: Not a classroom member");
  return member;
}

export async function assertClassroomRole(userId: string, classroomId: string, roles: UserRole[]) {
  const member = await assertClassroomMember(userId, classroomId);
  if (!roles.includes(member.role as UserRole)) {
    throw new Error("Unauthorized: Insufficient role");
  }
  return member;
}

export async function assertPtaBoard(userId: string) {
  // Use school-based role check with current school context
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(userId, schoolId);
}

export async function assertCanViewVolunteerHours(sessionUserId: string, targetUserId: string) {
  if (sessionUserId === targetUserId) return;
  await assertPtaBoard(sessionUserId);
}

export async function getUserRoles(userId: string): Promise<UserRole[]> {
  const memberships = await db.query.classroomMembers.findMany({
    where: eq(classroomMembers.userId, userId),
  });
  return [...new Set(memberships.map((m) => m.role as UserRole))];
}

export async function isPtaBoard(userId: string): Promise<boolean> {
  try {
    await assertPtaBoard(userId);
    return true;
  } catch {
    return false;
  }
}

export async function assertEventPlanAccess(
  userId: string,
  eventPlanId: string,
  requiredRoles?: EventPlanMemberRole[]
): Promise<{
  role: EventPlanMemberRole | "pta_board";
  isBoardMember: boolean;
  status: string;
}> {
  // Verify the event plan belongs to the user's current school
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, eventPlanId),
  });
  if (!plan) throw new Error("Event plan not found");
  if (plan.schoolId !== schoolId) throw new Error("Unauthorized: Event plan belongs to different school");

  const boardMember = await isPtaBoard(userId);
  if (boardMember)
    return { role: "pta_board", isBoardMember: true, status: plan.status };

  if (plan.createdBy === userId)
    return { role: "lead", isBoardMember: false, status: plan.status };

  const member = await db.query.eventPlanMembers.findFirst({
    where: and(
      eq(eventPlanMembers.eventPlanId, eventPlanId),
      eq(eventPlanMembers.userId, userId)
    ),
  });
  if (!member) throw new Error("Unauthorized: Not an event plan member");
  if (requiredRoles && !requiredRoles.includes(member.role as EventPlanMemberRole)) {
    throw new Error("Unauthorized: Insufficient role");
  }
  return {
    role: member.role as EventPlanMemberRole,
    isBoardMember: false,
    status: plan.status,
  };
}

/** Shown wherever a completed plan refuses a change, so the way out is obvious. */
export const COMPLETED_EVENT_PLAN_LOCKED =
  "This event is completed. Only its leads can make further changes — ask a PTA board member to reopen it.";

/**
 * Access for anything that *changes* an event plan or its tasks, meetings,
 * messages, resources, or documents.
 *
 * Until the event is completed this is exactly `assertEventPlanAccess`. Once it
 * is, the plan stops being a working document and becomes the record next
 * year's planners inherit, so only the people who actually ran it — its leads —
 * may keep changing it. Board members lose write access here too; theirs is
 * `reopenEventPlan`, which puts the plan back into a working state first. That
 * leaves an escape hatch for the case that would otherwise freeze a plan
 * forever: the lead has left the school.
 *
 * Reads (viewing the plan, its wrap-up, its documents) stay on
 * `assertEventPlanAccess` and are unaffected.
 */
export async function assertEventPlanWriteAccess(
  userId: string,
  eventPlanId: string,
  requiredRoles?: EventPlanMemberRole[]
): Promise<{
  role: EventPlanMemberRole | "pta_board";
  isBoardMember: boolean;
  status: string;
}> {
  const access = await assertEventPlanAccess(userId, eventPlanId, requiredRoles);
  if (access.status !== "completed") return access;

  // An explicit lead membership row, not the creator shortcut: every plan adds
  // its creator as a lead, so a creator without that row was deliberately
  // demoted and shouldn't outrank the decision.
  const lead = await db.query.eventPlanMembers.findFirst({
    where: and(
      eq(eventPlanMembers.eventPlanId, eventPlanId),
      eq(eventPlanMembers.userId, userId),
      eq(eventPlanMembers.role, "lead")
    ),
    columns: { id: true },
  });
  if (!lead) throw new Error(COMPLETED_EVENT_PLAN_LOCKED);

  return { role: "lead", isBoardMember: access.isBoardMember, status: access.status };
}

/**
 * Whether this user may still change a completed plan — the client-side mirror
 * of `assertEventPlanWriteAccess`, used to hide controls that would only fail.
 */
export async function isEventPlanLead(
  userId: string,
  eventPlanId: string
): Promise<boolean> {
  const lead = await db.query.eventPlanMembers.findFirst({
    where: and(
      eq(eventPlanMembers.eventPlanId, eventPlanId),
      eq(eventPlanMembers.userId, userId),
      eq(eventPlanMembers.role, "lead")
    ),
    columns: { id: true },
  });
  return !!lead;
}

export async function isEventPlanMember(
  userId: string,
  eventPlanId: string
): Promise<boolean> {
  try {
    await assertEventPlanAccess(userId, eventPlanId);
    return true;
  } catch {
    return false;
  }
}
