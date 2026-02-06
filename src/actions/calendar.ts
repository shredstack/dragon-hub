"use server";

import { db } from "@/lib/db";
import { calendarEvents, eventFlyers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";

export async function updateEventPtaDescription(
  eventId: string,
  description: string
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Verify event belongs to school
  const event = await db.query.calendarEvents.findFirst({
    where: and(
      eq(calendarEvents.id, eventId),
      eq(calendarEvents.schoolId, schoolId)
    ),
  });
  if (!event) throw new Error("Event not found");

  // Check authorization
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Update the event
  await db
    .update(calendarEvents)
    .set({
      ptaDescription: description || null,
      ptaDescriptionUpdatedBy: user.id!,
      ptaDescriptionUpdatedAt: new Date(),
    })
    .where(eq(calendarEvents.id, eventId));

  revalidatePath("/calendar");
  revalidatePath(`/calendar/${eventId}`);

  return { success: true };
}

export async function deleteEventFlyer(flyerId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Get flyer with event
  const flyer = await db.query.eventFlyers.findFirst({
    where: eq(eventFlyers.id, flyerId),
    with: {
      calendarEvent: true,
    },
  });
  if (!flyer) throw new Error("Flyer not found");

  // Verify event belongs to school
  if (flyer.calendarEvent.schoolId !== schoolId) {
    throw new Error("Unauthorized");
  }

  // Check authorization
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Delete from Vercel Blob
  if (flyer.blobUrl.includes("blob.vercel-storage.com")) {
    try {
      await del(flyer.blobUrl);
    } catch {
      // Ignore deletion errors
    }
  }

  // Delete from database
  await db.delete(eventFlyers).where(eq(eventFlyers.id, flyerId));

  revalidatePath("/calendar");
  revalidatePath(`/calendar/${flyer.calendarEventId}`);

  return { success: true };
}

export async function getCalendarEventWithFlyers(eventId: string) {
  const schoolId = await getCurrentSchoolId();

  const event = await db.query.calendarEvents.findFirst({
    where: schoolId
      ? and(
          eq(calendarEvents.id, eventId),
          eq(calendarEvents.schoolId, schoolId)
        )
      : eq(calendarEvents.id, eventId),
    with: {
      flyers: {
        orderBy: (flyers, { asc }) => [asc(flyers.sortOrder)],
      },
      ptaDescriptionUpdater: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
  });

  return event;
}
