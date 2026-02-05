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
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import type { UserRole, EventPlanMemberRole, SchoolRole } from "@/types";

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

  // Fall back to looking up user's school membership
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, user.id),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
      eq(schoolMemberships.status, "approved")
    ),
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
  return db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
      eq(schoolMemberships.status, "approved")
    ),
  });
}

export async function getUserSchoolMembership(userId: string) {
  // Get the user's current school membership (first approved one for current year)
  return db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolYear, CURRENT_SCHOOL_YEAR),
      eq(schoolMemberships.status, "approved")
    ),
    with: {
      school: true,
    },
  });
}

export async function assertSchoolMember(userId: string, schoolId: string) {
  const membership = await getSchoolMembership(userId, schoolId);
  if (!membership) throw new Error("Unauthorized: Not a school member");
  return membership;
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

export async function isSchoolAdmin(
  userId: string,
  schoolId: string
): Promise<boolean> {
  // Super admins have admin access to all schools
  if (await isSuperAdmin(userId)) return true;

  const membership = await getSchoolMembership(userId, schoolId);
  return membership?.role === "admin";
}

export async function isSchoolPtaBoardOrAdmin(
  userId: string,
  schoolId: string
): Promise<boolean> {
  // Super admins have access to all schools
  if (await isSuperAdmin(userId)) return true;

  const membership = await getSchoolMembership(userId, schoolId);
  return membership?.role === "admin" || membership?.role === "pta_board";
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
): Promise<{ role: EventPlanMemberRole | "pta_board"; isBoardMember: boolean }> {
  // Verify the event plan belongs to the user's current school
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const plan = await db.query.eventPlans.findFirst({
    where: eq(eventPlans.id, eventPlanId),
  });
  if (!plan) throw new Error("Event plan not found");
  if (plan.schoolId !== schoolId) throw new Error("Unauthorized: Event plan belongs to different school");

  const boardMember = await isPtaBoard(userId);
  if (boardMember) return { role: "pta_board", isBoardMember: true };

  if (plan.createdBy === userId) return { role: "lead", isBoardMember: false };

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
  return { role: member.role as EventPlanMemberRole, isBoardMember: false };
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
