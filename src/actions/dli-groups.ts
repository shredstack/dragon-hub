"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { dliGroups } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ─── DLI Group Queries ───────────────────────────────────────────────────────

export async function getDliGroups() {
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];

  return db.query.dliGroups.findMany({
    where: and(eq(dliGroups.schoolId, schoolId), eq(dliGroups.active, true)),
    orderBy: [asc(dliGroups.sortOrder), asc(dliGroups.name)],
  });
}

export async function getAllDliGroups() {
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];

  return db.query.dliGroups.findMany({
    where: eq(dliGroups.schoolId, schoolId),
    orderBy: [asc(dliGroups.sortOrder), asc(dliGroups.name)],
  });
}

// ─── DLI Group Mutations ─────────────────────────────────────────────────────

export async function createDliGroup(data: {
  name: string;
  language?: string;
  color?: string;
  sortOrder?: number;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db.insert(dliGroups).values({
    schoolId,
    name: data.name,
    language: data.language || null,
    color: data.color || null,
    sortOrder: data.sortOrder ?? 0,
  });

  revalidatePath("/admin/classrooms");
  revalidatePath("/admin/dli-groups");
}

export async function updateDliGroup(
  id: string,
  data: {
    name?: string;
    language?: string;
    color?: string;
    sortOrder?: number;
    active?: boolean;
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify the group belongs to current school
  const group = await db.query.dliGroups.findFirst({
    where: and(eq(dliGroups.id, id), eq(dliGroups.schoolId, schoolId)),
  });
  if (!group) throw new Error("DLI group not found");

  await db.update(dliGroups).set(data).where(eq(dliGroups.id, id));

  revalidatePath("/admin/classrooms");
  revalidatePath("/admin/dli-groups");
}

export async function deleteDliGroup(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify the group belongs to current school
  const group = await db.query.dliGroups.findFirst({
    where: and(eq(dliGroups.id, id), eq(dliGroups.schoolId, schoolId)),
  });
  if (!group) throw new Error("DLI group not found");

  // Soft delete - mark as inactive rather than hard delete
  await db.update(dliGroups).set({ active: false }).where(eq(dliGroups.id, id));

  revalidatePath("/admin/classrooms");
  revalidatePath("/admin/dli-groups");
}
