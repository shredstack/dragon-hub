"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import {
  buildMemberExport,
  buildMemberExportOptions,
} from "@/lib/member-export-data";
import type {
  MemberExportFilters,
  MemberExportOptions,
  MemberExportResult,
} from "@/lib/member-export";

/** The school the caller is exporting, once they've proved they may. */
async function assertExportingBoardMember(): Promise<string> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);
  return schoolId;
}

/**
 * Grade options, committees, campaign events and year context for the export
 * dialog. Reports whether the school has any classrooms for its current year so
 * the dialog can explain an empty classroom-based export instead of just
 * shrugging at it.
 */
export async function getMemberExportOptions(): Promise<MemberExportOptions> {
  return buildMemberExportOptions(await assertExportingBoardMember());
}

/**
 * Build a member export for the current school. PTA board only — this returns
 * contact details for every matching member. See `@/lib/member-export-data`
 * for what it computes and `@/lib/member-export` for the two shapes it comes in.
 */
export async function exportMembers(
  filters: MemberExportFilters
): Promise<MemberExportResult> {
  return buildMemberExport(await assertExportingBoardMember(), filters);
}
