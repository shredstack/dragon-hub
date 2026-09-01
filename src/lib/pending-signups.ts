import { db } from "@/lib/db";
import {
  classrooms,
  committeeSignups,
  volunteerInterests,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  mergeStudents,
  normalizeStudents,
  type StudentEntry,
} from "@/lib/students-shared";

/**
 * The signup tables a pending member can come from. A parent is "pending" when
 * `userId IS NULL` across these tables — the email has never been claimed,
 * because `linkExistingAccountToSchool` stamps `userId` whenever a matching
 * account already exists.
 */
export type PendingSignupType =
  | "room_parent"
  | "party_volunteer"
  | "campaign"
  | "committee";

/** Human labels for each signup type. */
export const PENDING_SOURCE_LABELS: Record<PendingSignupType, string> = {
  room_parent: "Room parent",
  party_volunteer: "Party volunteer",
  campaign: "Volunteer interest",
  committee: "Committee",
};

/**
 * A classroom a pending signup put their hand up for. `classroom_members` — the
 * authorization table the member export reads for everyone else — only exists
 * once the volunteer has an account, so without this the export knew a pending
 * room parent was a room parent but not *which room*.
 */
export interface PendingClassroomAssignment {
  classroomId: string;
  role: "room_parent" | "party_volunteer";
}

/** A committee a pending signup joined, with the room they cover if any. */
export interface PendingCommitteeAssignment {
  committeeId: string;
  /** Set only for a per-classroom committee (Meet the Masters). */
  classroomId: string | null;
  role: "chair" | "member";
}

export interface PendingSignup {
  /** Lowercased email — the stable key that unifies the signup tables. */
  email: string;
  name: string | null;
  phone: string | null;
  /** The set of signup types this email raised its hand for. */
  types: Set<PendingSignupType>;
  classrooms: PendingClassroomAssignment[];
  committees: PendingCommitteeAssignment[];
  /**
   * The children this parent named on their signup form(s), merged across every
   * form they filled in. There is no account behind a pending signup, so the
   * snapshot on the row is the only copy — the `students` table needs a
   * `user_id` and has none to point at yet.
   *
   * Board-only, like every student surface. `getPendingSignups` is already
   * board-only through both its callers; keep it that way.
   */
  students: StudentEntry[];
}

/**
 * Every un-verified signup for a school + school year, grouped by lowercased
 * email. Shared by `getPendingMembers` (directory view) and the member export
 * so their query/grouping logic can't drift apart. Callers apply their own
 * output shape (labels, sorting) on top of `types`.
 */
export async function getPendingSignups(
  schoolId: string,
  schoolYear: string
): Promise<PendingSignup[]> {
  // volunteer_signups has no school_year column — it inherits the year from its
  // classroom, so we scope through the classroom join.
  const classroomSignups = await db
    .select({
      name: volunteerSignups.name,
      email: volunteerSignups.email,
      phone: volunteerSignups.phone,
      role: volunteerSignups.role,
      classroomId: volunteerSignups.classroomId,
      students: volunteerSignups.students,
    })
    .from(volunteerSignups)
    .innerJoin(classrooms, eq(volunteerSignups.classroomId, classrooms.id))
    .where(
      and(
        eq(volunteerSignups.schoolId, schoolId),
        // Waitlisted counts, exactly as it does for committees: they volunteered
        // and haven't claimed their account, which is what "pending" means.
        inArray(volunteerSignups.status, ["active", "waitlisted"]),
        isNull(volunteerSignups.userId),
        eq(classrooms.schoolYear, schoolYear)
      )
    );

  const campaignInterests = await db
    .select({
      name: volunteerInterests.name,
      email: volunteerInterests.email,
      phone: volunteerInterests.phone,
    })
    .from(volunteerInterests)
    .where(
      and(
        eq(volunteerInterests.schoolId, schoolId),
        eq(volunteerInterests.status, "active"),
        isNull(volunteerInterests.userId),
        eq(volunteerInterests.schoolYear, schoolYear)
      )
    );

  const committeeInterests = await db
    .select({
      name: committeeSignups.name,
      email: committeeSignups.email,
      phone: committeeSignups.phone,
      committeeId: committeeSignups.committeeId,
      classroomId: committeeSignups.classroomId,
      role: committeeSignups.role,
      students: committeeSignups.students,
    })
    .from(committeeSignups)
    .where(
      and(
        eq(committeeSignups.schoolId, schoolId),
        inArray(committeeSignups.status, ["active", "waitlisted"]),
        isNull(committeeSignups.userId),
        eq(committeeSignups.schoolYear, schoolYear)
      )
    );

  const byEmail = new Map<string, PendingSignup>();

  const add = (
    row: {
      name: string | null;
      email: string;
      phone: string | null;
      students?: unknown;
    },
    type: PendingSignupType
  ) => {
    const key = row.email.trim().toLowerCase();
    // Two forms, two answers: "Ava" on the room parent form and "Ava, 2nd
    // grade" on the MTM form is one child with a grade, not two children.
    const students = normalizeStudents(row.students);
    const existing = byEmail.get(key);
    if (existing) {
      existing.name = existing.name ?? row.name;
      existing.phone = existing.phone ?? row.phone;
      existing.students = mergeStudents(existing.students, students);
      existing.types.add(type);
      return existing;
    }
    const created: PendingSignup = {
      email: key,
      name: row.name,
      phone: row.phone,
      types: new Set([type]),
      classrooms: [],
      committees: [],
      students,
    };
    byEmail.set(key, created);
    return created;
  };

  for (const row of classroomSignups) {
    const entry = add(
      row,
      row.role === "room_parent" ? "room_parent" : "party_volunteer"
    );
    entry.classrooms.push({ classroomId: row.classroomId, role: row.role });
  }
  for (const row of campaignInterests) add(row, "campaign");
  for (const row of committeeInterests) {
    const entry = add(row, "committee");
    entry.committees.push({
      committeeId: row.committeeId,
      classroomId: row.classroomId,
      role: row.role,
    });
  }

  return [...byEmail.values()];
}
