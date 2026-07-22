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
import { eq, and, asc, desc, ne, sql, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type {
  EventCatalogEntryWithInterest,
  EventInterestLevel,
} from "@/types";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { slugify, titleSimilarity } from "@/lib/utils";
import { normalizeTags } from "@/lib/tags";
import { ensureTagsExist, syncTagUsage } from "@/lib/tag-usage";
import { assertNoHistory, summarizeHistory } from "@/lib/history-guard";

/** Titles this close to an existing entry are probably the same event. */
const DUPLICATE_TITLE_THRESHOLD = 0.6;

/**
 * Reserve a slug for `title`, appending -2, -3, ... on collision.
 *
 * The slug is the catalog's identity key, so this is the one thing that must
 * not collide. Near-duplicate *titles* are a separate, softer concern handled
 * by findSimilarCatalogEntries — that one warns, this one guarantees.
 */
async function reserveSlug(
  schoolId: string,
  title: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(title) || "event";

  const taken = await db.query.eventCatalog.findMany({
    where: excludeId
      ? and(eq(eventCatalog.schoolId, schoolId), ne(eventCatalog.id, excludeId))
      : eq(eventCatalog.schoolId, schoolId),
    columns: { slug: true },
  });
  const used = new Set(taken.map((t) => t.slug));

  if (!used.has(base)) return base;
  let counter = 2;
  while (used.has(`${base}-${counter}`)) counter++;
  return `${base}-${counter}`;
}

/**
 * Get the event catalog for the current school
 * Includes user's interest level and total interested count
 */
export async function getCatalog(): Promise<EventCatalogEntryWithInterest[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);
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
      eq(eventInterest.schoolYear, schoolYear)
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
        eq(eventInterest.schoolYear, schoolYear)
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
  const schoolYear = await getSchoolCurrentYear(schoolId);
  await assertPtaBoard(user.id!);

  // Check if interest already exists
  const existing = await db.query.eventInterest.findFirst({
    where: and(
      eq(eventInterest.userId, user.id!),
      eq(eventInterest.eventCatalogId, eventCatalogId),
      eq(eventInterest.schoolYear, schoolYear)
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
      schoolYear: schoolYear,
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
  const schoolYear = await getSchoolCurrentYear(schoolId);
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // The catalog id alone isn't proof of anything — confirm the entry is this
  // school's before returning who volunteered for it.
  const entry = await db.query.eventCatalog.findFirst({
    where: and(
      eq(eventCatalog.id, eventCatalogId),
      eq(eventCatalog.schoolId, schoolId)
    ),
    columns: { id: true },
  });
  if (!entry) throw new Error("Recurring event not found");

  const interests = await db.query.eventInterest.findMany({
    where: and(
      eq(eventInterest.eventCatalogId, eventCatalogId),
      eq(eventInterest.schoolYear, schoolYear)
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

/** Board positions, widened once instead of at every call site. */
type BoardPositionArray = NonNullable<
  typeof eventCatalog.$inferInsert.relatedPositions
>;

interface CatalogEntryInput {
  title: string;
  category?: string;
  description?: string;
  typicalMonth?: number | null;
  timingNote?: string;
  estimatedVolunteers?: string;
  estimatedBudget?: string;
  keyTasks?: string;
  tips?: string;
  tags?: string[];
  relatedPositions?: string[];
  isActive?: boolean;
  // Volunteer-facing copy, reused by every volunteer campaign that includes
  // this event.
  volunteerResponsibilities?: string;
  timeCommitment?: string;
  iconEmoji?: string;
  imageUrl?: string;
}

/**
 * Entries whose titles look like they describe the same event as `title`.
 *
 * The catalog only works if it holds one row per real event — two "Field Day"
 * entries and next year's lead inherits half the history. Rather than block on
 * an exact match (which never catches "Field Day" vs "Field Day 2026"), this
 * surfaces close matches so the form can ask before creating a second row.
 */
export async function findSimilarCatalogEntries(
  title: string,
  excludeId?: string
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];
  await assertPtaBoard(user.id!);

  if (!title.trim()) return [];

  const entries = await db.query.eventCatalog.findMany({
    where: eq(eventCatalog.schoolId, schoolId),
    columns: { id: true, title: true, slug: true, typicalMonth: true },
  });

  return entries
    .filter((e) => e.id !== excludeId)
    .map((e) => ({ ...e, score: titleSimilarity(title, e.title) }))
    .filter((e) => e.score >= DUPLICATE_TITLE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Active catalog entries for the "which recurring event is this?" picker.
 */
export async function getCatalogOptions() {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];

  return db.query.eventCatalog.findMany({
    where: and(
      eq(eventCatalog.schoolId, schoolId),
      eq(eventCatalog.isActive, true)
    ),
    columns: {
      id: true,
      title: true,
      slug: true,
      category: true,
      typicalMonth: true,
      description: true,
    },
    orderBy: [asc(eventCatalog.title)],
  });
}

/**
 * Create a new event catalog entry (admin)
 */
export async function createCatalogEntry(data: CatalogEntryInput) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const title = data.title.trim();
  if (!title) throw new Error("Give this event a title");

  const slug = await reserveSlug(schoolId, title);
  const tags = normalizeTags(data.tags);

  const [entry] = await db
    .insert(eventCatalog)
    .values({
      schoolId,
      slug,
      title,
      category: data.category || null,
      description: data.description || null,
      typicalMonth: data.typicalMonth ?? null,
      timingNote: data.timingNote || null,
      estimatedVolunteers: data.estimatedVolunteers || null,
      estimatedBudget: data.estimatedBudget || null,
      keyTasks: data.keyTasks || null,
      tips: data.tips || null,
      tags: tags.length > 0 ? tags : null,
      volunteerResponsibilities: data.volunteerResponsibilities || null,
      timeCommitment: data.timeCommitment || null,
      iconEmoji: data.iconEmoji || null,
      imageUrl: data.imageUrl || null,
      relatedPositions: data.relatedPositions as BoardPositionArray,
      isActive: data.isActive ?? true,
      aiGenerated: false,
    })
    .returning();

  if (tags.length > 0) await ensureTagsExist(tags);

  revalidatePath("/onboarding/events");
  revalidatePath("/admin/board/event-catalog");
  return entry;
}

/**
 * Update an event catalog entry (admin)
 */
export async function updateCatalogEntry(
  id: string,
  data: Partial<CatalogEntryInput>
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const existing = await db.query.eventCatalog.findFirst({
    where: and(eq(eventCatalog.id, id), eq(eventCatalog.schoolId, schoolId)),
  });
  if (!existing) throw new Error("Catalog entry not found");

  const title = data.title?.trim();
  // Retitling re-derives the slug so the identity key keeps matching what
  // people actually call the event.
  const slug =
    title && title !== existing.title
      ? await reserveSlug(schoolId, title, id)
      : undefined;

  const tags = data.tags !== undefined ? normalizeTags(data.tags) : undefined;

  await db
    .update(eventCatalog)
    .set({
      ...(title !== undefined && { title }),
      ...(slug !== undefined && { slug }),
      ...(data.category !== undefined && { category: data.category || null }),
      ...(data.description !== undefined && {
        description: data.description || null,
      }),
      ...(data.typicalMonth !== undefined && {
        typicalMonth: data.typicalMonth ?? null,
      }),
      ...(data.timingNote !== undefined && {
        timingNote: data.timingNote || null,
      }),
      ...(data.estimatedVolunteers !== undefined && {
        estimatedVolunteers: data.estimatedVolunteers || null,
      }),
      ...(data.estimatedBudget !== undefined && {
        estimatedBudget: data.estimatedBudget || null,
      }),
      ...(data.keyTasks !== undefined && { keyTasks: data.keyTasks || null }),
      ...(data.tips !== undefined && { tips: data.tips || null }),
      ...(tags !== undefined && { tags: tags.length > 0 ? tags : null }),
      ...(data.volunteerResponsibilities !== undefined && {
        volunteerResponsibilities: data.volunteerResponsibilities || null,
      }),
      ...(data.timeCommitment !== undefined && {
        timeCommitment: data.timeCommitment || null,
      }),
      ...(data.iconEmoji !== undefined && {
        iconEmoji: data.iconEmoji || null,
      }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
      ...(data.relatedPositions !== undefined && {
        relatedPositions: data.relatedPositions as BoardPositionArray,
      }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      updatedAt: new Date(),
    })
    .where(and(eq(eventCatalog.id, id), eq(eventCatalog.schoolId, schoolId)));

  if (tags !== undefined) {
    await syncTagUsage(existing.tags ?? [], tags);
  }

  revalidatePath("/onboarding/events");
  revalidatePath("/admin/board/event-catalog");
  return { success: true };
}

/**
 * Count everything that would be lost with a recurring event. Interest rows
 * cascade off the catalog entry outright; event plans and campaign events keep
 * their rows but lose the link that ties this year's Fun Run to last year's.
 */
export async function getCatalogHistoryCounts(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const [plans, interests] = await Promise.all([
    db.$count(
      eventPlans,
      and(eq(eventPlans.schoolId, schoolId), eq(eventPlans.eventCatalogId, id))
    ),
    db.$count(eventInterest, eq(eventInterest.eventCatalogId, id)),
  ]);

  return summarizeHistory([
    { label: "year of event plans", plural: "years of event plans", count: plans },
    { label: "board interest record", count: interests },
  ]);
}

/**
 * Permanently delete a catalog entry — only allowed when no plan or interest
 * has ever pointed at it. A recurring event that has been run is the thread
 * connecting each year's plan to the next, so retiring is the way to get it out
 * of the picker; see setCatalogEntryActive.
 */
export async function deleteCatalogEntry(id: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const existing = await db.query.eventCatalog.findFirst({
    where: and(eq(eventCatalog.id, id), eq(eventCatalog.schoolId, schoolId)),
    columns: { tags: true, title: true },
  });
  if (!existing) return { success: true };

  const counts = await getCatalogHistoryCounts(id);
  assertNoHistory(
    existing.title,
    counts.items,
    "Retire it instead — that hides it from the planning picker and keeps every year linked, so it can be brought back if the event returns."
  );

  await db
    .delete(eventCatalog)
    .where(
      and(eq(eventCatalog.id, id), eq(eventCatalog.schoolId, schoolId))
    );

  await syncTagUsage(existing.tags ?? [], []);

  revalidatePath("/onboarding/events");
  revalidatePath("/admin/board/event-catalog");
  revalidatePath("/events");
  return { success: true };
}

/**
 * Retire (or un-retire) a catalog entry.
 *
 * Deleting a recurring event throws away every year of history attached to it,
 * so the ordinary way to get an event out of the picker is to retire it.
 */
export async function setCatalogEntryActive(id: string, isActive: boolean) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .update(eventCatalog)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(eventCatalog.id, id), eq(eventCatalog.schoolId, schoolId)));

  revalidatePath("/onboarding/events");
  revalidatePath("/admin/board/event-catalog");
  return { success: true };
}

/**
 * Every year this recurring event has been run, newest first.
 */
export async function getCatalogEntryHistory(catalogId: string) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];

  return db.query.eventPlans.findMany({
    where: and(
      eq(eventPlans.schoolId, schoolId),
      eq(eventPlans.eventCatalogId, catalogId)
    ),
    columns: {
      id: true,
      title: true,
      schoolYear: true,
      status: true,
      eventDate: true,
      budget: true,
    },
    orderBy: [desc(eventPlans.schoolYear)],
  });
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
  let linked = 0;

  for (const plan of completedPlans) {
    // Already an instance of a recurring event — nothing to generate.
    if (plan.eventCatalogId || plan.isOneOff) continue;

    // Check if catalog entry already exists for this plan
    const existing = await db.query.eventCatalog.findFirst({
      where: and(
        eq(eventCatalog.schoolId, schoolId),
        sql`${plan.id} = ANY(${eventCatalog.sourceEventPlanIds})`
      ),
    });

    if (existing) {
      await db
        .update(eventPlans)
        .set({ eventCatalogId: existing.id })
        .where(eq(eventPlans.id, plan.id));
      linked++;
      continue;
    }

    // A plan whose title matches an existing recurring event is another year
    // of that event, not a new one to catalog.
    const slug = slugify(plan.title) || "event";
    const bySlug = await db.query.eventCatalog.findFirst({
      where: and(
        eq(eventCatalog.schoolId, schoolId),
        eq(eventCatalog.slug, slug)
      ),
    });

    if (bySlug) {
      await db
        .update(eventPlans)
        .set({ eventCatalogId: bySlug.id })
        .where(eq(eventPlans.id, plan.id));
      linked++;
      continue;
    }

    // Estimate volunteers from task assignments
    const uniqueAssignees = new Set(
      plan.tasks.filter((t) => t.assignedTo).map((t) => t.assignedTo)
    );
    const estimatedVolunteers =
      uniqueAssignees.size > 0 ? `${uniqueAssignees.size}+ volunteers` : null;

    // Extract key tasks
    const keyTasks = plan.tasks.slice(0, 5).map((t) => t.title);

    const [entry] = await db
      .insert(eventCatalog)
      .values({
        schoolId,
        slug,
        title: plan.title,
        description: plan.description,
        typicalMonth: plan.eventDate
          ? new Date(plan.eventDate).getMonth() + 1
          : null,
        estimatedVolunteers,
        estimatedBudget: plan.budget ? `$${plan.budget}` : null,
        keyTasks: keyTasks.length > 0 ? JSON.stringify(keyTasks) : null,
        tags: plan.tags,
        sourceEventPlanIds: [plan.id],
        aiGenerated: true,
      })
      .returning();

    // Point the plan at what it just seeded, so next year's lead can find it.
    await db
      .update(eventPlans)
      .set({ eventCatalogId: entry.id })
      .where(eq(eventPlans.id, plan.id));

    created++;
  }

  revalidatePath("/onboarding/events");
  revalidatePath("/admin/board/event-catalog");
  revalidatePath("/events");
  return { success: true, created, linked };
}
