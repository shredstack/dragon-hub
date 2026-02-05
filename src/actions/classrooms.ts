"use server";

import {
  assertAuthenticated,
  assertClassroomMember,
  assertClassroomRole,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classrooms, classroomMembers, classroomMessages, classroomTasks, roomParents } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/types";

export async function sendClassroomMessage(classroomId: string, message: string) {
  const user = await assertAuthenticated();
  await assertClassroomMember(user.id!, classroomId);

  await db.insert(classroomMessages).values({
    classroomId,
    authorId: user.id!,
    message,
  });

  revalidatePath(`/classrooms/${classroomId}`);
}

export async function createTask(
  classroomId: string,
  data: { title: string; description?: string; dueDate?: string; assignedTo?: string }
) {
  const user = await assertAuthenticated();
  await assertClassroomRole(user.id!, classroomId, ["teacher", "room_parent"]);

  await db.insert(classroomTasks).values({
    classroomId,
    createdBy: user.id!,
    title: data.title,
    description: data.description || null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    assignedTo: data.assignedTo || null,
  });

  revalidatePath(`/classrooms/${classroomId}`);
}

export async function updateTaskStatus(taskId: string, completed: boolean) {
  await assertAuthenticated();

  await db
    .update(classroomTasks)
    .set({ completed })
    .where(eq(classroomTasks.id, taskId));

  revalidatePath("/classrooms");
}

export async function assignTask(taskId: string, userId: string) {
  await assertAuthenticated();

  await db
    .update(classroomTasks)
    .set({ assignedTo: userId })
    .where(eq(classroomTasks.id, taskId));

  revalidatePath("/classrooms");
}

// ─── Room Parent Actions ────────────────────────────────────────────────────

export async function addRoomParent(
  classroomId: string,
  data: { name: string; email?: string; phone?: string }
) {
  const user = await assertAuthenticated();
  await assertClassroomRole(user.id!, classroomId, ["teacher", "room_parent", "pta_board"]);

  await db.insert(roomParents).values({
    classroomId,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
  });

  revalidatePath(`/classrooms/${classroomId}`);
}

export async function updateRoomParent(
  roomParentId: string,
  data: { name?: string; email?: string; phone?: string }
) {
  const user = await assertAuthenticated();

  const roomParent = await db.query.roomParents.findFirst({
    where: eq(roomParents.id, roomParentId),
  });
  if (!roomParent) throw new Error("Room parent not found");

  await assertClassroomRole(user.id!, roomParent.classroomId, ["teacher", "room_parent", "pta_board"]);

  await db
    .update(roomParents)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.email !== undefined && { email: data.email || null }),
      ...(data.phone !== undefined && { phone: data.phone || null }),
    })
    .where(eq(roomParents.id, roomParentId));

  revalidatePath(`/classrooms/${roomParent.classroomId}`);
}

export async function removeRoomParent(roomParentId: string) {
  const user = await assertAuthenticated();

  const roomParent = await db.query.roomParents.findFirst({
    where: eq(roomParents.id, roomParentId),
  });
  if (!roomParent) throw new Error("Room parent not found");

  await assertClassroomRole(user.id!, roomParent.classroomId, ["teacher", "room_parent", "pta_board"]);

  await db.delete(roomParents).where(eq(roomParents.id, roomParentId));

  revalidatePath(`/classrooms/${roomParent.classroomId}`);
}

// ─── Admin Actions ──────────────────────────────────────────────────────────

export async function createClassroom(data: {
  name: string;
  gradeLevel?: string;
  teacherEmail?: string;
  schoolYear: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db.insert(classrooms).values({
    schoolId,
    name: data.name,
    gradeLevel: data.gradeLevel || null,
    teacherEmail: data.teacherEmail || null,
    schoolYear: data.schoolYear,
  });

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");
}

export async function updateClassroom(
  id: string,
  data: { name?: string; gradeLevel?: string; teacherEmail?: string; active?: boolean }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Only update if classroom belongs to current school
  await db
    .update(classrooms)
    .set(data)
    .where(and(eq(classrooms.id, id), eq(classrooms.schoolId, schoolId)));

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");
}

export async function addClassroomMember(data: {
  classroomId: string;
  userId: string;
  role: UserRole;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify classroom belongs to current school
  const classroom = await db.query.classrooms.findFirst({
    where: and(eq(classrooms.id, data.classroomId), eq(classrooms.schoolId, schoolId)),
  });
  if (!classroom) throw new Error("Classroom not found");

  await db.insert(classroomMembers).values({
    classroomId: data.classroomId,
    userId: data.userId,
    role: data.role,
  });

  revalidatePath("/admin/classrooms");
  revalidatePath(`/classrooms/${data.classroomId}`);
}

export async function removeClassroomMember(memberId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify the member's classroom belongs to current school
  const member = await db.query.classroomMembers.findFirst({
    where: eq(classroomMembers.id, memberId),
    with: { classroom: true },
  });
  if (!member || member.classroom?.schoolId !== schoolId) {
    throw new Error("Member not found");
  }

  await db.delete(classroomMembers).where(eq(classroomMembers.id, memberId));

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");
}

export async function updateMemberRole(memberId: string, role: UserRole) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify the member's classroom belongs to current school
  const member = await db.query.classroomMembers.findFirst({
    where: eq(classroomMembers.id, memberId),
    with: { classroom: true },
  });
  if (!member || member.classroom?.schoolId !== schoolId) {
    throw new Error("Member not found");
  }

  await db.update(classroomMembers).set({ role }).where(eq(classroomMembers.id, memberId));

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");
}
