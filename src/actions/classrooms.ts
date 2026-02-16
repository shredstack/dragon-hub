"use server";

import {
  assertAuthenticated,
  assertClassroomMember,
  assertClassroomRole,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { classrooms, classroomMembers, classroomMessages, classroomTasks, roomParents, dliGroups, volunteerSignups } from "@/lib/db/schema";
import { eq, and, ne, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { UserRole } from "@/types";

export async function sendClassroomMessage(
  classroomId: string,
  message: string,
  accessLevel: "public" | "room_parents_only" = "public"
) {
  const user = await assertAuthenticated();
  await assertClassroomMember(user.id!, classroomId);

  // If posting to room_parents_only, verify user has access
  if (accessLevel === "room_parents_only") {
    const { isUserRoomParentForClassroom, isUserTeacherForClassroom } = await import(
      "@/actions/volunteer-signups"
    );
    const isRoomParent = await isUserRoomParentForClassroom(user.id!, classroomId);
    const isTeacher = await isUserTeacherForClassroom(user.id!, classroomId);
    if (!isRoomParent && !isTeacher) {
      throw new Error("Only room parents and teachers can post to the private board");
    }
  }

  await db.insert(classroomMessages).values({
    classroomId,
    authorId: user.id!,
    message,
    accessLevel,
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
  isDli?: boolean;
  dliGroupId?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Validate DLI group if specified
  if (data.dliGroupId) {
    const group = await db.query.dliGroups.findFirst({
      where: and(eq(dliGroups.id, data.dliGroupId), eq(dliGroups.schoolId, schoolId)),
    });
    if (!group) throw new Error("Invalid DLI group");
  }

  await db.insert(classrooms).values({
    schoolId,
    name: data.name,
    gradeLevel: data.gradeLevel || null,
    teacherEmail: data.teacherEmail || null,
    schoolYear: data.schoolYear,
    isDli: data.isDli ?? false,
    dliGroupId: data.isDli ? data.dliGroupId || null : null,
  });

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");
}

export async function updateClassroom(
  id: string,
  data: {
    name?: string;
    gradeLevel?: string;
    teacherEmail?: string;
    active?: boolean;
    isDli?: boolean;
    dliGroupId?: string | null;
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Validate DLI group if specified
  if (data.dliGroupId) {
    const group = await db.query.dliGroups.findFirst({
      where: and(eq(dliGroups.id, data.dliGroupId), eq(dliGroups.schoolId, schoolId)),
    });
    if (!group) throw new Error("Invalid DLI group");
  }

  // If isDli is being set to false, clear dliGroupId
  const updateData = { ...data };
  if (data.isDli === false) {
    updateData.dliGroupId = null;
  }

  // Only update if classroom belongs to current school
  await db
    .update(classrooms)
    .set(updateData)
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

export async function deleteClassroom(classroomId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify classroom belongs to current school
  const classroom = await db.query.classrooms.findFirst({
    where: and(eq(classrooms.id, classroomId), eq(classrooms.schoolId, schoolId)),
  });
  if (!classroom) throw new Error("Classroom not found");

  // Delete related data first (cascade manually)
  await db.delete(classroomMessages).where(eq(classroomMessages.classroomId, classroomId));
  await db.delete(classroomTasks).where(eq(classroomTasks.classroomId, classroomId));
  await db.delete(roomParents).where(eq(roomParents.classroomId, classroomId));
  await db.delete(classroomMembers).where(eq(classroomMembers.classroomId, classroomId));

  // Delete the classroom
  await db.delete(classrooms).where(eq(classrooms.id, classroomId));

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");
  return { success: true };
}

// ─── Rollover Actions ───────────────────────────────────────────────────────

/**
 * Rollover classrooms to a new school year.
 * - Updates the schoolYear on each classroom
 * - Removes all members except teachers
 * - Clears volunteer signups and room parents
 * - Preserves messages and tasks as history
 */
export async function rolloverClassroomsToNewYear(
  classroomIds: string[],
  newSchoolYear: string
): Promise<{ rolledOver: number; errors: string[] }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  if (classroomIds.length === 0) {
    return { rolledOver: 0, errors: [] };
  }

  // Validate school year format
  if (!/^\d{4}-\d{4}$/.test(newSchoolYear)) {
    throw new Error("Invalid school year format. Expected format: YYYY-YYYY");
  }

  // Verify all classrooms belong to current school
  const classroomsToRollover = await db.query.classrooms.findMany({
    where: and(
      eq(classrooms.schoolId, schoolId),
      inArray(classrooms.id, classroomIds)
    ),
  });

  if (classroomsToRollover.length !== classroomIds.length) {
    throw new Error("Some classrooms were not found or don't belong to this school");
  }

  const errors: string[] = [];
  let rolledOver = 0;

  for (const classroom of classroomsToRollover) {
    try {
      // Update school year
      await db
        .update(classrooms)
        .set({ schoolYear: newSchoolYear })
        .where(eq(classrooms.id, classroom.id));

      // Remove all members except teachers
      await db
        .delete(classroomMembers)
        .where(
          and(
            eq(classroomMembers.classroomId, classroom.id),
            ne(classroomMembers.role, "teacher")
          )
        );

      // Clear volunteer signups
      await db
        .delete(volunteerSignups)
        .where(eq(volunteerSignups.classroomId, classroom.id));

      // Clear room parents (legacy table)
      await db
        .delete(roomParents)
        .where(eq(roomParents.classroomId, classroom.id));

      rolledOver++;
    } catch (error) {
      errors.push(`Failed to rollover ${classroom.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");

  return { rolledOver, errors };
}
