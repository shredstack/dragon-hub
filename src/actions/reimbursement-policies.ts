"use server";

import { assertAuthenticated, assertSuperAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { districts, reimbursementPolicies } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { DEFAULT_REIMBURSEMENT_POLICY } from "@/lib/reimbursement-policy";

/**
 * Super-admin management of the state and district reimbursement rules, in the
 * same shape as the regional onboarding resources: rows nobody at a school can
 * edit, inherited by every school in that state or district.
 *
 * The district half resolves by *name within a state* rather than asking the
 * caller for a uuid, because that is how `schools.district` records one and how
 * `DistrictSelect` reports one. A district name that matches no NCES reference
 * row is refused rather than stored — a policy filed under a district that
 * cannot be resolved would silently never apply to anyone.
 */

export interface ReimbursementPolicyInput {
  approverRoles: string[];
  requiresMinutesApproval: boolean;
  salesTaxRefundTracking: boolean;
  taxGuidanceNote?: string | null;
  submissionWindowDays: number;
  spendingCardsEnabled: boolean;
}

export interface ReimbursementPolicyRow extends ReimbursementPolicyInput {
  id: string;
  state: string | null;
  districtId: string | null;
  districtName: string | null;
  districtState: string | null;
}

export async function getAllReimbursementPolicies(): Promise<
  ReimbursementPolicyRow[]
> {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const rows = await db
    .select({
      policy: reimbursementPolicies,
      districtName: districts.name,
      districtState: districts.stateName,
    })
    .from(reimbursementPolicies)
    .leftJoin(districts, eq(reimbursementPolicies.districtId, districts.id))
    .orderBy(asc(reimbursementPolicies.state), asc(districts.name));

  return rows.map((row) => ({
    id: row.policy.id,
    state: row.policy.state,
    districtId: row.policy.districtId,
    districtName: row.districtName,
    districtState: row.districtState,
    approverRoles: row.policy.approverRoles,
    requiresMinutesApproval: row.policy.requiresMinutesApproval,
    salesTaxRefundTracking: row.policy.salesTaxRefundTracking,
    taxGuidanceNote: row.policy.taxGuidanceNote,
    submissionWindowDays: row.policy.submissionWindowDays,
    spendingCardsEnabled: row.policy.spendingCardsEnabled,
  }));
}

/** The national default, so the super-admin screen can show what it overrides. */
export async function getDefaultReimbursementPolicy() {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);
  return DEFAULT_REIMBURSEMENT_POLICY;
}

export async function createReimbursementPolicy(data: {
  /** The state this applies to, or the state the district sits in. */
  state: string;
  /** Set for a district-level policy; omit for a state-level one. */
  district?: string | null;
  policy: ReimbursementPolicyInput;
}): Promise<{ id: string }> {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  const values = await resolveScope(data.state, data.district);
  const [created] = await db
    .insert(reimbursementPolicies)
    .values({ ...values, ...normalize(data.policy) })
    .returning({ id: reimbursementPolicies.id });

  revalidatePath("/super-admin/reimbursement-policies");
  return { id: created.id };
}

export async function updateReimbursementPolicy(
  id: string,
  policy: ReimbursementPolicyInput
): Promise<void> {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  await db
    .update(reimbursementPolicies)
    .set({ ...normalize(policy), updatedAt: new Date() })
    .where(eq(reimbursementPolicies.id, id));

  revalidatePath("/super-admin/reimbursement-policies");
}

/**
 * Delete a policy row.
 *
 * Safe in a way most deletions here are not: every school under it falls back
 * to the next level up (district → state → the national default), so nothing
 * is left without rules. Requests already submitted keep the approver roles
 * snapshotted onto them, so no approval in flight is affected either.
 */
export async function deleteReimbursementPolicy(id: string): Promise<void> {
  const user = await assertAuthenticated();
  await assertSuperAdmin(user.id!);

  await db
    .delete(reimbursementPolicies)
    .where(eq(reimbursementPolicies.id, id));

  revalidatePath("/super-admin/reimbursement-policies");
}

/** Exactly one of state / districtId, matching the table's check constraint. */
async function resolveScope(
  state: string,
  district?: string | null
): Promise<{ state: string | null; districtId: string | null }> {
  const stateName = state.trim();
  if (!stateName) throw new Error("Pick a state.");

  const districtName = district?.trim();
  if (!districtName) return { state: stateName, districtId: null };

  const row = await db.query.districts.findFirst({
    where: and(
      eq(districts.stateName, stateName),
      eq(districts.name, districtName)
    ),
    columns: { id: true },
  });
  if (!row) {
    throw new Error(
      `"${districtName}" isn't in the district reference list for ${stateName}. A policy filed under a district we can't resolve would never reach a school.`
    );
  }

  return { state: null, districtId: row.id };
}

function normalize(policy: ReimbursementPolicyInput): ReimbursementPolicyInput {
  const approverRoles = policy.approverRoles
    .map((slug) => slug.trim())
    .filter(Boolean);
  if (approverRoles.length === 0) {
    // A request nobody has to sign would approve itself the moment it was
    // submitted, which removes the one control this whole feature exists for.
    throw new Error("A policy needs at least one approver role.");
  }

  return {
    approverRoles: [...new Set(approverRoles)],
    requiresMinutesApproval: policy.requiresMinutesApproval,
    salesTaxRefundTracking: policy.salesTaxRefundTracking,
    taxGuidanceNote: policy.taxGuidanceNote?.trim() || null,
    submissionWindowDays:
      Number.isFinite(policy.submissionWindowDays) &&
      policy.submissionWindowDays > 0
        ? Math.floor(policy.submissionWindowDays)
        : DEFAULT_REIMBURSEMENT_POLICY.submissionWindowDays,
    spendingCardsEnabled: policy.spendingCardsEnabled,
  };
}
