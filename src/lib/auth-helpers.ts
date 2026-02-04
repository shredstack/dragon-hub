import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { classroomMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { UserRole } from "@/types";

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
  const member = await db.query.classroomMembers.findFirst({
    where: and(
      eq(classroomMembers.userId, userId),
      eq(classroomMembers.role, "pta_board")
    ),
  });
  if (!member) throw new Error("Unauthorized: PTA Board access required");
  return member;
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
