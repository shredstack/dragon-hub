"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertSchoolPtaBoardOrAdmin,
  getSchoolMembership,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { onboardingChecklistItems, onboardingProgress } from "@/lib/db/schema";
import { eq, and, or, isNull, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";
import type { PtaBoardPosition, OnboardingChecklistItemWithProgress } from "@/types";

/**
 * Get checklist items for a position with user's progress
 */
export async function getChecklistWithProgress(
  position?: PtaBoardPosition
): Promise<OnboardingChecklistItemWithProgress[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const baseConditions = [
    eq(onboardingChecklistItems.schoolId, schoolId),
    eq(onboardingChecklistItems.active, true),
  ];

  // Get checklist items for this position OR general items (null position)
  let items;
  if (position) {
    items = await db.query.onboardingChecklistItems.findMany({
      where: and(
        ...baseConditions,
        or(
          eq(onboardingChecklistItems.position, position),
          isNull(onboardingChecklistItems.position)
        )
      ),
      orderBy: [asc(onboardingChecklistItems.sortOrder)],
    });
  } else {
    items = await db.query.onboardingChecklistItems.findMany({
      where: and(...baseConditions, isNull(onboardingChecklistItems.position)),
      orderBy: [asc(onboardingChecklistItems.sortOrder)],
    });
  }

  // Get user's progress for current school year
  const progress = await db.query.onboardingProgress.findMany({
    where: and(
      eq(onboardingProgress.userId, user.id!),
      eq(onboardingProgress.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  const progressMap = new Map(progress.map((p) => [p.checklistItemId, p]));

  return items.map((item) => ({
    ...item,
    completed: progressMap.has(item.id),
    completedAt: progressMap.get(item.id)?.completedAt ?? null,
  }));
}

/**
 * Toggle a checklist item completion (complete or uncomplete)
 */
export async function toggleChecklistItem(itemId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Verify the checklist item belongs to this school
  const item = await db.query.onboardingChecklistItems.findFirst({
    where: and(
      eq(onboardingChecklistItems.id, itemId),
      eq(onboardingChecklistItems.schoolId, schoolId)
    ),
  });

  if (!item) {
    throw new Error("Checklist item not found");
  }

  // Check if already completed
  const existing = await db.query.onboardingProgress.findFirst({
    where: and(
      eq(onboardingProgress.userId, user.id!),
      eq(onboardingProgress.checklistItemId, itemId),
      eq(onboardingProgress.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  if (existing) {
    // Uncomplete - remove the progress record
    await db
      .delete(onboardingProgress)
      .where(eq(onboardingProgress.id, existing.id));
    revalidatePath("/onboarding");
    return { completed: false };
  } else {
    // Complete - add a progress record
    await db.insert(onboardingProgress).values({
      schoolId,
      userId: user.id!,
      checklistItemId: itemId,
      schoolYear: CURRENT_SCHOOL_YEAR,
    });
    revalidatePath("/onboarding");
    return { completed: true };
  }
}

/**
 * Get all checklist items for admin management
 */
export async function getAllChecklistItems() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  return db.query.onboardingChecklistItems.findMany({
    where: eq(onboardingChecklistItems.schoolId, schoolId),
    orderBy: [
      asc(onboardingChecklistItems.position),
      asc(onboardingChecklistItems.sortOrder),
    ],
    with: {
      creator: { columns: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Create a checklist item
 */
export async function createChecklistItem(data: {
  position?: PtaBoardPosition | null;
  title: string;
  description?: string;
  sortOrder?: number;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const [item] = await db
    .insert(onboardingChecklistItems)
    .values({
      schoolId,
      position: data.position ?? null,
      title: data.title,
      description: data.description,
      sortOrder: data.sortOrder ?? 0,
      createdBy: user.id!,
    })
    .returning();

  revalidatePath("/onboarding");
  revalidatePath("/admin/board/onboarding");
  return item;
}

/**
 * Update a checklist item
 */
export async function updateChecklistItem(
  id: string,
  data: {
    position?: PtaBoardPosition | null;
    title?: string;
    description?: string;
    sortOrder?: number;
    active?: boolean;
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .update(onboardingChecklistItems)
    .set(data)
    .where(
      and(
        eq(onboardingChecklistItems.id, id),
        eq(onboardingChecklistItems.schoolId, schoolId)
      )
    );

  revalidatePath("/onboarding");
  revalidatePath("/admin/board/onboarding");
  return { success: true };
}

/**
 * Delete a checklist item
 */
export async function deleteChecklistItem(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(onboardingChecklistItems)
    .where(
      and(
        eq(onboardingChecklistItems.id, id),
        eq(onboardingChecklistItems.schoolId, schoolId)
      )
    );

  revalidatePath("/onboarding");
  revalidatePath("/admin/board/onboarding");
  return { success: true };
}

/**
 * Get onboarding progress summary for a user
 */
export async function getOnboardingProgressSummary() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  // Get user's board position
  const membership = await getSchoolMembership(user.id!, schoolId);
  const position = membership?.boardPosition ?? undefined;

  // Get all applicable checklist items
  const checklist = await getChecklistWithProgress(position);

  const totalItems = checklist.length;
  const completedItems = checklist.filter((item) => item.completed).length;

  return {
    totalItems,
    completedItems,
    percentComplete: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
    position,
  };
}
