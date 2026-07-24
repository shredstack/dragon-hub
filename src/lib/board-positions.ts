import { db } from "@/lib/db";
import { boardPositions } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import {
  STANDARD_BOARD_POSITIONS,
  fallbackPositionLabel,
} from "@/lib/board-positions-shared";
import type {
  BoardPosition,
  BoardPositionLabels,
} from "@/lib/board-positions-shared";

export type { BoardPosition, BoardPositionLabels };

/**
 * Every position a school has defined, in display order.
 *
 * `includeInactive` is for admin screens and for resolving labels on
 * historical data — a handoff note filed under a since-retired position still
 * needs to render with its real name. Pickers should stick to the default.
 */
export async function getBoardPositions(
  schoolId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {}
): Promise<BoardPosition[]> {
  const rows = await db
    .select({
      id: boardPositions.id,
      slug: boardPositions.slug,
      label: boardPositions.label,
      description: boardPositions.description,
      sortOrder: boardPositions.sortOrder,
      active: boardPositions.active,
      isStandard: boardPositions.isStandard,
    })
    .from(boardPositions)
    .where(
      includeInactive
        ? eq(boardPositions.schoolId, schoolId)
        : and(
            eq(boardPositions.schoolId, schoolId),
            eq(boardPositions.active, true)
          )
    )
    .orderBy(asc(boardPositions.sortOrder), asc(boardPositions.label));

  return rows;
}

/**
 * slug → label map for a school, including inactive positions so that stored
 * slugs on old records always resolve. This is what server components pass
 * down to client components in place of the old static constant.
 */
export async function getBoardPositionLabels(
  schoolId: string
): Promise<BoardPositionLabels> {
  const positions = await getBoardPositions(schoolId, { includeInactive: true });
  return Object.fromEntries(positions.map((p) => [p.slug, p.label]));
}

/** Resolve one slug to its label for a school, without loading the whole map. */
export async function getBoardPositionLabel(
  schoolId: string,
  slug: string | null | undefined
): Promise<string | undefined> {
  if (!slug) return undefined;
  const row = await db.query.boardPositions.findFirst({
    where: and(
      eq(boardPositions.schoolId, schoolId),
      eq(boardPositions.slug, slug)
    ),
    columns: { label: true },
  });
  return row?.label ?? fallbackPositionLabel(slug);
}

/** The description a school wrote for a position, used by AI guide generation. */
export async function getBoardPositionDescription(
  schoolId: string,
  slug: string
): Promise<string | null> {
  const row = await db.query.boardPositions.findFirst({
    where: and(
      eq(boardPositions.schoolId, schoolId),
      eq(boardPositions.slug, slug)
    ),
    columns: { description: true },
  });
  return row?.description ?? null;
}

/**
 * Give a school the standard slate. Called when a school is created, and
 * idempotently on read paths for schools that predate this table (the
 * migration backfills existing schools, so this is belt-and-braces).
 *
 * Existing rows are left alone — a school that renamed "Treasurer" keeps its
 * name.
 */
export async function seedStandardBoardPositions(
  schoolId: string
): Promise<void> {
  await db
    .insert(boardPositions)
    .values(
      STANDARD_BOARD_POSITIONS.map((p, index) => ({
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
 * none at all. Use on user-facing read paths where an empty picker would be a
 * dead end.
 */
export async function getBoardPositionsWithSeed(
  schoolId: string,
  options: { includeInactive?: boolean } = {}
): Promise<BoardPosition[]> {
  const positions = await getBoardPositions(schoolId, options);
  if (positions.length > 0) return positions;

  await seedStandardBoardPositions(schoolId);
  return getBoardPositions(schoolId, options);
}
