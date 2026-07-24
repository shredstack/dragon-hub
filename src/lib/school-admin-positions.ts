import { db } from "@/lib/db";
import { schoolAdminPositions } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import {
  STANDARD_SCHOOL_ADMIN_POSITIONS,
  fallbackAdminPositionLabel,
} from "@/lib/school-admin-positions-shared";
import type {
  SchoolAdminPosition,
  SchoolAdminPositionLabels,
} from "@/lib/school-admin-positions-shared";

export type { SchoolAdminPosition, SchoolAdminPositionLabels };

/**
 * Every school admin position a school has defined, in display order.
 *
 * `includeInactive` is for the management screen and for resolving labels on
 * existing memberships — someone still filed as "Office Manager" after the
 * school retired that position must keep rendering with its real name.
 */
export async function getSchoolAdminPositions(
  schoolId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {}
): Promise<SchoolAdminPosition[]> {
  return db
    .select({
      id: schoolAdminPositions.id,
      slug: schoolAdminPositions.slug,
      label: schoolAdminPositions.label,
      description: schoolAdminPositions.description,
      sortOrder: schoolAdminPositions.sortOrder,
      active: schoolAdminPositions.active,
      isStandard: schoolAdminPositions.isStandard,
    })
    .from(schoolAdminPositions)
    .where(
      includeInactive
        ? eq(schoolAdminPositions.schoolId, schoolId)
        : and(
            eq(schoolAdminPositions.schoolId, schoolId),
            eq(schoolAdminPositions.active, true)
          )
    )
    .orderBy(asc(schoolAdminPositions.sortOrder), asc(schoolAdminPositions.label));
}

/**
 * slug → label map for a school, including inactive positions so that stored
 * slugs always resolve.
 */
export async function getSchoolAdminPositionLabels(
  schoolId: string
): Promise<SchoolAdminPositionLabels> {
  const positions = await getSchoolAdminPositions(schoolId, {
    includeInactive: true,
  });
  return Object.fromEntries(positions.map((p) => [p.slug, p.label]));
}

/** Resolve one slug to its label without loading the whole map. */
export async function getSchoolAdminPositionLabel(
  schoolId: string,
  slug: string | null | undefined
): Promise<string | undefined> {
  if (!slug) return undefined;
  const row = await db.query.schoolAdminPositions.findFirst({
    where: and(
      eq(schoolAdminPositions.schoolId, schoolId),
      eq(schoolAdminPositions.slug, slug)
    ),
    columns: { label: true },
  });
  return row?.label ?? fallbackAdminPositionLabel(slug);
}

/**
 * Give a school the standard slate. Idempotent — existing rows are left alone,
 * so a school that renamed "Office Secretary" keeps its name.
 */
export async function seedStandardSchoolAdminPositions(
  schoolId: string
): Promise<void> {
  await db
    .insert(schoolAdminPositions)
    .values(
      STANDARD_SCHOOL_ADMIN_POSITIONS.map((p, index) => ({
        schoolId,
        slug: p.slug,
        label: p.label,
        description: p.description,
        sortOrder: index,
        isStandard: true,
      }))
    )
    .onConflictDoNothing();
}

/**
 * Positions for a school, seeding the standard slate first if the school has
 * none. Use on read paths where an empty picker would be a dead end.
 */
export async function getSchoolAdminPositionsWithSeed(
  schoolId: string,
  options: { includeInactive?: boolean } = {}
): Promise<SchoolAdminPosition[]> {
  const positions = await getSchoolAdminPositions(schoolId, options);
  if (positions.length > 0) return positions;

  await seedStandardSchoolAdminPositions(schoolId);
  return getSchoolAdminPositions(schoolId, options);
}
