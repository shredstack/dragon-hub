"use server";

import {
  assertAuthenticated,
  getCurrentSchoolId,
  assertPtaBoard,
  assertSchoolPtaBoardOrAdmin,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  eventCatalog,
  eventInterest,
  eventPlans,
} from "@/lib/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type {
  EventCatalogEntryWithInterest,
  EventInterestLevel,
} from "@/types";
import { CURRENT_SCHOOL_YEAR } from "@/lib/constants";

/**
 * Get the event catalog for the current school
 * Includes user's interest level and total interested count
 */
export async function getCatalog(): Promise<EventCatalogEntryWithInterest[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoard(user.id!);

  // Get all catalog entries for the school
  const entries = await db.query.eventCatalog.findMany({
    where: eq(eventCatalog.schoolId, schoolId),
    orderBy: [desc(eventCatalog.createdAt)],
  });

  // Get user's interest for each entry
  const userInterests = await db.query.eventInterest.findMany({
    where: and(
      eq(eventInterest.userId, user.id!),
      eq(eventInterest.schoolId, schoolId),
      eq(eventInterest.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  // Get total interest counts for each entry
  const interestCounts = await db
    .select({
      eventCatalogId: eventInterest.eventCatalogId,
      count: count(),
    })
    .from(eventInterest)
    .where(
      and(
        eq(eventInterest.schoolId, schoolId),
        eq(eventInterest.schoolYear, CURRENT_SCHOOL_YEAR)
      )
    )
    .groupBy(eventInterest.eventCatalogId);

  // Map interests by catalog id
  const interestMap = new Map(
    userInterests.map((i) => [i.eventCatalogId, i])
  );
  const countMap = new Map(
    interestCounts.map((c) => [c.eventCatalogId, Number(c.count)])
  );

  return entries.map((entry) => ({
    ...entry,
    userInterest: interestMap.get(entry.id) ?? null,
    totalInterested: countMap.get(entry.id) ?? 0,
  }));
}

/**
 * Toggle interest in an event
 */
export async function toggleEventInterest(
  eventCatalogId: string,
  interestLevel: EventInterestLevel | null,
  notes?: string
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoard(user.id!);

  // Check if interest already exists
  const existing = await db.query.eventInterest.findFirst({
    where: and(
      eq(eventInterest.userId, user.id!),
      eq(eventInterest.eventCatalogId, eventCatalogId),
      eq(eventInterest.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
  });

  if (interestLevel === null) {
    // Remove interest
    if (existing) {
      await db.delete(eventInterest).where(eq(eventInterest.id, existing.id));
    }
  } else if (existing) {
    // Update interest
    await db
      .update(eventInterest)
      .set({ interestLevel, notes })
      .where(eq(eventInterest.id, existing.id));
  } else {
    // Create new interest
    await db.insert(eventInterest).values({
      schoolId,
      userId: user.id!,
      eventCatalogId,
      schoolYear: CURRENT_SCHOOL_YEAR,
      interestLevel,
      notes,
    });
  }

  revalidatePath("/onboarding/events");
  return { success: true };
}

/**
 * Get interest summary for an event (admin view)
 */
export async function getInterestSummary(eventCatalogId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const interests = await db.query.eventInterest.findMany({
    where: and(
      eq(eventInterest.eventCatalogId, eventCatalogId),
      eq(eventInterest.schoolYear, CURRENT_SCHOOL_YEAR)
    ),
    with: {
      user: { columns: { id: true, name: true, email: true } },
    },
  });

  return {
    leads: interests.filter((i) => i.interestLevel === "lead"),
    helpers: interests.filter((i) => i.interestLevel === "help"),
    observers: interests.filter((i) => i.interestLevel === "observe"),
  };
}

/**
 * Create a new event catalog entry (admin)
 */
export async function createCatalogEntry(data: {
  eventType: string;
  title: string;
  description?: string;
  typicalTiming?: string;
  estimatedVolunteers?: string;
  estimatedBudget?: string;
  keyTasks?: string;
  tips?: string;
  relatedPositions?: string[];
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const [entry] = await db
    .insert(eventCatalog)
    .values({
      schoolId,
      eventType: data.eventType,
      title: data.title,
      description: data.description,
      typicalTiming: data.typicalTiming,
      estimatedVolunteers: data.estimatedVolunteers,
      estimatedBudget: data.estimatedBudget,
      keyTasks: data.keyTasks,
      tips: data.tips,
      relatedPositions: data.relatedPositions as unknown as (
        | "president"
        | "vice_president"
        | "secretary"
        | "treasurer"
        | "president_elect"
        | "vp_elect"
        | "legislative_vp"
        | "public_relations_vp"
        | "membership_vp"
        | "room_parent_vp"
      )[],
      aiGenerated: false,
    })
    .returning();

  revalidatePath("/onboarding/events");
  revalidatePath("/admin/board/event-catalog");
  return entry;
}

/**
 * Update an event catalog entry (admin)
 */
export async function updateCatalogEntry(
  id: string,
  data: {
    eventType?: string;
    title?: string;
    description?: string;
    typicalTiming?: string;
    estimatedVolunteers?: string;
    estimatedBudget?: string;
    keyTasks?: string;
    tips?: string;
    relatedPositions?: string[];
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .update(eventCatalog)
    .set({
      ...data,
      relatedPositions: data.relatedPositions as unknown as (
        | "president"
        | "vice_president"
        | "secretary"
        | "treasurer"
        | "president_elect"
        | "vp_elect"
        | "legislative_vp"
        | "public_relations_vp"
        | "membership_vp"
        | "room_parent_vp"
      )[],
      updatedAt: new Date(),
    })
    .where(
      and(eq(eventCatalog.id, id), eq(eventCatalog.schoolId, schoolId))
    );

  revalidatePath("/onboarding/events");
  revalidatePath("/admin/board/event-catalog");
  return { success: true };
}

/**
 * Delete an event catalog entry (admin)
 */
export async function deleteCatalogEntry(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(eventCatalog)
    .where(
      and(eq(eventCatalog.id, id), eq(eventCatalog.schoolId, schoolId))
    );

  revalidatePath("/onboarding/events");
  revalidatePath("/admin/board/event-catalog");
  return { success: true };
}

/**
 * Generate event catalog from completed event plans (admin)
 * This creates catalog entries based on past events
 */
export async function generateCatalogFromEventPlans() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Get completed event plans
  const completedPlans = await db.query.eventPlans.findMany({
    where: and(
      eq(eventPlans.schoolId, schoolId),
      eq(eventPlans.status, "completed")
    ),
    with: {
      tasks: true,
      members: {
        with: {
          user: { columns: { name: true } },
        },
      },
    },
  });

  let created = 0;

  for (const plan of completedPlans) {
    // Check if catalog entry already exists for this plan
    const existing = await db.query.eventCatalog.findFirst({
      where: and(
        eq(eventCatalog.schoolId, schoolId),
        sql`${plan.id} = ANY(${eventCatalog.sourceEventPlanIds})`
      ),
    });

    if (existing) continue;

    // Estimate volunteers from task assignments
    const uniqueAssignees = new Set(
      plan.tasks.filter((t) => t.assignedTo).map((t) => t.assignedTo)
    );
    const estimatedVolunteers =
      uniqueAssignees.size > 0 ? `${uniqueAssignees.size}+ volunteers` : null;

    // Extract key tasks
    const keyTasks = plan.tasks.slice(0, 5).map((t) => t.title);

    await db.insert(eventCatalog).values({
      schoolId,
      eventType: plan.eventType ?? "pta",
      title: plan.title,
      description: plan.description,
      typicalTiming: plan.eventDate
        ? new Date(plan.eventDate).toLocaleDateString("en-US", {
            month: "long",
          })
        : null,
      estimatedVolunteers,
      estimatedBudget: plan.budget ? `$${plan.budget}` : null,
      keyTasks: keyTasks.length > 0 ? JSON.stringify(keyTasks) : null,
      sourceEventPlanIds: [plan.id],
      aiGenerated: true,
    });

    created++;
  }

  revalidatePath("/onboarding/events");
  revalidatePath("/admin/board/event-catalog");
  return { success: true, created };
}
