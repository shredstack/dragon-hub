"use server";

import { assertAuthenticated, getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { normalizePhoneNumber, isValidPhoneNumber, formatPhoneNumber } from "@/lib/utils";
import { getSchoolCurrentYear } from "@/lib/school-year";
import {
  getStudentClassroomOptions,
  getStudentsForUser,
  setStudentsForUser,
} from "@/lib/students";
import type { StudentEntry } from "@/lib/students-shared";

export async function updateProfile(data: {
  name?: string;
  phone?: string;
  /**
   * The parent's own children. Absent means "don't touch"; an empty array
   * means "I removed them all", which is a real thing to say and must not be
   * confused with the first.
   */
  students?: StudentEntry[];
}) {
  const user = await assertAuthenticated();

  const updateData: { name?: string | null; phone?: string | null } = {};

  if (data.name !== undefined) {
    updateData.name = data.name.trim() || null;
  }

  if (data.phone !== undefined) {
    const phone = data.phone.trim();
    if (phone && !isValidPhoneNumber(phone)) {
      throw new Error("Invalid phone number");
    }
    updateData.phone = normalizePhoneNumber(phone);
  }

  if (Object.keys(updateData).length > 0) {
    await db.update(users).set(updateData).where(eq(users.id, user.id!));
  }

  // Students are per-school (see the `students` table comment in schema.ts), so
  // this writes the list for the school the user is currently in. Someone with
  // no current school has no list to write, and silently skipping is right —
  // the profile form doesn't render the field for them either.
  if (data.students !== undefined) {
    const schoolId = await getCurrentSchoolId();
    if (schoolId) {
      await setStudentsForUser(schoolId, user.id!, data.students);
    }
  }

  revalidatePath("/profile");
  revalidatePath("/admin/members");
  return { success: true };
}

export async function getProfile() {
  const user = await assertAuthenticated();

  const profile = await db.query.users.findFirst({
    where: eq(users.id, user.id!),
    columns: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
    },
  });

  if (!profile) return null;

  const schoolId = await getCurrentSchoolId();
  const [students, classrooms] = schoolId
    ? await Promise.all([
        getStudentsForUser(schoolId, user.id!),
        getSchoolCurrentYear(schoolId).then((year) =>
          getStudentClassroomOptions(schoolId, year)
        ),
      ])
    : [[], []];

  return {
    ...profile,
    phone: formatPhoneNumber(profile.phone),
    /** Reading your own children needs no board check — they're yours. */
    students: students.map((s) => ({
      name: s.name,
      gradeLevel: s.gradeLevel,
      classroomId: s.classroomId,
    })),
    /** Null when the user isn't in a school, which hides the field entirely. */
    studentClassrooms: schoolId ? classrooms : null,
  };
}
