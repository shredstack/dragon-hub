"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { mediaLibrary } from "@/lib/db/schema";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { ensureTagsExist, decrementTagUsage } from "./tags";

/**
 * Get all media library items for the current school.
 * Ordered by creation date (newest first).
 */
export async function getMediaLibrary(options?: {
  reusableOnly?: boolean;
  tags?: string[];
  search?: string;
  limit?: number;
  offset?: number;
}) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const conditions = [eq(mediaLibrary.schoolId, schoolId)];

  if (options?.reusableOnly) {
    conditions.push(eq(mediaLibrary.reusable, true));
  }

  if (options?.tags && options.tags.length > 0) {
    // Filter by tags using array overlap
    conditions.push(
      sql`${mediaLibrary.tags} && ARRAY[${sql.join(
        options.tags.map((t) => sql`${t}`),
        sql`, `
      )}]::text[]`
    );
  }

  if (options?.search) {
    const searchTerm = `%${options.search}%`;
    conditions.push(
      or(
        ilike(mediaLibrary.fileName, searchTerm),
        ilike(mediaLibrary.altText, searchTerm)
      )!
    );
  }

  return db.query.mediaLibrary.findMany({
    where: and(...conditions),
    orderBy: [desc(mediaLibrary.createdAt)],
    limit: options?.limit,
    offset: options?.offset,
    with: {
      uploader: {
        columns: { name: true, email: true },
      },
    },
  });
}

/**
 * Get a single media item by ID.
 */
export async function getMediaById(mediaId: string) {
  await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  return db.query.mediaLibrary.findFirst({
    where: and(
      eq(mediaLibrary.id, mediaId),
      eq(mediaLibrary.schoolId, schoolId)
    ),
    with: {
      uploader: {
        columns: { name: true, email: true },
      },
    },
  });
}

/**
 * Update media item metadata.
 * Requires PTA board role.
 */
export async function updateMediaItem(
  mediaId: string,
  data: {
    fileName?: string;
    altText?: string;
    tags?: string[];
    reusable?: boolean;
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Get current item for tag diff
  const existing = await db.query.mediaLibrary.findFirst({
    where: and(
      eq(mediaLibrary.id, mediaId),
      eq(mediaLibrary.schoolId, schoolId)
    ),
    columns: { tags: true },
  });

  if (!existing) throw new Error("Media not found");

  // Handle tag changes
  if (data.tags !== undefined) {
    const oldTags = existing.tags || [];
    const newTags = data.tags;
    const addedTags = newTags.filter((t) => !oldTags.includes(t));
    const removedTags = oldTags.filter((t) => !newTags.includes(t));

    if (addedTags.length > 0) await ensureTagsExist(addedTags);
    if (removedTags.length > 0) await decrementTagUsage(removedTags);
  }

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.fileName !== undefined) updateData.fileName = data.fileName;
  if (data.altText !== undefined) updateData.altText = data.altText;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.reusable !== undefined) updateData.reusable = data.reusable;

  await db
    .update(mediaLibrary)
    .set(updateData)
    .where(
      and(eq(mediaLibrary.id, mediaId), eq(mediaLibrary.schoolId, schoolId))
    );

  revalidatePath("/admin/media");
}

/**
 * Delete a media item.
 * Also deletes the blob from storage.
 * Requires PTA board role.
 */
export async function deleteMediaItem(mediaId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const item = await db.query.mediaLibrary.findFirst({
    where: and(
      eq(mediaLibrary.id, mediaId),
      eq(mediaLibrary.schoolId, schoolId)
    ),
  });

  if (!item) throw new Error("Media not found");

  // Delete from Vercel Blob
  if (item.blobUrl.includes("blob.vercel-storage.com")) {
    try {
      await del(item.blobUrl);
    } catch {
      // Ignore blob deletion errors - blob may already be deleted
    }
  }

  // Decrement tag usage
  if (item.tags && item.tags.length > 0) {
    await decrementTagUsage(item.tags);
  }

  await db.delete(mediaLibrary).where(eq(mediaLibrary.id, mediaId));

  revalidatePath("/admin/media");
}

/**
 * Create a media library item directly.
 * Called by the upload route after a successful blob upload.
 * Requires PTA board role.
 */
export async function createMediaLibraryItem(data: {
  blobUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  altText?: string;
  tags?: string[];
  reusable?: boolean;
  sourceType?: string;
  sourceId?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Ensure tags exist
  if (data.tags && data.tags.length > 0) {
    await ensureTagsExist(data.tags);
  }

  const [item] = await db
    .insert(mediaLibrary)
    .values({
      schoolId,
      blobUrl: data.blobUrl,
      fileName: data.fileName,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      altText: data.altText || data.fileName,
      tags: data.tags || [],
      reusable: data.reusable ?? true,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      uploadedBy: user.id!,
    })
    .returning();

  revalidatePath("/admin/media");
  return item;
}
