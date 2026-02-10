"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { tags, ptaMinutes, knowledgeArticles } from "@/lib/db/schema";
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

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
}

/**
 * Merge one tag into another (for consolidating duplicates).
 * Updates all content (minutes, knowledge articles) that have the source tag.
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

  // Update minutes with the source tag
  const minutesWithTag = await db.query.ptaMinutes.findMany({
    where: eq(ptaMinutes.schoolId, schoolId),
    columns: { id: true, tags: true },
  });

  for (const minutes of minutesWithTag) {
    if (minutes.tags?.includes(sourceTag.name)) {
      const newTags = minutes.tags
        .filter((t) => t !== sourceTag.name)
        .concat(minutes.tags.includes(targetTag.name) ? [] : [targetTag.name]);

      await db
        .update(ptaMinutes)
        .set({ tags: newTags })
        .where(eq(ptaMinutes.id, minutes.id));

      mergedCount++;
    }
  }

  // Update knowledge articles with the source tag
  const articlesWithTag = await db.query.knowledgeArticles.findMany({
    where: eq(knowledgeArticles.schoolId, schoolId),
    columns: { id: true, tags: true },
  });

  for (const article of articlesWithTag) {
    if (article.tags?.includes(sourceTag.name)) {
      const newTags = article.tags
        .filter((t) => t !== sourceTag.name)
        .concat(article.tags.includes(targetTag.name) ? [] : [targetTag.name]);

      await db
        .update(knowledgeArticles)
        .set({ tags: newTags })
        .where(eq(knowledgeArticles.id, article.id));

      mergedCount++;
    }
  }

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
