"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  schoolCalendarIntegrations,
  schoolDriveIntegrations,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ─── Calendar Integration Actions ────────────────────────────────────────────

export async function getCalendarIntegrations() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  return db.query.schoolCalendarIntegrations.findMany({
    where: eq(schoolCalendarIntegrations.schoolId, schoolId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function addCalendarIntegration(data: {
  calendarId: string;
  name?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db.insert(schoolCalendarIntegrations).values({
    schoolId,
    calendarId: data.calendarId.trim(),
    name: data.name?.trim() || null,
    createdBy: user.id!,
  });

  revalidatePath("/admin/integrations");
}

export async function updateCalendarIntegration(
  id: string,
  data: { name?: string; active?: boolean }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .update(schoolCalendarIntegrations)
    .set(data)
    .where(
      and(
        eq(schoolCalendarIntegrations.id, id),
        eq(schoolCalendarIntegrations.schoolId, schoolId)
      )
    );

  revalidatePath("/admin/integrations");
}

export async function deleteCalendarIntegration(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(schoolCalendarIntegrations)
    .where(
      and(
        eq(schoolCalendarIntegrations.id, id),
        eq(schoolCalendarIntegrations.schoolId, schoolId)
      )
    );

  revalidatePath("/admin/integrations");
}

// ─── Drive Integration Actions ───────────────────────────────────────────────

export async function getDriveIntegrations() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  return db.query.schoolDriveIntegrations.findMany({
    where: eq(schoolDriveIntegrations.schoolId, schoolId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
}

export async function addDriveIntegration(data: {
  folderId: string;
  name?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db.insert(schoolDriveIntegrations).values({
    schoolId,
    folderId: data.folderId.trim(),
    name: data.name?.trim() || null,
    createdBy: user.id!,
  });

  revalidatePath("/admin/integrations");
}

export async function updateDriveIntegration(
  id: string,
  data: { name?: string; active?: boolean }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .update(schoolDriveIntegrations)
    .set(data)
    .where(
      and(
        eq(schoolDriveIntegrations.id, id),
        eq(schoolDriveIntegrations.schoolId, schoolId)
      )
    );

  revalidatePath("/admin/integrations");
}

export async function deleteDriveIntegration(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(schoolDriveIntegrations)
    .where(
      and(
        eq(schoolDriveIntegrations.id, id),
        eq(schoolDriveIntegrations.schoolId, schoolId)
      )
    );

  revalidatePath("/admin/integrations");
}
