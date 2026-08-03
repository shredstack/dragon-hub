"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  classroomMembers,
  classrooms,
  eventCatalog,
  volunteerHours,
  volunteerSignups,
} from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getMyCommitteeOptions } from "@/actions/committees";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  COMMITTEE_CATEGORY,
  EMPTY_ACTIVITY_OPTIONS,
  ROOM_PARENT_CATEGORY,
  roomParentActivityLabel,
  suggestedCategoryForEventCategory,
  type VolunteerActivityOptions,
} from "@/lib/volunteer-activities-shared";

/**
 * Everything the caller could plausibly be logging hours against.
 *
 * Only the caller's own classrooms and committees are offered, so the picker
 * can't be read as a roster of who is on what. The event catalog is school-wide
 * on purpose — anyone can turn up to help at the Fall Festival without being
 * signed up for it, and that hour still counts.
 */
export async function getVolunteerHourActivityOptions(): Promise<VolunteerActivityOptions> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return EMPTY_ACTIVITY_OPTIONS;
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const [events, memberRooms, signupRooms, myCommittees] = await Promise.all([
    db.query.eventCatalog.findMany({
      where: and(
        eq(eventCatalog.schoolId, schoolId),
        eq(eventCatalog.isActive, true)
      ),
      columns: { id: true, title: true, category: true },
      orderBy: [asc(eventCatalog.title)],
    }),
    // Room parenthood is recorded in two places — an explicit classroom_members
    // row, or an active volunteer signup — and either one is the real thing.
    db
      .select({ id: classrooms.id, name: classrooms.name })
      .from(classroomMembers)
      .innerJoin(classrooms, eq(classrooms.id, classroomMembers.classroomId))
      .where(
        and(
          eq(classroomMembers.userId, user.id!),
          eq(classroomMembers.role, "room_parent"),
          eq(classrooms.schoolId, schoolId),
          eq(classrooms.schoolYear, schoolYear)
        )
      ),
    db
      .select({ id: classrooms.id, name: classrooms.name })
      .from(volunteerSignups)
      .innerJoin(classrooms, eq(classrooms.id, volunteerSignups.classroomId))
      .where(
        and(
          eq(volunteerSignups.userId, user.id!),
          eq(volunteerSignups.role, "room_parent"),
          eq(volunteerSignups.status, "active"),
          eq(volunteerSignups.schoolId, schoolId),
          eq(classrooms.schoolYear, schoolYear)
        )
      ),
    getMyCommitteeOptions(),
  ]);

  // Both room-parent sources can name the same room; dedupe by classroom.
  const rooms = new Map<string, string>();
  for (const room of [...memberRooms, ...signupRooms]) {
    rooms.set(room.id, room.name);
  }

  return {
    events: events.map((e) => ({
      value: e.title,
      label: e.title,
      suggestedCategory: suggestedCategoryForEventCategory(e.category),
    })),
    classrooms: [...rooms.values()]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        value: roomParentActivityLabel(name),
        label: roomParentActivityLabel(name),
        suggestedCategory: ROOM_PARENT_CATEGORY,
      })),
    committees: myCommittees.map((c) => ({
      id: c.id,
      value: c.name,
      label: c.name,
      suggestedCategory: COMMITTEE_CATEGORY,
    })),
  };
}

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

  // The picker can't produce a blank, but "Other" can — it's a text box.
  const eventName = data.eventName.trim();
  if (!eventName) throw new Error("Say what these hours were for");

  await db.insert(volunteerHours).values({
    schoolId,
    userId: user.id!,
    eventName,
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
  await assertPtaBoardMember(user.id!, schoolId);

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
  await assertPtaBoardMember(user.id!, schoolId);

  // Only delete hours for current school
  await db
    .delete(volunteerHours)
    .where(and(eq(volunteerHours.id, hourId), eq(volunteerHours.schoolId, schoolId)));

  revalidatePath("/admin/volunteer-hours");
  revalidatePath("/volunteer-hours");
}
