import { classrooms, committees } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { assertValidSchoolYear } from "@/lib/school-year";
import type { db as Db } from "@/lib/db";

/**
 * Carrying committees into a new school year.
 *
 * Same rule as classrooms: a committee row belongs to exactly one school year,
 * forever. Rolling over COPIES the configuration into a new row and leaves the
 * old one untouched, so last year's roster, messages and tasks stay attached to
 * the year they actually happened in. `lineageId` ties the yearly rows together
 * so "the Yearbook Committee" can be traced across years.
 *
 * What copies: name, blurb, responsibilities, timing, capacity, ownership.
 *
 * What deliberately does NOT:
 *
 *   - **The roster.** Committee membership is a yearly commitment. Carrying it
 *     silently would put last year's parents on this year's message board
 *     without anyone asking them.
 *   - **The join code.** A new code is minted so a flyer printed last September
 *     can't quietly enroll someone into the new year's committee.
 *   - **Status.** New rows land as `draft`, so the board reviews the copy before
 *     any link goes live.
 *
 * Callers are responsible for authorization. Accepts a transaction handle so a
 * school-year rollover can copy committees in the same transaction that
 * advances the year.
 */

/** Anything with the query surface used here — the db singleton or a tx. */
type DbLike = typeof Db;

export interface CopyCommitteesResult {
  copied: number;
  /** Committees that already had a row in the target year, by name. */
  skipped: string[];
}

export async function copyCommitteesToYear(
  tx: DbLike,
  input: {
    schoolId: string;
    targetYear: string;
    /** Restrict to these committee ids; omit to take every candidate. */
    committeeIds?: string[];
    /** Source year to copy from. Omit to copy from every earlier year. */
    fromYear?: string;
  }
): Promise<CopyCommitteesResult> {
  const targetYear = assertValidSchoolYear(input.targetYear);

  const sources = await tx.query.committees.findMany({
    where: input.committeeIds?.length
      ? and(
          eq(committees.schoolId, input.schoolId),
          inArray(committees.id, input.committeeIds)
        )
      : input.fromYear
        ? and(
            eq(committees.schoolId, input.schoolId),
            eq(committees.schoolYear, input.fromYear),
            isNull(committees.archivedAt)
          )
        : and(
            eq(committees.schoolId, input.schoolId),
            isNull(committees.archivedAt)
          ),
  });

  const candidates = sources.filter((c) => c.schoolYear !== targetYear);
  if (candidates.length === 0) return { copied: 0, skipped: [] };

  // A committee already present in the target year is a no-op, not an error —
  // that's what makes this safe to run twice, and safe to run automatically
  // after a board already created a few of next year's committees by hand.
  const existing = await tx.query.committees.findMany({
    where: and(
      eq(committees.schoolId, input.schoolId),
      eq(committees.schoolYear, targetYear)
    ),
    columns: { lineageId: true, id: true, name: true },
  });
  const takenLineages = new Set(existing.map((c) => c.lineageId ?? c.id));
  // `committees_school_year_name_unique` would reject a same-name copy even
  // when the lineage differs, so guard on the name too.
  const takenNames = new Set(existing.map((c) => c.name));

  // A classroom-scoped committee points at LAST year's classroom row, which is
  // not this year's room. Re-point it at the new year's row for the same
  // lineage when the rollover has already created one; otherwise the scope
  // falls back to school-wide rather than dangling at a prior-year classroom.
  const classroomLineage = await buildClassroomLineageMap(
    tx,
    input.schoolId,
    targetYear,
    candidates
      .map((c) => c.classroomId)
      .filter((id): id is string => !!id)
  );

  const skipped: string[] = [];
  const rows: (typeof committees.$inferInsert)[] = [];

  for (const source of candidates) {
    const lineageId = source.lineageId ?? source.id;
    if (takenLineages.has(lineageId) || takenNames.has(source.name)) {
      skipped.push(source.name);
      continue;
    }
    takenLineages.add(lineageId);
    takenNames.add(source.name);

    const remappedClassroomId =
      source.scope === "classroom" && source.classroomId
        ? (classroomLineage.get(source.classroomId) ?? null)
        : null;
    const scope =
      source.scope === "classroom" && !remappedClassroomId
        ? ("school" as const)
        : source.scope;

    rows.push({
      schoolId: source.schoolId,
      schoolYear: targetYear,
      name: source.name,
      description: source.description,
      responsibilities: source.responsibilities,
      typicalTiming: source.typicalTiming,
      timeCommitment: source.timeCommitment,
      iconEmoji: source.iconEmoji,
      imageUrl: source.imageUrl,
      scope,
      classroomId: scope === "classroom" ? remappedClassroomId : null,
      // An event plan belongs to the year it ran in, so a rolled-over committee
      // starts unlinked; the board links it to this year's plan when it exists.
      eventPlanId: null,
      grantsLinkedAccess: source.grantsLinkedAccess,
      joinCode: nanoid(12),
      showOnRoomParentSignup: source.showOnRoomParentSignup,
      capacityMode: source.capacityMode,
      minSize: source.minSize,
      maxSize: source.maxSize,
      waitlistEnabled: source.waitlistEnabled,
      ownerPosition: source.ownerPosition,
      contactEmail: source.contactEmail,
      status: "draft",
      sortOrder: source.sortOrder,
      digestEnabled: source.digestEnabled,
      lineageId,
      rolledFromId: source.id,
      createdBy: source.createdBy,
    });
  }

  if (rows.length > 0) {
    await tx.insert(committees).values(rows);
  }

  return { copied: rows.length, skipped };
}

/**
 * prior-year classroom id → this year's classroom id for the same room.
 *
 * Empty when the rollover didn't copy classrooms, which is exactly the case
 * where a classroom-scoped committee should fall back to school-wide.
 */
async function buildClassroomLineageMap(
  tx: DbLike,
  schoolId: string,
  targetYear: string,
  sourceClassroomIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (sourceClassroomIds.length === 0) return map;

  const [sourceRooms, targetRooms] = await Promise.all([
    tx.query.classrooms.findMany({
      where: inArray(classrooms.id, sourceClassroomIds),
      columns: { id: true, lineageId: true },
    }),
    tx.query.classrooms.findMany({
      where: and(
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.schoolYear, targetYear)
      ),
      columns: { id: true, lineageId: true },
    }),
  ]);

  const byLineage = new Map(
    targetRooms.map((room) => [room.lineageId ?? room.id, room.id])
  );
  for (const room of sourceRooms) {
    const target = byLineage.get(room.lineageId ?? room.id);
    if (target) map.set(room.id, target);
  }
  return map;
}
