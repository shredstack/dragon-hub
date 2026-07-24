import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getCurrentSchoolId,
  getCurrentUser,
  isPtaBoardMember,
  isSuperAdmin,
} from "@/lib/auth-helpers";

/**
 * Areas a school can switch off for general members. Not every school runs its
 * budget or fundraisers through DragonHub, and a stale page is worse than no
 * page — so leadership can keep these to themselves without losing the data.
 */
export const HIDEABLE_MODULES = ["budget", "fundraisers"] as const;

export type HideableModule = (typeof HIDEABLE_MODULES)[number];

/** Per-module override. Absent key means visible to everyone. */
export type ModuleVisibility = Partial<Record<HideableModule, boolean>>;

export async function getModuleVisibility(
  schoolId: string | null | undefined
): Promise<ModuleVisibility> {
  if (!schoolId) return {};

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { moduleVisibility: true },
  });

  return school?.moduleVisibility ?? {};
}

/** Members see a module unless the school has explicitly turned it off. */
export function isModuleVisibleToMembers(
  visibility: ModuleVisibility,
  moduleKey: HideableModule
): boolean {
  return visibility[moduleKey] !== false;
}

/**
 * Whether this user can reach a module: either the school leaves it open to
 * members, or they're leadership, who need it to keep the data up to date.
 */
export async function canViewModule(
  userId: string,
  schoolId: string | null | undefined,
  moduleKey: HideableModule,
  visibility?: ModuleVisibility
): Promise<boolean> {
  const resolved = visibility ?? (await getModuleVisibility(schoolId));
  if (isModuleVisibleToMembers(resolved, moduleKey)) return true;
  if (!schoolId) return await isSuperAdmin(userId);
  return await isPtaBoardMember(userId, schoolId);
}

/**
 * Page-level guard. Hiding the nav link alone would still leave the route
 * reachable by anyone who bookmarked it, so every hideable page calls this.
 */
export async function canCurrentUserViewModule(
  moduleKey: HideableModule
): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user?.id) return false;
  return await canViewModule(user.id, await getCurrentSchoolId(), moduleKey);
}
