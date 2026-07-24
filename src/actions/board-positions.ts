"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  boardPositions,
  schoolMemberships,
  boardHandoffNotes,
  onboardingGuides,
  onboardingResources,
  onboardingChecklistItems,
} from "@/lib/db/schema";
import { eq, and, sql, asc, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  slugifyPositionLabel,
  STANDARD_BOARD_POSITION_SLUGS,
} from "@/lib/board-positions-shared";
import {
  getBoardPositionsWithSeed,
  seedStandardBoardPositions,
  type BoardPosition,
} from "@/lib/board-positions";

/** Pages that render a position label or picker and must refresh after edits. */
function revalidatePositionPages() {
  revalidatePath("/admin/board/positions");
  revalidatePath("/admin/board");
  revalidatePath("/admin/members");
  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
}

async function assertBoardAccess() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
  return { user, schoolId };
}

export type BoardPositionWithUsage = BoardPosition & {
  /** People currently holding this position, across all school years. */
  memberCount: number;
  /** Whether any record (notes, guides, resources) is filed under this slug. */
  inUse: boolean;
};

/**
 * Admin list: every position including inactive ones, annotated with whether
 * anything references it. The UI uses `inUse` to steer destructive edits toward
 * deactivating instead of deleting.
 */
export async function listBoardPositions(): Promise<BoardPositionWithUsage[]> {
  const { schoolId } = await assertBoardAccess();

  const positions = await getBoardPositionsWithSeed(schoolId, {
    includeInactive: true,
  });

  const [members, notes, guides, resources, checklist] = await Promise.all([
    db
      .select({
        position: schoolMemberships.boardPosition,
        n: count(),
      })
      .from(schoolMemberships)
      .where(eq(schoolMemberships.schoolId, schoolId))
      .groupBy(schoolMemberships.boardPosition),
    db
      .selectDistinct({ position: boardHandoffNotes.position })
      .from(boardHandoffNotes)
      .where(eq(boardHandoffNotes.schoolId, schoolId)),
    db
      .selectDistinct({ position: onboardingGuides.position })
      .from(onboardingGuides)
      .where(eq(onboardingGuides.schoolId, schoolId)),
    db
      .selectDistinct({ position: onboardingResources.position })
      .from(onboardingResources)
      .where(eq(onboardingResources.schoolId, schoolId)),
    db
      .selectDistinct({ position: onboardingChecklistItems.position })
      .from(onboardingChecklistItems)
      .where(eq(onboardingChecklistItems.schoolId, schoolId)),
  ]);

  const memberCounts = new Map(
    members.filter((m) => m.position).map((m) => [m.position as string, m.n])
  );
  const referenced = new Set(
    [...notes, ...guides, ...resources, ...checklist]
      .map((r) => r.position)
      .filter((p): p is string => Boolean(p))
  );

  return positions.map((p) => ({
    ...p,
    memberCount: memberCounts.get(p.slug) ?? 0,
    inUse: referenced.has(p.slug) || (memberCounts.get(p.slug) ?? 0) > 0,
  }));
}

/**
 * Add a position this school runs that isn't on the standard slate — a teacher
 * representative, a hospitality chair.
 *
 * The slug is derived from the label once, at creation, and then frozen: it is
 * the value stored on every record filed under this position, so changing it
 * later would orphan them. Renaming the position edits the label only.
 */
export async function createBoardPosition(data: {
  label: string;
  description?: string;
}) {
  const { schoolId } = await assertBoardAccess();

  const label = data.label.trim();
  if (!label) throw new Error("Position name is required");

  const baseSlug = slugifyPositionLabel(label);
  if (!baseSlug) {
    throw new Error("Position name must contain at least one letter or number");
  }

  const existing = await db
    .select({ slug: boardPositions.slug })
    .from(boardPositions)
    .where(eq(boardPositions.schoolId, schoolId));
  const taken = new Set(existing.map((p) => p.slug));

  // A school adding "Teacher Rep" twice gets teacher_rep and teacher_rep_2
  // rather than a unique-constraint error.
  let slug = baseSlug;
  let suffix = 2;
  while (taken.has(slug)) {
    slug = `${baseSlug}_${suffix++}`;
  }

  const [maxOrder] = await db
    .select({ max: sql<number>`coalesce(max(${boardPositions.sortOrder}), -1)` })
    .from(boardPositions)
    .where(eq(boardPositions.schoolId, schoolId));

  const [position] = await db
    .insert(boardPositions)
    .values({
      schoolId,
      slug,
      label,
      description: data.description?.trim() || null,
      sortOrder: (maxOrder?.max ?? -1) + 1,
      isStandard: false,
    })
    .returning();

  revalidatePositionPages();
  return position;
}

/**
 * Rename a position or edit its description. The slug is intentionally not
 * editable — see createBoardPosition.
 */
export async function updateBoardPositionDetails(
  id: string,
  data: { label?: string; description?: string | null; active?: boolean }
) {
  const { schoolId } = await assertBoardAccess();

  const updates: {
    label?: string;
    description?: string | null;
    active?: boolean;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (data.label !== undefined) {
    const label = data.label.trim();
    if (!label) throw new Error("Position name is required");
    updates.label = label;
  }
  if (data.description !== undefined) {
    updates.description = data.description?.trim() || null;
  }
  if (data.active !== undefined) {
    updates.active = data.active;
  }

  const [updated] = await db
    .update(boardPositions)
    .set(updates)
    .where(
      and(eq(boardPositions.id, id), eq(boardPositions.schoolId, schoolId))
    )
    .returning();

  if (!updated) throw new Error("Position not found");

  revalidatePositionPages();
  return updated;
}

/**
 * Retire a position without touching the records filed under it. This is the
 * right move in almost every case: the slug keeps resolving to a real label on
 * old handoff notes and guides, it just stops appearing in pickers.
 */
export async function setBoardPositionActive(id: string, active: boolean) {
  return updateBoardPositionDetails(id, { active });
}

/**
 * Delete a position outright. Only allowed for school-added positions that
 * nothing references — standard-slate positions stay because state and district
 * onboarding resources are filed against their slugs.
 */
export async function deleteBoardPosition(id: string) {
  const { schoolId } = await assertBoardAccess();

  const position = await db.query.boardPositions.findFirst({
    where: and(
      eq(boardPositions.id, id),
      eq(boardPositions.schoolId, schoolId)
    ),
  });
  if (!position) throw new Error("Position not found");

  if (position.isStandard || STANDARD_BOARD_POSITION_SLUGS.has(position.slug)) {
    throw new Error(
      "Standard PTA positions can't be deleted. Deactivate it instead so past records keep their labels."
    );
  }

  const usage = await listBoardPositions();
  const thisPosition = usage.find((p) => p.id === id);
  if (thisPosition?.inUse) {
    throw new Error(
      "This position is still assigned or referenced by existing records. Deactivate it instead."
    );
  }

  await db
    .delete(boardPositions)
    .where(
      and(eq(boardPositions.id, id), eq(boardPositions.schoolId, schoolId))
    );

  revalidatePositionPages();
  return { success: true };
}

/** Persist a drag-reordered list. Order drives every picker and the roster. */
export async function reorderBoardPositions(orderedIds: string[]) {
  const { schoolId } = await assertBoardAccess();

  await Promise.all(
    orderedIds.map((id, index) =>
      db
        .update(boardPositions)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(
          and(eq(boardPositions.id, id), eq(boardPositions.schoolId, schoolId))
        )
    )
  );

  revalidatePositionPages();
  return { success: true };
}

/**
 * Restore any standard positions a school deleted before this table existed,
 * or that were never seeded. Safe to run repeatedly.
 */
export async function restoreStandardBoardPositions() {
  const { schoolId } = await assertBoardAccess();

  await seedStandardBoardPositions(schoolId);

  revalidatePositionPages();

  return db
    .select()
    .from(boardPositions)
    .where(eq(boardPositions.schoolId, schoolId))
    .orderBy(asc(boardPositions.sortOrder));
}
