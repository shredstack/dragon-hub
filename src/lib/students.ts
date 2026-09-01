/**
 * Reading and writing the `students` table.
 *
 * The rule these functions serve — student names are the PTA board's and the
 * parent's, and nobody else's — lives in `src/lib/students-shared.ts`. Nothing
 * here enforces it: these are plain data helpers, and **every caller must have
 * already established that the reader is the board or the parent themselves.**
 * That is deliberate rather than lazy — an authorization check buried in a read
 * helper is one that a later caller forgets is there.
 *
 * The two writers are different on purpose:
 *
 * - `setStudentsForUser` is **replace-all**, because it backs a form that shows
 *   the whole list. A partial edit isn't expressible, the same reasoning as
 *   `setClassroomTeachers()`.
 * - `mergeStudentsForUser` is **fill-blanks, never overwrite**, because it
 *   backs a signup form that asks for less than the profile does. A parent
 *   typing "Ava" into the Meet the Masters form must not wipe the grade and
 *   room they set on their profile in August.
 */

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { classrooms, students } from "@/lib/db/schema";
import { compareByGradeThenName } from "@/lib/grade-levels";
import {
  mergeStudents,
  normalizeStudents,
  type ClassroomNameLookup,
  type StudentEntry,
} from "@/lib/students-shared";

/** A stored student, with its row id so the board can edit one in place. */
export interface StudentRecord extends StudentEntry {
  id: string;
}

function toEntry(row: {
  id: string;
  name: string;
  gradeLevel: string | null;
  classroomId: string | null;
}): StudentRecord {
  return {
    id: row.id,
    name: row.name,
    gradeLevel: row.gradeLevel,
    classroomId: row.classroomId,
  };
}

/** One parent's children at one school, in the order they entered them. */
export async function getStudentsForUser(
  schoolId: string,
  userId: string
): Promise<StudentRecord[]> {
  const rows = await db
    .select({
      id: students.id,
      name: students.name,
      gradeLevel: students.gradeLevel,
      classroomId: students.classroomId,
      sortOrder: students.sortOrder,
    })
    .from(students)
    .where(and(eq(students.schoolId, schoolId), eq(students.userId, userId)));

  return rows
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(toEntry);
}

/**
 * The same, for a page rendering many people at once — the board's member
 * directory and the member export both need this and neither can afford a
 * query per row.
 *
 * Returns a map keyed by `userId`; a parent with no students has no entry
 * rather than an empty array, so `map.get(id) ?? []` is the read.
 */
export async function getStudentsForUsers(
  schoolId: string,
  userIds: string[]
): Promise<Map<string, StudentRecord[]>> {
  const byUser = new Map<string, StudentRecord[]>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return byUser;

  const rows = await db
    .select({
      id: students.id,
      userId: students.userId,
      name: students.name,
      gradeLevel: students.gradeLevel,
      classroomId: students.classroomId,
      sortOrder: students.sortOrder,
    })
    .from(students)
    .where(
      and(eq(students.schoolId, schoolId), inArray(students.userId, ids))
    );

  for (const row of rows.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  )) {
    const list = byUser.get(row.userId);
    if (list) list.push(toEntry(row));
    else byUser.set(row.userId, [toEntry(row)]);
  }

  return byUser;
}

/**
 * Replace this parent's list with exactly what was submitted.
 *
 * Deleting every row and re-inserting loses nothing worth keeping — a student
 * row carries no history, no seat and no foreign keys pointing at it — and it
 * keeps `sortOrder` honest without a diff.
 */
export async function setStudentsForUser(
  schoolId: string,
  userId: string,
  input: unknown
): Promise<StudentEntry[]> {
  const entries = normalizeStudents(input);
  const valid = await withValidClassrooms(schoolId, entries);

  await db.transaction(async (tx) => {
    await tx
      .delete(students)
      .where(and(eq(students.schoolId, schoolId), eq(students.userId, userId)));

    if (valid.length > 0) {
      await tx.insert(students).values(
        valid.map((entry, i) => ({
          schoolId,
          userId,
          name: entry.name,
          gradeLevel: entry.gradeLevel,
          classroomId: entry.classroomId,
          sortOrder: i,
        }))
      );
    }
  });

  return valid;
}

/**
 * Fold what a signup form collected into the parent's stored list.
 *
 * Called from `recordVolunteerSignup` / `recordCommitteeSignup` whenever the
 * signup resolved to an account. A signup with no account behind it keeps its
 * students on the signup row alone; the board still sees them, because every
 * student-reading surface falls back to the snapshot.
 */
export async function mergeStudentsForUser(
  schoolId: string,
  userId: string,
  input: unknown
): Promise<void> {
  const incoming = normalizeStudents(input);
  if (incoming.length === 0) return;

  const existing = await getStudentsForUser(schoolId, userId);
  const merged = mergeStudents(existing, incoming);

  // Nothing new and nothing filled in — don't rewrite rows to say the same
  // thing, and don't take the transaction.
  const unchanged =
    merged.length === existing.length &&
    merged.every(
      (entry, i) =>
        entry.name === existing[i].name &&
        entry.gradeLevel === existing[i].gradeLevel &&
        entry.classroomId === existing[i].classroomId
    );
  if (unchanged) return;

  await setStudentsForUser(schoolId, userId, merged);
}

/**
 * Drop any `classroomId` that isn't a real room at this school.
 *
 * The id arrives from a form and would otherwise be a way to test whether an
 * arbitrary uuid is a classroom somewhere. Dropping rather than rejecting is
 * the right failure here: the child is the data, the room is a convenience, and
 * refusing the whole save because of a stale room id would lose the name.
 */
async function withValidClassrooms(
  schoolId: string,
  entries: StudentEntry[]
): Promise<StudentEntry[]> {
  const ids = [
    ...new Set(entries.map((e) => e.classroomId).filter((id): id is string => !!id)),
  ];
  if (ids.length === 0) return entries;

  const rows = await db
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(and(eq(classrooms.schoolId, schoolId), inArray(classrooms.id, ids)));
  const valid = new Set(rows.map((r) => r.id));

  return entries.map((e) =>
    e.classroomId && !valid.has(e.classroomId)
      ? { ...e, classroomId: null }
      : e
  );
}

/**
 * The rooms a parent can attach a child to: this year's classrooms, in grade
 * order. Safe to hand to any signed-in user — a classroom list is already on
 * every signup page.
 */
export async function getStudentClassroomOptions(
  schoolId: string,
  schoolYear: string
): Promise<{ id: string; name: string; gradeLevel: string | null }[]> {
  const rows = await db
    .select({
      id: classrooms.id,
      name: classrooms.name,
      gradeLevel: classrooms.gradeLevel,
    })
    .from(classrooms)
    .where(
      and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, schoolYear),
        eq(classrooms.active, true)
      )
    );
  return rows.sort(compareByGradeThenName);
}

/** Build the lookup `formatStudent()` takes, from a classroom option list. */
export function classroomLookupFrom(
  rooms: { id: string; name: string; gradeLevel: string | null }[]
): ClassroomNameLookup {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  return (id) => byId.get(id);
}
