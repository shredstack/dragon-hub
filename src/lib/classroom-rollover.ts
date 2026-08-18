import { classroomTeachers, classrooms } from "@/lib/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { assertValidSchoolYear } from "@/lib/school-year";
import type { db as Db } from "@/lib/db";

/**
 * Carrying classrooms into a new school year.
 *
 * The rule: a classroom row belongs to exactly one school year, forever. Rolling
 * over COPIES the room's configuration into a new row for the new year and
 * leaves the old row untouched — its roster, room parents, messages, tasks and
 * volunteer signups stay attached to the year they actually happened in.
 *
 * What copies: name, grade level, the teacher list, DLI settings, and the
 * hide-from-sign-up flag. What does not: members, room parents, volunteer
 * signups, messages, tasks. A new year starts with an empty room.
 *
 * `lineageId` ties every yearly instance of a room together, so "Mrs. Glover's
 * 1st grade" can be traced across years even as the teacher changes.
 *
 * Callers are responsible for authorization. Accepts a transaction handle so a
 * school-year rollover can copy classrooms in the same transaction that
 * advances the year.
 */

/** Anything with the query surface used here — the db singleton or a tx. */
type DbLike = typeof Db;

export interface CopyClassroomsResult {
  copied: number;
  /** Rooms that already had a row in the target year, by name. */
  skipped: string[];
  /**
   * The new rows' ids, for post-commit work the transaction can't do itself —
   * currently re-linking each room's teacher. See `teacher-linking.ts`.
   */
  createdIds: string[];
}

export async function copyClassroomsToYear(
  tx: DbLike,
  input: {
    schoolId: string;
    targetYear: string;
    /** Restrict to these classroom ids; omit to take every candidate. */
    classroomIds?: string[];
    /** Source year to copy from. Omit to copy from every earlier year. */
    fromYear?: string;
  }
): Promise<CopyClassroomsResult> {
  const targetYear = assertValidSchoolYear(input.targetYear);

  const sources = await tx.query.classrooms.findMany({
    where: input.classroomIds?.length
      ? and(
          eq(classrooms.schoolId, input.schoolId),
          inArray(classrooms.id, input.classroomIds)
        )
      : input.fromYear
        ? and(
            eq(classrooms.schoolId, input.schoolId),
            eq(classrooms.schoolYear, input.fromYear),
            eq(classrooms.active, true)
          )
        : eq(classrooms.schoolId, input.schoolId),
  });

  const candidates = sources.filter((c) => c.schoolYear !== targetYear);
  if (candidates.length === 0) return { copied: 0, skipped: [], createdIds: [] };

  // A room already present in the target year is a no-op, not an error — that's
  // what makes this button safe to press twice and safe to run automatically
  // from the year rollover after someone already promoted a few rooms by hand.
  const existing = await tx.query.classrooms.findMany({
    where: and(
      eq(classrooms.schoolId, input.schoolId),
      eq(classrooms.schoolYear, targetYear)
    ),
    columns: { lineageId: true, id: true },
  });
  const takenLineages = new Set(existing.map((c) => c.lineageId ?? c.id));

  const skipped: string[] = [];
  const rows: (typeof classrooms.$inferInsert)[] = [];

  for (const source of candidates) {
    const lineageId = source.lineageId ?? source.id;
    if (takenLineages.has(lineageId)) {
      skipped.push(source.name);
      continue;
    }
    takenLineages.add(lineageId);
    rows.push({
      schoolId: source.schoolId,
      name: source.name,
      gradeLevel: source.gradeLevel,
      // The deprecated mirror; the real list is copied below.
      teacherEmail: source.teacherEmail,
      schoolYear: targetYear,
      active: true,
      excludeFromSignup: source.excludeFromSignup,
      isDli: source.isDli,
      dliGroupId: source.dliGroupId,
      lineageId,
      rolledFromId: source.id,
    });
  }

  // Ids come back so the caller can re-link teachers *after* the transaction
  // commits — `syncClassroomTeacherMembership` uses the `db` singleton, so
  // running it in here would have it querying rows this tx hasn't committed.
  let createdIds: string[] = [];
  if (rows.length > 0) {
    const created = await tx
      .insert(classrooms)
      .values(rows)
      .returning({ id: classrooms.id, rolledFromId: classrooms.rolledFromId });
    createdIds = created.map((r) => r.id);

    // Carry each room's teacher list forward. `rolled_from_id` is what pairs a
    // new row with the row it came from — the insert above preserves order, but
    // relying on that would be relying on an implementation detail.
    const sourceIds = created
      .map((r) => r.rolledFromId)
      .filter((id): id is string => !!id);

    const sourceTeachers = sourceIds.length
      ? await tx
          .select({
            classroomId: classroomTeachers.classroomId,
            name: classroomTeachers.name,
            email: classroomTeachers.email,
            sortOrder: classroomTeachers.sortOrder,
          })
          .from(classroomTeachers)
          .where(inArray(classroomTeachers.classroomId, sourceIds))
          .orderBy(asc(classroomTeachers.sortOrder))
      : [];

    if (sourceTeachers.length > 0) {
      const bySource = new Map<string, typeof sourceTeachers>();
      for (const teacher of sourceTeachers) {
        const list = bySource.get(teacher.classroomId);
        if (list) list.push(teacher);
        else bySource.set(teacher.classroomId, [teacher]);
      }

      const teacherRows = created.flatMap((room) =>
        (room.rolledFromId ? (bySource.get(room.rolledFromId) ?? []) : []).map(
          (teacher) => ({
            classroomId: room.id,
            name: teacher.name,
            email: teacher.email,
            sortOrder: teacher.sortOrder,
          })
        )
      );

      if (teacherRows.length > 0) {
        await tx.insert(classroomTeachers).values(teacherRows);
      }
    }
  }

  return { copied: rows.length, skipped, createdIds };
}

/**
 * Classrooms from the previous year whose room has no row yet in `targetYear` —
 * i.e. what a "promote to <year>" button should offer.
 *
 * **One source year only, and it is the most recent one before the target.** A
 * past-year classroom row is never archived in practice — `active` is set when
 * the room is running and nobody goes back to clear it after the year ends — so
 * searching every earlier year meant a room the school stopped running three
 * years ago stayed on offer forever, indistinguishable from one that simply
 * hasn't been carried forward yet. Absent from last year *is* the signal that a
 * room is gone; this is also the rule `copyClassroomsToYear` already follows
 * when the year rollover calls it with a `fromYear`.
 *
 * Pass `fromYear` to pin the source year explicitly. The school-year rollover
 * preview does, so the count it shows is exactly what the rollover will copy.
 */
export async function findClassroomsToPromote(
  tx: DbLike,
  schoolId: string,
  targetYear: string,
  fromYear?: string
) {
  const all = await tx.query.classrooms.findMany({
    where: and(eq(classrooms.schoolId, schoolId), eq(classrooms.active, true)),
  });

  const takenLineages = new Set(
    all
      .filter((c) => c.schoolYear === targetYear)
      .map((c) => c.lineageId ?? c.id)
  );

  // School years are "YYYY-YYYY", so they sort lexicographically by start year.
  const sourceYear =
    fromYear ??
    all
      .map((c) => c.schoolYear)
      .filter((year) => year < targetYear)
      .sort()
      .at(-1);
  if (!sourceYear || sourceYear === targetYear) return [];

  const byLineage = new Map<string, (typeof all)[number]>();
  for (const c of all) {
    if (c.schoolYear !== sourceYear) continue;
    const lineageId = c.lineageId ?? c.id;
    if (takenLineages.has(lineageId)) continue;
    byLineage.set(lineageId, c);
  }

  return [...byLineage.values()].sort((a, b) => a.name.localeCompare(b.name));
}
