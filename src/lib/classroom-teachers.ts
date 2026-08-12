/**
 * Reading and writing a classroom's teacher list.
 *
 * The list lives in `classroom_teachers` (see the table comment in
 * `schema.ts`); `classrooms.teacher_email` is a deprecated mirror of the first
 * entry and is written here and nowhere else.
 *
 * Writing the list is only half the job — it records *who the board says*
 * teaches the room. Putting those people inside the room is
 * `syncClassroomTeacherMembership()` in `teacher-linking.ts`, and every caller
 * that writes the list must call it afterwards.
 */

import { db } from "@/lib/db";
import { classroomTeachers, classrooms } from "@/lib/db/schema";
import { and, eq, inArray, notInArray, asc } from "drizzle-orm";
import {
  normalizeTeacherInputs,
  type ClassroomTeacher,
  type ClassroomTeacherInput,
} from "@/lib/classroom-teachers-shared";

export type { ClassroomTeacher, ClassroomTeacherInput };

/** Anything with the query surface used here — the db singleton or a tx. */
type DbLike = typeof db;

/**
 * Replaces a classroom's teacher list with `inputs`, in the order given.
 *
 * Replace-all rather than add/remove, because that is what the form submits: a
 * board member edits the list they can see. Existing rows for addresses that
 * survive are updated in place instead of being deleted and reinserted, so a
 * reorder or a name correction doesn't churn ids.
 *
 * Does **not** touch `classroom_members`. Call
 * `syncClassroomTeacherMembership(classroomId)` after this, outside any
 * transaction — see the note on `copyClassroomsToYear`.
 */
export async function setClassroomTeachers(
  classroomId: string,
  inputs: ClassroomTeacherInput[],
  tx: DbLike = db
): Promise<void> {
  const teachers = normalizeTeacherInputs(inputs);
  const emails = teachers.map((t) => t.email);

  // Anyone no longer on the list goes. An empty list clears the room, which is
  // how a board member says "we don't know yet".
  await tx
    .delete(classroomTeachers)
    .where(
      and(
        eq(classroomTeachers.classroomId, classroomId),
        ...(emails.length
          ? [notInArray(classroomTeachers.email, emails)]
          : [])
      )
    );

  for (const [index, teacher] of teachers.entries()) {
    await tx
      .insert(classroomTeachers)
      .values({
        classroomId,
        name: teacher.name,
        email: teacher.email,
        sortOrder: index,
      })
      .onConflictDoUpdate({
        target: [classroomTeachers.classroomId, classroomTeachers.email],
        set: { name: teacher.name, sortOrder: index },
      });
  }

  // The deprecated mirror. First teacher only — it can hold no more than that,
  // which is the entire reason this table exists.
  await tx
    .update(classrooms)
    .set({ teacherEmail: teachers[0]?.email ?? null })
    .where(eq(classrooms.id, classroomId));
}

/** One classroom's teachers, in the board's order. */
export async function getClassroomTeachers(
  classroomId: string,
  tx: DbLike = db
): Promise<ClassroomTeacher[]> {
  return tx
    .select({
      id: classroomTeachers.id,
      name: classroomTeachers.name,
      email: classroomTeachers.email,
      sortOrder: classroomTeachers.sortOrder,
    })
    .from(classroomTeachers)
    .where(eq(classroomTeachers.classroomId, classroomId))
    .orderBy(asc(classroomTeachers.sortOrder), asc(classroomTeachers.email));
}

/**
 * Teachers for many classrooms at once, keyed by classroom id.
 *
 * Every list page that shows a teacher shows a page full of them, so this is
 * the shape those pages want — one query, not one per room. Rooms with no
 * teacher are simply absent from the map; use `?? []`.
 */
export async function getClassroomTeachersMap(
  classroomIds: string[],
  tx: DbLike = db
): Promise<Map<string, ClassroomTeacher[]>> {
  const byClassroom = new Map<string, ClassroomTeacher[]>();
  if (classroomIds.length === 0) return byClassroom;

  const rows = await tx
    .select({
      classroomId: classroomTeachers.classroomId,
      id: classroomTeachers.id,
      name: classroomTeachers.name,
      email: classroomTeachers.email,
      sortOrder: classroomTeachers.sortOrder,
    })
    .from(classroomTeachers)
    .where(inArray(classroomTeachers.classroomId, classroomIds))
    .orderBy(asc(classroomTeachers.sortOrder), asc(classroomTeachers.email));

  for (const row of rows) {
    const list = byClassroom.get(row.classroomId);
    const teacher = {
      id: row.id,
      name: row.name,
      email: row.email,
      sortOrder: row.sortOrder,
    };
    if (list) list.push(teacher);
    else byClassroom.set(row.classroomId, [teacher]);
  }

  return byClassroom;
}
