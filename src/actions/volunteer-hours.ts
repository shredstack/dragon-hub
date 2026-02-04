"use server";

import { assertAuthenticated, assertPtaBoard } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { volunteerHours } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function logVolunteerHours(data: {
  eventName: string;
  hours: string;
  date: string;
  category: string;
  notes?: string;
}) {
  const user = await assertAuthenticated();

  await db.insert(volunteerHours).values({
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
  await assertPtaBoard(user.id!);

  await db
    .update(volunteerHours)
    .set({ approved: true, approvedBy: user.id! })
    .where(eq(volunteerHours.id, hourId));

  revalidatePath("/admin/volunteer-hours");
  revalidatePath("/volunteer-hours");
}

export async function rejectHours(hourId: string) {
  const user = await assertAuthenticated();
  await assertPtaBoard(user.id!);

  await db.delete(volunteerHours).where(eq(volunteerHours.id, hourId));

  revalidatePath("/admin/volunteer-hours");
  revalidatePath("/volunteer-hours");
}
