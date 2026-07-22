import { db } from "@/lib/db";
import { eventPlanMembers, schoolMemberships } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { EventPlanLeadType } from "@/types";

/**
 * Deciding which kind of lead someone is.
 *
 * A PTA has two, and they are not interchangeable: the board member who owns
 * the event on the board's behalf, and the committee chair who runs it. Every
 * path that makes someone a lead has to say which, because the year-planning
 * screen reads a plan's ownership off `lead_type` — a lead with none reads as
 * an unowned event, and the board goes looking for a volunteer it already has.
 *
 * Lives here rather than in `src/actions/` because `acceptEventPlanInvite` runs
 * from NextAuth events, which can't import a "use server" module.
 */

/** True when this person sits on the board for the given school year. */
async function isOnBoard(userId: string, schoolId: string, schoolYear: string) {
  const membership = await db.query.schoolMemberships.findFirst({
    where: and(
      eq(schoolMemberships.userId, userId),
      eq(schoolMemberships.schoolId, schoolId),
      eq(schoolMemberships.schoolYear, schoolYear),
      eq(schoolMemberships.status, "approved"),
      eq(schoolMemberships.role, "pta_board")
    ),
    columns: { id: true },
  });
  return !!membership;
}

/** True when some other row already holds this plan's board lead. */
async function planHasBoardLead(eventPlanId: string) {
  const existing = await db.query.eventPlanMembers.findFirst({
    where: and(
      eq(eventPlanMembers.eventPlanId, eventPlanId),
      eq(eventPlanMembers.leadType, "board")
    ),
    columns: { id: true },
  });
  return !!existing;
}

/**
 * The lead type for someone becoming a lead of a plan that already exists.
 *
 * Two rules, in this order:
 *
 * 1. Off the board, no board lead. Guessing "board" for a parent would put them
 *    on the board's workload report, which is the one number the year-planning
 *    screen exists to show.
 * 2. One board lead per plan. A second isn't shown as a co-lead — since
 *    `getYearAssignments` takes the first "board" row it finds, the other one
 *    vanishes from the assignment screen entirely and off its holder's event
 *    count. A board member joining a plan that already has a board lead is
 *    recorded as a chair, which is the arrangement they're actually in.
 *
 * `preferred` is what the caller asked for, where anything asked. It can only
 * ever narrow the answer to "committee chair": asking for a board lead doesn't
 * excuse either rule, since an invitation issued in August and accepted in
 * October may name someone who has since left the board, or a board lead the
 * plan has since filled.
 */
export async function resolveLeadType(opts: {
  eventPlanId: string;
  /** Null for a chair recorded by name before they have an account. */
  userId: string | null;
  schoolId: string;
  schoolYear: string;
  preferred?: EventPlanLeadType | null;
}): Promise<EventPlanLeadType> {
  const { eventPlanId, userId, schoolId, schoolYear, preferred } = opts;

  if (preferred === "committee_chair") return preferred;

  // No account means no board membership to check, so a placeholder can only
  // be a chair.
  if (!userId) return "committee_chair";

  if (!(await isOnBoard(userId, schoolId, schoolYear))) return "committee_chair";

  return (await planHasBoardLead(eventPlanId)) ? "committee_chair" : "board";
}

/**
 * The same decision for a plan being created, which has no members yet and so
 * no board lead to collide with — one query instead of three.
 */
export async function initialLeadType(
  userId: string,
  schoolId: string,
  schoolYear: string
): Promise<EventPlanLeadType> {
  return (await isOnBoard(userId, schoolId, schoolYear))
    ? "board"
    : "committee_chair";
}
