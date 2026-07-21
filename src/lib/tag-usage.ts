import { db } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { getCurrentSchoolId } from "@/lib/auth-helpers";
import { normalizeTags } from "@/lib/tags";
import { and, eq, sql } from "drizzle-orm";

/**
 * Usage-count bookkeeping for the `tags` table.
 *
 * Plain library functions rather than server actions on purpose. Every export of
 * a `"use server"` module is a callable endpoint, and these are gated only by
 * `getCurrentSchoolId()` — which reads a client-supplied cookie before it falls
 * back to a membership lookup. Exported as actions, they let an unauthenticated
 * caller with a guessed school id create tags and move usage counts for any
 * school. The callers are all server actions that have already authenticated and
 * authorized the write these counts describe.
 */

/**
 * Ensure tags exist for the current school and increment their usage.
 * Called when content is tagged (minutes, articles, contacts, events).
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
