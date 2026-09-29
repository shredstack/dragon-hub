/**
 * Moving a volunteer from one classroom to another — the board's answer to "we
 * hired a new 2nd grade teacher and half of Room 12's families are now in Room
 * 14".
 *
 * A move is deliberately a *signup in the new room* followed by a *release of
 * the old one*, through the same two helpers every other path uses, rather than
 * an UPDATE of `classroom_id`. Each half has consequences an in-place edit would
 * skip:
 *
 * - `recordVolunteerSignup` / `recordCommitteeSignup` grant the new room's
 *   access and fold into an existing row if the person already volunteers
 *   there, instead of tripping the partial unique index.
 * - `deactivateVolunteerSignup` / `deactivateCommitteeSignup` re-derive the old
 *   room's membership (so a moved room parent stops seeing its private board)
 *   and promote whoever was waiting for the seat they just gave up. A seat that
 *   frees without promoting anyone is the bug `signup-seats.ts` exists to
 *   prevent, and a move frees a seat.
 *
 * The new-room half runs first, so a failure part-way leaves someone in both
 * rooms (visible, fixable) rather than in neither.
 *
 * Capacity is not enforced in the target: like the board's manual add, a board
 * member moving someone is the override, and the dialog shows the counts.
 *
 * Deliberately not a "use server" module — it is called from server actions.
 */

import { db } from "@/lib/db";
import { classrooms, committees, committeeSignups } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  deactivateVolunteerSignup,
  recordVolunteerSignup,
  type ClassroomVolunteerRole,
} from "@/lib/volunteer-onboarding";
import {
  deactivateCommitteeSignup,
  recordCommitteeSignup,
} from "@/lib/committee-onboarding";
import type { StudentEntry } from "@/lib/students-shared";

export interface MoveTarget {
  id: string;
  name: string;
}

/**
 * The room someone may be moved into from `sourceClassroomId`: same school,
 * same school year, active, and not the room they're already in. A move across
 * years would put a volunteer on a roster nobody is looking at.
 */
export async function resolveMoveTarget(params: {
  schoolId: string;
  sourceClassroomId: string;
  targetClassroomId: string;
}): Promise<MoveTarget> {
  const { schoolId, sourceClassroomId, targetClassroomId } = params;
  if (sourceClassroomId === targetClassroomId) {
    throw new Error("They're already in that classroom.");
  }

  const [source, target] = await Promise.all([
    db.query.classrooms.findFirst({
      where: and(
        eq(classrooms.id, sourceClassroomId),
        eq(classrooms.schoolId, schoolId)
      ),
      columns: { id: true, schoolYear: true },
    }),
    db.query.classrooms.findFirst({
      where: and(
        eq(classrooms.id, targetClassroomId),
        eq(classrooms.schoolId, schoolId)
      ),
      columns: {
        id: true,
        name: true,
        schoolYear: true,
        active: true,
        excludeFromSignup: true,
      },
    }),
  ]);

  if (!source || !target) throw new Error("Classroom not found");
  if (!target.active || target.excludeFromSignup) {
    throw new Error(`${target.name} isn't taking volunteers.`);
  }
  if (target.schoolYear !== source.schoolYear) {
    throw new Error(`${target.name} is in a different school year.`);
  }

  return { id: target.id, name: target.name };
}

/** One `volunteer_signups` row, with the columns a move carries across. */
export interface MovableVolunteerSignup {
  id: string;
  schoolId: string;
  classroomId: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: ClassroomVolunteerRole;
  partyTypes: string[] | null;
  students: StudentEntry[] | null;
  signupSource: "qr_code" | "manual";
  notes: string | null;
  createdBy: string | null;
}

export async function moveVolunteerSignupToClassroom(
  signup: MovableVolunteerSignup,
  targetClassroomId: string,
  movedBy: string
) {
  // No `capacity`: the move is the override. A waitlisted room parent lands
  // with a seat — the new room having space is usually why they're moving.
  await recordVolunteerSignup({
    schoolId: signup.schoolId,
    classroomId: targetClassroomId,
    contact: { name: signup.name, email: signup.email, phone: signup.phone },
    role: signup.role,
    partyTypes: signup.partyTypes,
    students: signup.students,
    signupSource: signup.signupSource,
    notes: signup.notes,
    createdBy: signup.createdBy ?? movedBy,
    userId: signup.userId,
  });

  await deactivateVolunteerSignup(signup, movedBy);
}

/** One `committee_signups` row, with the columns a move carries across. */
export interface MovableCommitteeSeat {
  id: string;
  schoolId: string;
  committeeId: string;
  classroomId: string | null;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  role: "chair" | "member";
  willingToChair: boolean;
  notes: string | null;
  students: StudentEntry[] | null;
  schoolYear: string;
  signupSource: "qr_code" | "manual";
  createdBy: string | null;
}

/**
 * Move one per-classroom committee seat (Meet the Masters) to another room.
 * Returns the committee's name, for the email and the toast.
 *
 * Only a committee with a `perClassroomLimit` has seats that belong to a room.
 * `recordCommitteeSignup` keys a signup on its classroom only for those, so for
 * any other committee it would find the seat being moved, call it
 * `already_active`, and the release that follows would drop the person
 * entirely.
 */
export async function moveCommitteeSeatToClassroom(
  seat: MovableCommitteeSeat,
  targetClassroomId: string,
  movedBy: string
): Promise<{ committeeName: string }> {
  const committee = await db.query.committees.findFirst({
    where: and(
      eq(committees.id, seat.committeeId),
      eq(committees.schoolId, seat.schoolId)
    ),
    columns: { name: true, perClassroomLimit: true },
  });
  if (!committee) throw new Error("Committee not found");
  if (committee.perClassroomLimit === null) {
    throw new Error(
      `${committee.name} isn't a per-classroom committee, so its spots don't belong to a room.`
    );
  }

  const result = await recordCommitteeSignup({
    schoolId: seat.schoolId,
    committeeId: seat.committeeId,
    classroomId: targetClassroomId,
    contact: { name: seat.name, email: seat.email, phone: seat.phone },
    role: seat.role,
    willingToChair: seat.willingToChair,
    notes: seat.notes,
    students: seat.students,
    schoolYear: seat.schoolYear,
    signupSource: seat.signupSource,
    createdBy: seat.createdBy ?? movedBy,
    userId: seat.userId,
    // The board is moving someone who already holds a spot: past the room's
    // cap, and whether or not the committee is still taking signups.
    bypassCapacity: true,
    allowClosed: true,
  });
  if (!result.signupId) {
    // Unreachable with both overrides set, but releasing the old seat on
    // anything else would take someone off the committee instead of moving them.
    throw new Error(`Couldn't move their ${committee.name} spot.`);
  }

  await deactivateCommitteeSignup(
    {
      id: seat.id,
      committeeId: seat.committeeId,
      userId: seat.userId,
      classroomId: seat.classroomId,
    },
    movedBy
  );

  return { committeeName: committee.name };
}

/** The committee seat columns a move needs, for callers selecting them. */
export const movableCommitteeSeatColumns = {
  id: committeeSignups.id,
  schoolId: committeeSignups.schoolId,
  committeeId: committeeSignups.committeeId,
  classroomId: committeeSignups.classroomId,
  userId: committeeSignups.userId,
  name: committeeSignups.name,
  email: committeeSignups.email,
  phone: committeeSignups.phone,
  role: committeeSignups.role,
  willingToChair: committeeSignups.willingToChair,
  notes: committeeSignups.notes,
  students: committeeSignups.students,
  schoolYear: committeeSignups.schoolYear,
  signupSource: committeeSignups.signupSource,
  createdBy: committeeSignups.createdBy,
};
