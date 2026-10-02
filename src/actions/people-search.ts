"use server";

import { and, asc, eq, ilike, or } from "drizzle-orm";
import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { schoolMemberships, users } from "@/lib/db/schema";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getPendingSignups } from "@/lib/pending-signups";
import type { PersonOption } from "@/lib/person-option";

const MAX_RESULTS = 10;

/** `%` and `_` typed into the box are literal characters, not wildcards. */
function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Find someone the board can add to a room or a committee without retyping
 * them: this year's approved members, then people who signed up but never
 * confirmed their email — the same two populations `/admin/members` lists, so
 * anyone the board can see in the directory can be picked here.
 *
 * Board only. It returns contact details for the whole school, so it sits
 * behind the same gate as the directory itself. Student names are deliberately
 * not part of the result — a picker has no reason to carry them.
 */
export async function searchSchoolPeople(query: string): Promise<PersonOption[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const q = query.trim();
  if (q.length < 2) return [];
  const schoolYear = await getSchoolCurrentYear(schoolId);
  const pattern = likePattern(q);

  const members = await db
    .select({
      userId: users.id,
      membershipId: schoolMemberships.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: schoolMemberships.role,
      boardPosition: schoolMemberships.boardPosition,
    })
    .from(schoolMemberships)
    .innerJoin(users, eq(schoolMemberships.userId, users.id))
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.schoolYear, schoolYear),
        eq(schoolMemberships.status, "approved"),
        or(ilike(users.name, pattern), ilike(users.email, pattern))
      )
    )
    .orderBy(asc(users.name), asc(users.email))
    .limit(MAX_RESULTS);

  const results: PersonOption[] = members.map((m) => ({
    ...m,
    pending: false,
  }));
  if (results.length >= MAX_RESULTS) return results;

  // No account behind these, so there is no row to ILIKE against — the signup
  // tables are grouped by email in JS. Small: it is one school's unclaimed
  // signups for one year.
  const seen = new Set(results.map((r) => r.email.toLowerCase()));
  const needle = q.toLowerCase();
  const pending = await getPendingSignups(schoolId, schoolYear);
  for (const p of pending) {
    if (results.length >= MAX_RESULTS) break;
    if (seen.has(p.email)) continue;
    if (
      !p.email.includes(needle) &&
      !(p.name ?? "").toLowerCase().includes(needle)
    ) {
      continue;
    }
    results.push({
      userId: null,
      membershipId: null,
      name: p.name,
      email: p.email,
      phone: p.phone,
      role: null,
      boardPosition: null,
      pending: true,
    });
  }
  return results;
}
