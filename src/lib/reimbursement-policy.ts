import { cache } from "react";
import { db } from "@/lib/db";
import { districts, reimbursementPolicies, schools } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { ReimbursementPolicy } from "@/lib/reimbursements-shared";

/**
 * Which reimbursement rules a school runs under.
 *
 * The same district → state → default hierarchy as the onboarding resources:
 * super admins configure a row per state (and, where a district differs, per
 * district), and a school inherits whichever is most specific. A school in a
 * state nobody has configured is not broken — it gets the national default
 * below, which is the safe reading of the IRS and National PTA baseline that
 * every state we researched builds on.
 *
 * Resolution goes through the school's own `state` / `district` text, because
 * that is what `schools` actually stores; the policy row's `district_id` is a
 * real FK into the `districts` reference table, so the join is by name within
 * the state. A school whose district text matches no reference row simply falls
 * through to its state's policy, which is the right answer rather than an error.
 */

/**
 * What a PTA gets before anyone configures anything: two officer signatures on
 * the request, no minutes requirement, no state tax-refund mechanism, the IRS
 * 60-day substantiation window, and no spending cards.
 *
 * Deliberately the *most conservative* reading — every state we looked at
 * requires at least this much, so inheriting it can only ever be stricter than
 * the local rule, never looser.
 */
export const DEFAULT_REIMBURSEMENT_POLICY: ReimbursementPolicy = {
  approverRoles: ["treasurer", "president"],
  requiresMinutesApproval: false,
  salesTaxRefundTracking: false,
  taxGuidanceNote: null,
  submissionWindowDays: 60,
  spendingCardsEnabled: false,
  source: "default",
};

/**
 * The policy in force at a school.
 *
 * Cached per request like `getSchoolAccess`: a single render of the officer
 * queue asks for it once per request row, and the answer cannot change
 * mid-render.
 */
export const getReimbursementPolicy = cache(
  async function getReimbursementPolicy(
    schoolId: string
  ): Promise<ReimbursementPolicy> {
    const school = await db.query.schools.findFirst({
      where: eq(schools.id, schoolId),
      columns: { state: true, district: true },
    });
    if (!school?.state) return DEFAULT_REIMBURSEMENT_POLICY;

    // A district row wins over its state's, so look for one first — but only
    // when the school named a district we can resolve to a reference row.
    if (school.district) {
      const district = await db.query.districts.findFirst({
        where: and(
          eq(districts.stateName, school.state),
          eq(districts.name, school.district)
        ),
        columns: { id: true },
      });

      if (district) {
        const row = await db.query.reimbursementPolicies.findFirst({
          where: eq(reimbursementPolicies.districtId, district.id),
        });
        if (row) return toPolicy(row, "district");
      }
    }

    const stateRow = await db.query.reimbursementPolicies.findFirst({
      where: eq(reimbursementPolicies.state, school.state),
    });
    if (stateRow) return toPolicy(stateRow, "state");

    return DEFAULT_REIMBURSEMENT_POLICY;
  }
);

/**
 * A stored row as a resolved policy.
 *
 * `approverRoles` falls back to the default when a row somehow stores an empty
 * array: a request nobody is required to sign would auto-approve itself the
 * moment it was submitted, which is the one failure mode here that loses the
 * control the whole feature exists to provide.
 */
function toPolicy(
  row: typeof reimbursementPolicies.$inferSelect,
  source: "district" | "state"
): ReimbursementPolicy {
  return {
    approverRoles: row.approverRoles?.length
      ? row.approverRoles
      : DEFAULT_REIMBURSEMENT_POLICY.approverRoles,
    requiresMinutesApproval: row.requiresMinutesApproval,
    salesTaxRefundTracking: row.salesTaxRefundTracking,
    taxGuidanceNote: row.taxGuidanceNote,
    submissionWindowDays: row.submissionWindowDays,
    spendingCardsEnabled: row.spendingCardsEnabled,
    source,
  };
}
