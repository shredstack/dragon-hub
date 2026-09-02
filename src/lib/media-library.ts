import "server-only";

import { del } from "@vercel/blob";
import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  emailCampaigns,
  emailContentImages,
  emailContentItems,
  emailRecurringSections,
  emailSections,
  mediaLibrary,
  schools,
} from "@/lib/db/schema";
import type { MediaUsage } from "@/lib/media-library-shared";

export type { MediaUsage };

/**
 * The media library is a **catalog of every image the school has uploaded**,
 * not a second upload destination. An image that reaches a weekly email — a
 * banner in the header, a picture on a section, a photo attached to a content
 * submission — is in the library by the time the upload returns, so next
 * year's secretary can find last year's spirit-night flyer without hunting
 * through sent emails for the blob URL.
 *
 * Two consequences follow from that, and both live in this file:
 *
 * - **Recording is idempotent per blob URL.** A `put()` mints a unique URL, so
 *   in practice this only guards a retried request, but the whole point of the
 *   library is that one file is one row.
 * - **Nothing else may delete a blob the library holds.** The email surfaces
 *   used to `del()` an image the moment a section replaced it or a submitter
 *   removed it; with the library cataloguing the same blob that would leave a
 *   dead thumbnail behind. Deletion is now the library's job alone, through
 *   `deleteBlobUnlessInLibrary` on the way out of an email surface and
 *   `getMediaUsage` on the way in to the library's own delete button.
 */

const VERCEL_BLOB_HOST = "blob.vercel-storage.com";

/**
 * Where a blob URL is still rendered — sections and headers of weekly emails,
 * images on a submitted content item, recurring section templates, and the
 * school's default header. Zero everywhere means the file is orphaned.
 */
const EMPTY_USAGE: MediaUsage = {
  sections: 0,
  headers: 0,
  contentImages: 0,
  recurring: 0,
  schoolHeaderDefault: false,
  total: 0,
};

export function emptyMediaUsage(): MediaUsage {
  return { ...EMPTY_USAGE };
}

/**
 * Adds an uploaded image to the school's media library, unless that exact blob
 * is already catalogued.
 *
 * Called from every upload route that produces an image a board member might
 * want again. Never throws for a duplicate — the caller has already stored the
 * blob somewhere useful and a library row is bookkeeping on top of that.
 */
export async function recordMediaLibraryUpload(input: {
  schoolId: string;
  blobUrl: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  altText?: string | null;
  linkUrl?: string | null;
  /** "email" | "calendar" | "event" | "direct" — see MediaSource. */
  sourceType?: string;
  /** The entity the image was uploaded for, when there is one. */
  sourceId?: string | null;
  uploadedBy?: string | null;
}) {
  const existing = await db.query.mediaLibrary.findFirst({
    where: and(
      eq(mediaLibrary.schoolId, input.schoolId),
      eq(mediaLibrary.blobUrl, input.blobUrl)
    ),
  });
  if (existing) return existing;

  const [item] = await db
    .insert(mediaLibrary)
    .values({
      schoolId: input.schoolId,
      blobUrl: input.blobUrl,
      fileName: input.fileName,
      fileSize: input.fileSize ?? undefined,
      mimeType: input.mimeType ?? undefined,
      altText: input.altText || input.fileName,
      linkUrl: input.linkUrl ?? undefined,
      tags: [],
      reusable: true,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? undefined,
      uploadedBy: input.uploadedBy ?? undefined,
    })
    .returning();

  return item;
}

/** True when this school's library already holds the blob. */
export async function isBlobInMediaLibrary(schoolId: string, blobUrl: string) {
  const row = await db.query.mediaLibrary.findFirst({
    where: and(
      eq(mediaLibrary.schoolId, schoolId),
      eq(mediaLibrary.blobUrl, blobUrl)
    ),
    columns: { id: true },
  });
  return Boolean(row);
}

/**
 * Deletes a blob from storage **only if the media library isn't cataloguing
 * it**. This is what an email surface calls when it stops pointing at an image
 * — replacing a section's picture, removing a submitted one. The file itself
 * now outlives the placement, and the library is where it gets thrown away.
 */
export async function deleteBlobUnlessInLibrary(
  schoolId: string,
  blobUrl: string | null | undefined
) {
  if (!blobUrl || !blobUrl.includes(VERCEL_BLOB_HOST)) return false;
  if (await isBlobInMediaLibrary(schoolId, blobUrl)) return false;

  try {
    await del(blobUrl);
  } catch {
    // Blob may already be gone; nothing downstream depends on this succeeding.
  }
  return true;
}

/**
 * Counts every place a set of blob URLs is still rendered, so the library can
 * say "this is in 2 emails" rather than deleting the file out from under them.
 */
export async function getMediaUsage(
  schoolId: string,
  blobUrls: string[]
): Promise<Map<string, MediaUsage>> {
  const usage = new Map<string, MediaUsage>();
  const urls = Array.from(new Set(blobUrls.filter(Boolean)));
  for (const url of urls) usage.set(url, emptyMediaUsage());
  if (urls.length === 0) return usage;

  const bump = (
    url: string | null,
    key: "sections" | "headers" | "contentImages" | "recurring",
    n: number
  ) => {
    if (!url) return;
    const entry = usage.get(url);
    if (!entry) return;
    entry[key] += n;
    entry.total += n;
  };

  const [sectionRows, headerRows, contentRows, recurringRows, school] =
    await Promise.all([
      db
        .select({
          url: emailSections.imageUrl,
          n: sql<number>`count(*)::int`,
        })
        .from(emailSections)
        .innerJoin(
          emailCampaigns,
          eq(emailSections.campaignId, emailCampaigns.id)
        )
        .where(
          and(
            eq(emailCampaigns.schoolId, schoolId),
            inArray(emailSections.imageUrl, urls)
          )
        )
        .groupBy(emailSections.imageUrl),
      db
        .select({
          url: emailCampaigns.headerImageUrl,
          n: sql<number>`count(*)::int`,
        })
        .from(emailCampaigns)
        .where(
          and(
            eq(emailCampaigns.schoolId, schoolId),
            inArray(emailCampaigns.headerImageUrl, urls)
          )
        )
        .groupBy(emailCampaigns.headerImageUrl),
      db
        .select({
          url: emailContentImages.blobUrl,
          n: sql<number>`count(*)::int`,
        })
        .from(emailContentImages)
        .innerJoin(
          emailContentItems,
          eq(emailContentImages.contentItemId, emailContentItems.id)
        )
        .where(
          and(
            eq(emailContentItems.schoolId, schoolId),
            inArray(emailContentImages.blobUrl, urls)
          )
        )
        .groupBy(emailContentImages.blobUrl),
      db
        .select({
          url: emailRecurringSections.imageUrl,
          n: sql<number>`count(*)::int`,
        })
        .from(emailRecurringSections)
        .where(
          and(
            eq(emailRecurringSections.schoolId, schoolId),
            inArray(emailRecurringSections.imageUrl, urls)
          )
        )
        .groupBy(emailRecurringSections.imageUrl),
      db.query.schools.findFirst({
        where: eq(schools.id, schoolId),
        columns: { emailSettings: true },
      }),
    ]);

  for (const row of sectionRows) bump(row.url, "sections", row.n);
  for (const row of headerRows) bump(row.url, "headers", row.n);
  for (const row of contentRows) bump(row.url, "contentImages", row.n);
  for (const row of recurringRows) bump(row.url, "recurring", row.n);

  const defaultHeader = school?.emailSettings?.headerImageUrl;
  if (defaultHeader) {
    const entry = usage.get(defaultHeader);
    if (entry) {
      entry.schoolHeaderDefault = true;
      entry.total += 1;
    }
  }

  return usage;
}

/** `getMediaUsage` for a single blob. */
export async function getMediaUsageFor(
  schoolId: string,
  blobUrl: string
): Promise<MediaUsage> {
  const usage = await getMediaUsage(schoolId, [blobUrl]);
  return usage.get(blobUrl) ?? emptyMediaUsage();
}
