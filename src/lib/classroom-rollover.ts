import { classrooms } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
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
 * What copies: name, grade level, teacher email, DLI settings, and the
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
  if (candidates.length === 0) return { copied: 0, skipped: [] };

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

  if (rows.length > 0) {
    await tx.insert(classrooms).values(rows);
  }

  return { copied: rows.length, skipped };
}

/**
 * Classrooms from earlier years whose room has no row yet in `targetYear` —
 * i.e. what a "promote to <year>" button should offer. Newest year first so the
 * most recent version of each room wins when a room skipped a year.
 */
export async function findClassroomsToPromote(
  tx: DbLike,
  schoolId: string,
  targetYear: string
) {
  const all = await tx.query.classrooms.findMany({
    where: and(eq(classrooms.schoolId, schoolId), eq(classrooms.active, true)),
  });

  const takenLineages = new Set(
    all
      .filter((c) => c.schoolYear === targetYear)
      .map((c) => c.lineageId ?? c.id)
  );

  const byLineage = new Map<string, (typeof all)[number]>();
  for (const c of all) {
    if (c.schoolYear === targetYear) continue;
    const lineageId = c.lineageId ?? c.id;
    if (takenLineages.has(lineageId)) continue;
    const seen = byLineage.get(lineageId);
    if (!seen || c.schoolYear > seen.schoolYear) byLineage.set(lineageId, c);
  }

  return [...byLineage.values()].sort(
    (a, b) =>
      b.schoolYear.localeCompare(a.schoolYear) || a.name.localeCompare(b.name)
  );
}
