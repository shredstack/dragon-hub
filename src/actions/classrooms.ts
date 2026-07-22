"use server";

import {
  assertAuthenticated,
  assertClassroomMember,
  assertClassroomRole,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db, dbPool } from "@/lib/db";
import { classrooms, classroomMembers, classroomMessages, classroomTasks, dliGroups, volunteerSignups } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  deactivateVolunteerSignup,
  linkExistingAccountToSchool,
  normalizeContact,
  recordVolunteerSignup,
  sendWelcomeEmail,
} from "@/lib/volunteer-onboarding";
import { isValidEmail, isValidPhoneNumber, normalizePhoneNumber } from "@/lib/utils";
import {
  copyClassroomsToYear,
  findClassroomsToPromote,
  type CopyClassroomsResult,
} from "@/lib/classroom-rollover";
import { getSchoolCurrentYear } from "@/lib/school-year";
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
//
// These write to `volunteer_signups`, the same table the QR signup and the VP
// dashboard use, so a room parent added from the classroom page shows up in the
// dashboard, the CSV export, and account linking like any other. They differ
// from the `volunteer-signups.ts` actions only in authorization: those are
// school-wide and PTA-board-only, these are scoped to one classroom's team.

const CLASSROOM_MANAGER_ROLES = ["teacher", "room_parent", "pta_board"] as const;

export interface RoomParentActionResult {
  success: boolean;
  error?: string;
}

export async function addRoomParent(
  classroomId: string,
  data: { name: string; email: string; phone?: string }
): Promise<RoomParentActionResult> {
  const user = await assertAuthenticated();
  await assertClassroomRole(user.id!, classroomId, [...CLASSROOM_MANAGER_ROLES]);

  const classroom = await db.query.classrooms.findFirst({
    where: eq(classrooms.id, classroomId),
    with: { school: { columns: { name: true } } },
  });
  // `schoolId` is still nullable in the schema; a signup can't be school-scoped
  // without it, and every live classroom has one.
  if (!classroom?.schoolId || !classroom.school) {
    throw new Error("Classroom not found");
  }
  const schoolId = classroom.schoolId;

  const validation = normalizeContact(data);
  if (!validation.ok) {
    return { success: false, error: validation.error };
  }
  const contact = validation.contact;

  const schoolYear = await getSchoolCurrentYear(schoolId);
  const existingUser = await linkExistingAccountToSchool(
    contact.email,
    schoolId,
    schoolYear
  );

  const { outcome } = await recordVolunteerSignup({
    schoolId,
    classroomId,
    contact,
    role: "room_parent",
    signupSource: "manual",
    createdBy: user.id!,
    userId: existingUser?.id ?? null,
  });

  if (outcome === "already_active") {
    return { success: false, error: "That person is already a room parent here." };
  }

  // Same welcome email the QR and dashboard paths send — it carries the
  // one-click sign-in link that gets them into the hub.
  try {
    await sendWelcomeEmail({
      email: contact.email,
      name: contact.name,
      schoolName: classroom.school.name,
      signups: [{ classroomName: classroom.name, role: "Room Parent" }],
    });
  } catch (error) {
    console.error("Failed to send welcome email:", error);
    // Don't fail the add if email fails
  }

  revalidatePath(`/classrooms/${classroomId}`);
  revalidatePath("/admin/room-parents");
  return { success: true };
}

export async function updateRoomParent(
  signupId: string,
  data: { name?: string; email?: string; phone?: string }
): Promise<RoomParentActionResult> {
  const user = await assertAuthenticated();

  const signup = await db.query.volunteerSignups.findFirst({
    where: eq(volunteerSignups.id, signupId),
  });
  if (!signup) throw new Error("Room parent not found");

  await assertClassroomRole(user.id!, signup.classroomId, [...CLASSROOM_MANAGER_ROLES]);

  if (data.email !== undefined && !isValidEmail(data.email)) {
    return { success: false, error: "Enter a valid email address." };
  }
  if (data.phone !== undefined && data.phone.trim() && !isValidPhoneNumber(data.phone)) {
    return { success: false, error: "Enter a 10-digit phone number." };
  }

  await db
    .update(volunteerSignups)
    .set({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.email !== undefined && { email: data.email.trim().toLowerCase() }),
      ...(data.phone !== undefined && { phone: normalizePhoneNumber(data.phone) }),
    })
    .where(eq(volunteerSignups.id, signupId));

  revalidatePath(`/classrooms/${signup.classroomId}`);
  revalidatePath("/admin/room-parents");
  return { success: true };
}

export async function removeRoomParent(signupId: string) {
  const user = await assertAuthenticated();

  const signup = await db.query.volunteerSignups.findFirst({
    where: eq(volunteerSignups.id, signupId),
  });
  if (!signup) throw new Error("Room parent not found");

  await assertClassroomRole(user.id!, signup.classroomId, [...CLASSROOM_MANAGER_ROLES]);

  await deactivateVolunteerSignup(signup, user.id!);

  revalidatePath(`/classrooms/${signup.classroomId}`);
  revalidatePath("/admin/room-parents");
}

// ─── Admin Actions ──────────────────────────────────────────────────────────

export async function createClassroom(data: {
  name: string;
  gradeLevel?: string;
  teacherEmail?: string;
  schoolYear: string;
  excludeFromSignup?: boolean;
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
    excludeFromSignup: data.excludeFromSignup ?? false,
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
    excludeFromSignup?: boolean;
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

async function assertOwnClassroom(classroomId: string, schoolId: string) {
  const classroom = await db.query.classrooms.findFirst({
    where: and(eq(classrooms.id, classroomId), eq(classrooms.schoolId, schoolId)),
  });
  if (!classroom) throw new Error("Classroom not found");
  return classroom;
}

/**
 * Archive a classroom: it disappears from sign-up, coverage and My Classrooms,
 * but its roster, room parents, messages, tasks and signups are all preserved.
 *
 * This is the default because a classroom is a historical record — last year's
 * room parents and party sign-ups are the institutional knowledge this app
 * exists to keep. `deleteClassroomPermanently` handles the typo case.
 */
export async function archiveClassroom(classroomId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
  await assertOwnClassroom(classroomId, schoolId);

  await db
    .update(classrooms)
    .set({ active: false })
    .where(and(eq(classrooms.id, classroomId), eq(classrooms.schoolId, schoolId)));

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");
  return { success: true };
}

export async function restoreClassroom(classroomId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
  await assertOwnClassroom(classroomId, schoolId);

  await db
    .update(classrooms)
    .set({ active: true })
    .where(and(eq(classrooms.id, classroomId), eq(classrooms.schoolId, schoolId)));

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");
  return { success: true };
}

/**
 * Count everything that would be destroyed along with a classroom. Note that
 * volunteer signups cascade at the database level, so they die with the row
 * whether or not anything deletes them explicitly — which is exactly why a
 * classroom with history can't be hard-deleted.
 */
export async function getClassroomHistoryCounts(classroomId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
  await assertOwnClassroom(classroomId, schoolId);

  const [members, messages, tasks, signups, descendants] = await Promise.all([
    db.$count(classroomMembers, eq(classroomMembers.classroomId, classroomId)),
    db.$count(classroomMessages, eq(classroomMessages.classroomId, classroomId)),
    db.$count(classroomTasks, eq(classroomTasks.classroomId, classroomId)),
    db.$count(volunteerSignups, eq(volunteerSignups.classroomId, classroomId)),
    db.$count(classrooms, eq(classrooms.rolledFromId, classroomId)),
  ]);

  const total = members + messages + tasks + signups + descendants;
  return { members, messages, tasks, signups, descendants, total, isEmpty: total === 0 };
}

/**
 * Permanently delete a classroom — only allowed when nothing is attached to it.
 * For anything with history, archive instead.
 */
export async function deleteClassroomPermanently(classroomId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
  const classroom = await assertOwnClassroom(classroomId, schoolId);

  const counts = await getClassroomHistoryCounts(classroomId);
  if (!counts.isEmpty) {
    const parts = [
      counts.members && `${counts.members} member(s)`,
      counts.messages && `${counts.messages} message(s)`,
      counts.tasks && `${counts.tasks} task(s)`,
      counts.signups && `${counts.signups} volunteer signup(s)`,
      counts.descendants && `${counts.descendants} later-year copy/copies`,
    ].filter(Boolean);
    throw new Error(
      `"${classroom.name}" has history attached (${parts.join(", ")}). ` +
        `Archive it instead — that hides it everywhere without destroying the record.`
    );
  }

  await db
    .delete(classrooms)
    .where(and(eq(classrooms.id, classroomId), eq(classrooms.schoolId, schoolId)));

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");
  return { success: true };
}

// ─── Rollover Actions ───────────────────────────────────────────────────────

/**
 * Copy classrooms forward into a school year.
 *
 * Replaces the old `rolloverClassroomsToNewYear`, which moved the same row into
 * the new year and deleted its roster and signups on the way — so last year's
 * room parents vanished and the messages left behind silently re-dated
 * themselves to the new year. See src/lib/classroom-rollover.ts for the model.
 */
export async function promoteClassroomsToYear(
  classroomIds: string[],
  targetYear: string
): Promise<CopyClassroomsResult> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  if (classroomIds.length === 0) return { copied: 0, skipped: [] };

  const result = await dbPool.transaction((tx) =>
    copyClassroomsToYear(tx as unknown as typeof db, {
      schoolId,
      targetYear,
      classroomIds,
    })
  );

  revalidatePath("/admin/classrooms");
  revalidatePath("/classrooms");
  revalidatePath("/admin/room-parents");

  return result;
}

/**
 * Rooms from earlier years that have no row yet in `targetYear` — what the
 * "promote" panel offers. Defaults to the school's active year, which is the
 * case that matters after a year rollover has already happened.
 */
export async function getClassroomsToPromote(targetYear?: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const year = targetYear ?? (await getSchoolCurrentYear(schoolId));
  const candidates = await findClassroomsToPromote(db, schoolId, year);

  return {
    targetYear: year,
    classrooms: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      gradeLevel: c.gradeLevel,
      teacherEmail: c.teacherEmail,
      schoolYear: c.schoolYear,
    })),
  };
}
