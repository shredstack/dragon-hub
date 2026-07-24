import { db } from "@/lib/db";
import {
  classrooms,
  committeeSignups,
  volunteerInterests,
  volunteerSignups,
} from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

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

export interface PendingSignup {
  /** Lowercased email — the stable key that unifies the signup tables. */
  email: string;
  name: string | null;
  phone: string | null;
  /** The set of signup types this email raised its hand for. */
  types: Set<PendingSignupType>;
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
    row: { name: string | null; email: string; phone: string | null },
    type: PendingSignupType
  ) => {
    const key = row.email.trim().toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      existing.name = existing.name ?? row.name;
      existing.phone = existing.phone ?? row.phone;
      existing.types.add(type);
      return;
    }
    byEmail.set(key, {
      email: key,
      name: row.name,
      phone: row.phone,
      types: new Set([type]),
    });
  };

  for (const row of classroomSignups) {
    add(row, row.role === "room_parent" ? "room_parent" : "party_volunteer");
  }
  for (const row of campaignInterests) add(row, "campaign");
  for (const row of committeeInterests) add(row, "committee");

  return [...byEmail.values()];
}
