"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { volunteerHours } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function logVolunteerHours(data: {
  eventName: string;
  hours: string;
  date: string;
  category: string;
  notes?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  await db.insert(volunteerHours).values({
    schoolId,
    userId: user.id!,
    eventName: data.eventName,
    hours: data.hours,
    date: data.date,
    category: data.category,
    notes: data.notes || null,
    approved: false,
  });

  revalidatePath("/volunteer-hours");
}

export async function approveHours(hourId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Only approve hours for current school
  await db
    .update(volunteerHours)
    .set({ approved: true, approvedBy: user.id! })
    .where(and(eq(volunteerHours.id, hourId), eq(volunteerHours.schoolId, schoolId)));

  revalidatePath("/admin/volunteer-hours");
  revalidatePath("/volunteer-hours");
}

export async function rejectHours(hourId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Only delete hours for current school
  await db
    .delete(volunteerHours)
    .where(and(eq(volunteerHours.id, hourId), eq(volunteerHours.schoolId, schoolId)));

  revalidatePath("/admin/volunteer-hours");
  revalidatePath("/volunteer-hours");
}
