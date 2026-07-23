import { dbPool, type db as Db } from "@/lib/db";
import { schoolMemberships, schools } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { copyClassroomsToYear } from "@/lib/classroom-rollover";
import { copyCommitteesToYear } from "@/lib/committee-rollover";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import {
  assertValidSchoolYear,
  getDefaultSchoolYears,
  parseSchoolYear,
} from "@/lib/school-year";

/** Roles that survive a school-year rollover automatically. */
export function isLeadershipRole(role: string): boolean {
  return role === "admin" || role === "pta_board";
}

export interface RolloverInput {
  schoolId: string;
  /** User performing the rollover; recorded on carried-forward rows. */
  actorId: string;
  targetYear: string;
  /** Omit to keep the existing code. */
  newJoinCode?: string;
  /** Membership IDs of ordinary members to carry over without rejoining. */
  alsoCarryOver?: string[];
  /** Copy the outgoing year's classrooms into the new year. Defaults to true. */
  copyClassrooms?: boolean;
  /**
   * Copy the outgoing year's committees into the new year as drafts. Defaults
   * to true. Rosters are never carried — see copyCommitteesToYear.
   */
  copyCommittees?: boolean;
}

export interface RolloverResult {
  fromYear: string;
  targetYear: string;
  joinCode: string;
  carriedOver: number;
  expired: number;
  /** Classroom rows created for the new year. */
  classroomsCopied: number;
  /** Committee rows created for the new year, as drafts. */
  committeesCopied: number;
}

/** The `db` singleton's type — what copyClassroomsToYear accepts. */
type DbLike = typeof Db;

/**
 * Roll a school over to a new school year, atomically.
 *
 * Replaces the old three-button dance (change year → generate code → expire
 * memberships). Performing those separately, or stopping halfway, left the
 * school with zero approved memberships and locked everyone out — including the
 * admins who were the only ones able to undo it.
 *
 * In one transaction:
 *   1. Carry leadership (admin / PTA board) forward into the new year, keeping
 *      role and board position. Leadership is NEVER expired by a rollover —
 *      board turnover is an explicit roster edit, not a calendar side effect.
 *   2. Expire ordinary members for the outgoing year so they must re-enter the
 *      new join code.
 *   3. Rotate the join code.
 *   4. Advance `currentSchoolYear` and add the year to the picker.
 *
 * Finally it asserts leadership survived; if not the whole transaction rolls
 * back, so a rollover can never be the thing that locks a school out.
 *
 * Classrooms are the one piece of year-scoped content this touches: the
 * outgoing year's rooms are COPIED into the new year (configuration only) so
 * the board doesn't re-enter them by hand. Prior-year rows keep their roster,
 * room parents, messages and tasks. Everything else — budgets, minutes, event
 * plans, handoff notes, guides, event interest — is left completely intact and
 * stays viewable via the year picker.
 *
 * Callers are responsible for authorization.
 */
export async function performRollover(
  input: RolloverInput
): Promise<RolloverResult> {
  const targetYear = assertValidSchoolYear(input.targetYear);
  const { schoolId, actorId } = input;

  return dbPool.transaction(async (tx) => {
    const school = await tx.query.schools.findFirst({
      where: eq(schools.id, schoolId),
    });
    if (!school) throw new Error("School not found");

    const fromYear = school.currentSchoolYear ?? CURRENT_SCHOOL_YEAR;
    if (targetYear === fromYear) {
      throw new Error(`${targetYear} is already the current school year.`);
    }
    if (parseSchoolYear(targetYear) < parseSchoolYear(fromYear)) {
      throw new Error(
        `Cannot roll back to ${targetYear}. Use the year picker to view past-year data instead.`
      );
    }

    // Validate the new join code before any writes.
    let joinCode = school.joinCode;
    if (input.newJoinCode !== undefined) {
      joinCode = input.newJoinCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,20}$/.test(joinCode)) {
        throw new Error(
          "Join code must be 4-20 characters, letters and numbers only."
        );
      }
      const clash = await tx.query.schools.findFirst({
        where: eq(schools.joinCode, joinCode),
      });
      if (clash && clash.id !== schoolId) {
        throw new Error("That join code is already in use by another school.");
      }
    }

    const all = await tx.query.schoolMemberships.findMany({
      where: eq(schoolMemberships.schoolId, schoolId),
    });

    const outgoing = all.filter(
      (m) => m.schoolYear === fromYear && m.status === "approved"
    );
    const existingTargetByUser = new Map(
      all.filter((m) => m.schoolYear === targetYear).map((m) => [m.userId, m])
    );

    const extra = new Set(input.alsoCarryOver ?? []);
    const toCarry = outgoing.filter(
      (m) => isLeadershipRole(m.role) || extra.has(m.id)
    );

    // 1. Carry forward.
    let carried = 0;
    for (const m of toCarry) {
      const existing = existingTargetByUser.get(m.userId);
      if (existing) {
        if (existing.status !== "approved") {
          await tx
            .update(schoolMemberships)
            .set({
              status: "approved",
              role: m.role,
              boardPosition: m.boardPosition,
              approvedAt: existing.approvedAt ?? new Date(),
            })
            .where(eq(schoolMemberships.id, existing.id));
          carried++;
        }
        continue;
      }
      await tx.insert(schoolMemberships).values({
        schoolId,
        userId: m.userId,
        role: m.role,
        boardPosition: m.boardPosition,
        schoolYear: targetYear,
        status: "approved",
        invitedBy: actorId,
        approvedAt: new Date(),
        renewedFrom: m.id,
      });
      carried++;
    }

    // 2. Expire ordinary members for the outgoing year only. Leadership rows
    //    stay approved on purpose — they are the anti-lockout valve.
    const carriedIds = new Set(toCarry.map((m) => m.id));
    const toExpire = outgoing.filter(
      (m) => !isLeadershipRole(m.role) && !carriedIds.has(m.id)
    );
    for (const m of toExpire) {
      await tx
        .update(schoolMemberships)
        .set({ status: "expired" })
        .where(eq(schoolMemberships.id, m.id));
    }

    // 3 + 4. Rotate the code and advance the year together.
    const available =
      school.availableSchoolYears ?? getDefaultSchoolYears().available;
    const updatedAvailable = available.includes(targetYear)
      ? available
      : [...available, targetYear];

    await tx
      .update(schools)
      .set({
        joinCode,
        currentSchoolYear: targetYear,
        availableSchoolYears: updatedAvailable.sort(
          (a, b) => parseSchoolYear(b) - parseSchoolYear(a)
        ),
      })
      .where(eq(schools.id, schoolId));

    // 5. Carry the classroom roster of rooms (not of people) into the new year.
    //    Idempotent, so a board that already promoted a few rooms by hand from
    //    Manage Classrooms doesn't end up with duplicates.
    let classroomsCopied = 0;
    if (input.copyClassrooms !== false) {
      const copy = await copyClassroomsToYear(tx as unknown as DbLike, {
        schoolId,
        targetYear,
        fromYear,
      });
      classroomsCopied = copy.copied;
    }

    // 6. Copy committee configuration into the new year as drafts. Runs after
    //    classrooms so a classroom-scoped committee can be re-pointed at this
    //    year's room rather than dangling at last year's. Rosters never carry.
    let committeesCopied = 0;
    if (input.copyCommittees !== false) {
      const copy = await copyCommitteesToYear(tx as unknown as DbLike, {
        schoolId,
        targetYear,
        fromYear,
      });
      committeesCopied = copy.copied;
    }

    // Post-condition: the school must still have leadership for the new year.
    // If this fails the whole transaction rolls back and nobody is locked out.
    const leadershipAfter = await tx.query.schoolMemberships.findMany({
      where: and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, targetYear),
        eq(schoolMemberships.status, "approved")
      ),
    });
    if (!leadershipAfter.some((m) => isLeadershipRole(m.role))) {
      throw new Error(
        "Rollover aborted: this would leave the school with no admin or PTA board member for " +
          `${targetYear}. Assign at least one admin before rolling over.`
      );
    }

    return {
      fromYear,
      targetYear,
      joinCode,
      carriedOver: carried,
      expired: toExpire.length,
      classroomsCopied,
      committeesCopied,
    };
  });
}
