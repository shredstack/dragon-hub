"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  tags,
  ptaMinutes,
  knowledgeArticles,
  mediaLibrary,
  eventPlans,
  eventCatalog,
  schoolContacts,
} from "@/lib/db/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { normalizeTags } from "@/lib/tags";

/**
 * Get all tags for the current school.
 * Ordered by usage count (most used first), then alphabetically.
 */
export async function getTags() {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  return db.query.tags.findMany({
    where: eq(tags.schoolId, schoolId),
    orderBy: [desc(tags.usageCount), asc(tags.displayName)],
  });
}

/**
 * Get tag display names for AI prompting.
 * Returns array of display names ordered by usage.
 */
export async function getTagNames(): Promise<string[]> {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];

  const allTags = await db.query.tags.findMany({
    where: eq(tags.schoolId, schoolId),
    columns: { displayName: true },
    orderBy: [desc(tags.usageCount)],
  });

  return allTags.map((t) => t.displayName);
}

/**
 * Create a new tag.
 * Requires PTA board role.
 */
export async function createTag(displayName: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const name = displayName.toLowerCase().trim();

  if (!name) {
    throw new Error("Tag name cannot be empty");
  }

  // Check for existing tag
  const existing = await db.query.tags.findFirst({
    where: and(eq(tags.schoolId, schoolId), eq(tags.name, name)),
  });

  if (existing) {
    throw new Error("Tag already exists");
  }

  const [tag] = await db
    .insert(tags)
    .values({
      schoolId,
      name,
      displayName: displayName.trim(),
    })
    .returning();

  revalidatePath("/admin/tags");
  revalidatePath("/minutes");
  revalidatePath("/knowledge");
  revalidatePath("/events");
  revalidatePath("/admin/contacts");
  return tag;
}

/**
 * Update a tag's display name.
 * Requires PTA board role.
 */
export async function updateTag(tagId: string, displayName: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .update(tags)
    .set({
      displayName: displayName.trim(),
      updatedAt: new Date(),
    })
    .where(and(eq(tags.id, tagId), eq(tags.schoolId, schoolId)));

  revalidatePath("/admin/tags");
  revalidatePath("/minutes");
  revalidatePath("/knowledge");
  revalidatePath("/events");
  revalidatePath("/admin/contacts");
}

/**
 * Delete a tag.
 * Note: This does NOT remove the tag from existing content.
 * Requires PTA board role.
 */
export async function deleteTag(tagId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  await db
    .delete(tags)
    .where(and(eq(tags.id, tagId), eq(tags.schoolId, schoolId)));

  revalidatePath("/admin/tags");
  revalidatePath("/minutes");
  revalidatePath("/knowledge");
  revalidatePath("/events");
  revalidatePath("/admin/contacts");
}

/**
 * Merge one tag into another (for consolidating duplicates).
 * Updates all content (minutes, knowledge articles, media library) that have the source tag.
 * Requires PTA board role.
 */
export async function mergeTags(sourceTagId: string, targetTagId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Get both tags
  const [sourceTag, targetTag] = await Promise.all([
    db.query.tags.findFirst({
      where: and(eq(tags.id, sourceTagId), eq(tags.schoolId, schoolId)),
    }),
    db.query.tags.findFirst({
      where: and(eq(tags.id, targetTagId), eq(tags.schoolId, schoolId)),
    }),
  ]);

  if (!sourceTag || !targetTag) {
    throw new Error("Tags not found");
  }

  let mergedCount = 0;

  /**
   * Rewrite the source tag to the target across one table's rows.
   *
   * Every taggable table stores the same `text[]` of normalized names, so the
   * rewrite is identical everywhere — worth doing generically, because a table
   * that gets missed here leaves rows pointing at a tag that no longer exists.
   */
  async function mergeIn<T extends { id: string; tags: string[] | null }>(
    rows: T[],
    update: (id: string, newTags: string[]) => Promise<unknown>
  ) {
    for (const row of rows) {
      if (!row.tags?.includes(sourceTag!.name)) continue;

      const newTags = row.tags
        .filter((t) => t !== sourceTag!.name)
        .concat(row.tags.includes(targetTag!.name) ? [] : [targetTag!.name]);

      await update(row.id, newTags);
      mergedCount++;
    }
  }

  const tagColumns = { id: true, tags: true } as const;

  await mergeIn(
    await db.query.ptaMinutes.findMany({
      where: eq(ptaMinutes.schoolId, schoolId),
      columns: tagColumns,
    }),
    (id, newTags) =>
      db.update(ptaMinutes).set({ tags: newTags }).where(eq(ptaMinutes.id, id))
  );

  await mergeIn(
    await db.query.knowledgeArticles.findMany({
      where: eq(knowledgeArticles.schoolId, schoolId),
      columns: tagColumns,
    }),
    (id, newTags) =>
      db
        .update(knowledgeArticles)
        .set({ tags: newTags })
        .where(eq(knowledgeArticles.id, id))
  );

  await mergeIn(
    await db.query.mediaLibrary.findMany({
      where: eq(mediaLibrary.schoolId, schoolId),
      columns: tagColumns,
    }),
    (id, newTags) =>
      db
        .update(mediaLibrary)
        .set({ tags: newTags })
        .where(eq(mediaLibrary.id, id))
  );

  await mergeIn(
    await db.query.eventPlans.findMany({
      where: eq(eventPlans.schoolId, schoolId),
      columns: tagColumns,
    }),
    (id, newTags) =>
      db.update(eventPlans).set({ tags: newTags }).where(eq(eventPlans.id, id))
  );

  await mergeIn(
    await db.query.eventCatalog.findMany({
      where: eq(eventCatalog.schoolId, schoolId),
      columns: tagColumns,
    }),
    (id, newTags) =>
      db
        .update(eventCatalog)
        .set({ tags: newTags })
        .where(eq(eventCatalog.id, id))
  );

  await mergeIn(
    await db.query.schoolContacts.findMany({
      where: eq(schoolContacts.schoolId, schoolId),
      columns: tagColumns,
    }),
    (id, newTags) =>
      db
        .update(schoolContacts)
        .set({ tags: newTags })
        .where(eq(schoolContacts.id, id))
  );

  // Update usage count on target
  await db
    .update(tags)
    .set({
      usageCount: targetTag.usageCount + sourceTag.usageCount,
      updatedAt: new Date(),
    })
    .where(eq(tags.id, targetTagId));

  // Delete source tag
  await db.delete(tags).where(eq(tags.id, sourceTagId));

  revalidatePath("/admin/tags");
  revalidatePath("/minutes");
  revalidatePath("/knowledge");
  revalidatePath("/events");
  revalidatePath("/admin/contacts");
  revalidatePath("/admin/media");

  return { mergedCount };
}

/**
 * Ensure tags exist in the database and increment their usage.
 * Creates new tags if they don't exist.
 * Called when content is tagged (minutes, articles, etc.)
 */
export async function ensureTagsExist(tagNames: string[]) {
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return;

  for (const displayName of tagNames) {
    const name = displayName.toLowerCase().trim();
    if (!name) continue;

    // Try to update existing tag's usage count
    const result = await db
      .update(tags)
      .set({
        usageCount: sql`${tags.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(tags.schoolId, schoolId), eq(tags.name, name)))
      .returning();

    // If tag doesn't exist, create it
    if (result.length === 0) {
      try {
        await db.insert(tags).values({
          schoolId,
          name,
          displayName: displayName.trim(),
          usageCount: 1,
        });
      } catch (error) {
        // Ignore duplicate key errors (race condition)
        console.error("Error creating tag:", error);
      }
    }
  }
}

/**
 * Move usage counts from one set of tags to another after an edit.
 *
 * Only the difference is applied. Re-saving a form without touching its tags
 * should be a no-op, not an inflation of every count on the row.
 */
export async function syncTagUsage(
  previousTags: string[] | null | undefined,
  nextTags: string[] | null | undefined
) {
  const before = new Set(normalizeTags(previousTags));
  const after = new Set(normalizeTags(nextTags));

  const added = [...after].filter((t) => !before.has(t));
  const removed = [...before].filter((t) => !after.has(t));

  if (added.length > 0) await ensureTagsExist(added);
  if (removed.length > 0) await decrementTagUsage(removed);
}

/**
 * Decrement usage count for tags (when tags are removed from content).
 */
export async function decrementTagUsage(tagNames: string[]) {
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return;

  for (const displayName of tagNames) {
    const name = displayName.toLowerCase().trim();
    if (!name) continue;

    await db
      .update(tags)
      .set({
        usageCount: sql`GREATEST(${tags.usageCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(and(eq(tags.schoolId, schoolId), eq(tags.name, name)));
  }
}
