import { db } from "@/lib/db";
import { schoolMemberships, volunteerHours } from "@/lib/db/schema";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";

/**
 * The fifth email→access linker, alongside the volunteer, committee, event plan
 * and teacher ones the `auth.ts` events already run.
 *
 * The board records hours for a volunteer who has no account — off the sheet
 * passed round the PTA meeting — and emails them a sign-in link. When they take
 * it, this is what makes the hours theirs: the row was already a record of their
 * work, and this points it at the account so `/volunteer-hours` shows them their
 * own history instead of an empty page.
 *
 * Matched on the email the board typed, which is stored lowercased, so a plain
 * equality is the whole lookup. Rows with no email are never claimed by anybody
 * — a name on a sheet is not a claim to an address.
 *
 * Runs on every sign-in rather than only the first, for the same reason the
 * teacher linker does: the board may enter last month's hours long after the
 * account existed.
 */
export async function linkVolunteerHoursToUser(userId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { linked: 0 };

  const claimed = await db
    .update(volunteerHours)
    .set({ userId })
    .where(
      and(
        isNull(volunteerHours.userId),
        eq(volunteerHours.volunteerEmail, normalized)
      )
    )
    .returning({ schoolId: volunteerHours.schoolId });

  if (claimed.length === 0) return { linked: 0 };

  // Hours are recorded per school, so the schools they were done at are exactly
  // the schools this person belongs to. The board typing their address into the
  // hours form is the admission — same rule as a teacher being named on a
  // classroom — which is why `admin_add` is the provenance rather than a
  // volunteer signup they never filled in.
  const schoolIds = [
    ...new Set(claimed.map((row) => row.schoolId).filter((id): id is string => !!id)),
  ];

  for (const schoolId of schoolIds) {
    const schoolYear = await getSchoolCurrentYear(schoolId);
    const existing = await db.query.schoolMemberships.findFirst({
      where: and(
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, schoolYear)
      ),
    });

    if (!existing) {
      await db.insert(schoolMemberships).values({
        userId,
        schoolId,
        role: "member",
        schoolYear,
        status: "approved",
        source: "admin_add",
        approvedAt: new Date(),
      });
    } else if (existing.status === "removed" || existing.status === "expired") {
      // Same rule as `linkExistingAccountToSchool`: `revoked` is left alone,
      // and someone coming back returns as a plain member.
      await db
        .update(schoolMemberships)
        .set({
          status: "approved",
          approvedAt: new Date(),
          ...(existing.status === "removed"
            ? { role: "member" as const, boardPosition: null }
            : {}),
        })
        .where(eq(schoolMemberships.id, existing.id));
    }
  }

  return { linked: claimed.length };
}

/**
 * Unclaimed volunteers the board has recorded hours for at this school.
 *
 * Feeds the "who did these hours belong to?" picker, so a second entry for the
 * same person off the next month's sheet attaches to the record already there
 * rather than starting a parallel one. Board-gated by its callers.
 */
export async function getUnclaimedVolunteers(schoolId: string) {
  return db
    .select({
      name: sql<string>`min(${volunteerHours.volunteerName})`,
      email: sql<string | null>`nullif(min(coalesce(${volunteerHours.volunteerEmail}, '')), '')`,
      key: sql<string>`lower(coalesce(nullif(${volunteerHours.volunteerEmail}, ''), ${volunteerHours.volunteerName}))`,
      entryCount: sql<number>`count(*)::int`,
    })
    .from(volunteerHours)
    .where(
      and(
        eq(volunteerHours.schoolId, schoolId),
        isNull(volunteerHours.userId),
        // The identity CHECK guarantees a name where there's no account, but a
        // blank string would still slip past it and make a nameless suggestion.
        ne(volunteerHours.volunteerName, "")
      )
    )
    .groupBy(
      sql`lower(coalesce(nullif(${volunteerHours.volunteerEmail}, ''), ${volunteerHours.volunteerName}))`
    );
}
