"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  emailContentItems,
  emailContentImages,
  emailSections,
  emailCampaigns,
} from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { EmailAudience } from "@/types";
import { isInvalidContentWindow } from "@/lib/email/content-window";
import { reserveNewsSortOrders } from "@/lib/email/section-order";
import { toDateOnly } from "@/lib/date-only";

/**
 * The window is what makes a submission reach an email at all, so it is
 * validated on the server and not only in the form — the same reason
 * `normalizeEmoji()` runs in the action rather than in the picker.
 */
function assertValidWindow(startDate: string, endDate: string) {
  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  if (!start || !end) {
    throw new Error(
      "Both a start date and an end date are required — they decide which weeks this appears in."
    );
  }
  if (isInvalidContentWindow({ startDate: start, endDate: end })) {
    throw new Error(
      "The end date is before the start date, so this would never appear in an email."
    );
  }
  return { start, end };
}

// ─── Content Item CRUD ─────────────────────────────────────────────────────

export async function submitEmailContent(data: {
  title: string;
  description?: string;
  linkUrl?: string;
  linkText?: string;
  audience?: EmailAudience;
  /** First week this should go out in. */
  startDate: string;
  /** After this it has happened; it drops out on its own. */
  endDate: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const { start, end } = assertValidWindow(data.startDate, data.endDate);

  const [contentItem] = await db
    .insert(emailContentItems)
    .values({
      schoolId,
      title: data.title,
      description: data.description || null,
      linkUrl: data.linkUrl || null,
      linkText: data.linkText || null,
      audience: data.audience || "all",
      startDate: start,
      endDate: end,
      submittedBy: user.id!,
    })
    .returning();

  revalidatePath("/emails/submit");
  revalidatePath("/emails");
  return contentItem;
}

export async function updateContentItem(
  itemId: string,
  data: Partial<{
    title: string;
    description: string | null;
    linkUrl: string | null;
    linkText: string | null;
    audience: EmailAudience;
    startDate: string;
    endDate: string;
    status: "pending" | "included" | "skipped";
  }>
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify content item belongs to this school
  const item = await db.query.emailContentItems.findFirst({
    where: and(
      eq(emailContentItems.id, itemId),
      eq(emailContentItems.schoolId, schoolId)
    ),
  });
  if (!item) throw new Error("Content item not found");

  // Either end of the window can be edited alone, so validate the result of
  // the edit rather than what was submitted.
  if (data.startDate !== undefined || data.endDate !== undefined) {
    assertValidWindow(
      data.startDate ?? item.startDate,
      data.endDate ?? item.endDate
    );
  }

  await db
    .update(emailContentItems)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.linkUrl !== undefined && { linkUrl: data.linkUrl }),
      ...(data.linkText !== undefined && { linkText: data.linkText }),
      ...(data.audience !== undefined && { audience: data.audience }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.endDate !== undefined && { endDate: data.endDate }),
      ...(data.status !== undefined && { status: data.status }),
      updatedAt: new Date(),
    })
    .where(eq(emailContentItems.id, itemId));

  revalidatePath("/emails/submit");
  revalidatePath("/emails");
}

export async function deleteContentItem(itemId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify content item belongs to this school
  const item = await db.query.emailContentItems.findFirst({
    where: and(
      eq(emailContentItems.id, itemId),
      eq(emailContentItems.schoolId, schoolId)
    ),
  });
  if (!item) throw new Error("Content item not found");

  // Cascade delete handles images
  await db.delete(emailContentItems).where(eq(emailContentItems.id, itemId));

  revalidatePath("/emails/submit");
  revalidatePath("/emails");
}

// ─── Include Content in Campaign ───────────────────────────────────────────

export async function includeContentInCampaign(
  itemId: string,
  campaignId: string
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify content item belongs to this school
  const item = await db.query.emailContentItems.findFirst({
    where: and(
      eq(emailContentItems.id, itemId),
      eq(emailContentItems.schoolId, schoolId)
    ),
    with: { images: true },
  });
  if (!item) throw new Error("Content item not found");

  // Verify campaign belongs to this school
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");

  // Already in this email? Hand back the section that's there rather than a
  // second copy of it. Every relevant submission is attached automatically at
  // creation and nothing marks an item "included" any more, so the inbox is a
  // list of what arrived, not a list of what's missing — this button is one
  // click away from putting the same spirit night in front of families twice.
  const existing = await db.query.emailSections.findFirst({
    where: and(
      eq(emailSections.campaignId, campaignId),
      eq(emailSections.sourceContentItemId, itemId)
    ),
  });
  if (existing) return existing;

  // At the end of the *news*, not the end of the email — otherwise the item
  // she just added lands below "Thanks again, <School> PTA Board".
  const sortOrder = await reserveNewsSortOrders(campaignId, 1);

  // Create section from content item
  const [section] = await db
    .insert(emailSections)
    .values({
      campaignId,
      title: item.title,
      body: item.description || "",
      linkUrl: item.linkUrl,
      linkText: item.linkText,
      imageUrl: item.images[0]?.blobUrl || null,
      imageAlt: item.images[0]?.fileName || null,
      audience: item.audience,
      sectionType: "custom",
      sortOrder,
      submittedBy: item.submittedBy,
      sourceContentItemId: item.id,
    })
    .returning();

  // Record where it went, but leave `status` alone: an item whose window
  // spans a month belongs in all four of that month's emails, and flipping it
  // to "included" here is what used to make it a one-shot.
  await db
    .update(emailContentItems)
    .set({
      includedInCampaignId: campaignId,
      updatedAt: new Date(),
    })
    .where(eq(emailContentItems.id, itemId));

  revalidatePath(`/emails/${campaignId}`);
  revalidatePath("/emails/submit");
  return section;
}

/**
 * "No longer relevant" — the secretary's override for something whose window
 * is still open but which shouldn't run again: it was cancelled, or it was
 * entered wrong. This is the only thing that takes an item out of the running
 * before its end date; deleting a *section* only removes it from one email.
 */
export async function skipContentItem(itemId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify content item belongs to this school
  const item = await db.query.emailContentItems.findFirst({
    where: and(
      eq(emailContentItems.id, itemId),
      eq(emailContentItems.schoolId, schoolId)
    ),
  });
  if (!item) throw new Error("Content item not found");

  await db
    .update(emailContentItems)
    .set({
      status: "skipped",
      updatedAt: new Date(),
    })
    .where(eq(emailContentItems.id, itemId));

  revalidatePath("/emails/submit");
  revalidatePath("/emails");
}

// ─── Image Management ──────────────────────────────────────────────────────

export async function addContentImage(
  contentItemId: string,
  data: {
    blobUrl: string;
    fileName: string;
    fileSize?: number;
    linkUrl?: string;
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify content item belongs to this school
  const item = await db.query.emailContentItems.findFirst({
    where: and(
      eq(emailContentItems.id, contentItemId),
      eq(emailContentItems.schoolId, schoolId)
    ),
  });
  if (!item) throw new Error("Content item not found");

  // Get next sort order
  const existingImages = await db.query.emailContentImages.findMany({
    where: eq(emailContentImages.contentItemId, contentItemId),
    orderBy: [desc(emailContentImages.sortOrder)],
    limit: 1,
  });
  const sortOrder = (existingImages[0]?.sortOrder ?? -1) + 1;

  const [image] = await db
    .insert(emailContentImages)
    .values({
      contentItemId,
      blobUrl: data.blobUrl,
      fileName: data.fileName,
      fileSize: data.fileSize || null,
      linkUrl: data.linkUrl || null,
      sortOrder,
      uploadedBy: user.id!,
    })
    .returning();

  revalidatePath("/emails/submit");
  return image;
}

export async function removeContentImage(imageId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify image's content item belongs to this school
  const image = await db.query.emailContentImages.findFirst({
    where: eq(emailContentImages.id, imageId),
    with: { contentItem: true },
  });
  if (!image) throw new Error("Image not found");
  if (image.contentItem.schoolId !== schoolId)
    throw new Error("Image not found");

  await db.delete(emailContentImages).where(eq(emailContentImages.id, imageId));

  revalidatePath("/emails/submit");
}

export async function reorderContentImages(
  contentItemId: string,
  imageIds: string[]
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify content item belongs to this school
  const item = await db.query.emailContentItems.findFirst({
    where: and(
      eq(emailContentItems.id, contentItemId),
      eq(emailContentItems.schoolId, schoolId)
    ),
  });
  if (!item) throw new Error("Content item not found");

  // Update sort orders
  await Promise.all(
    imageIds.map((imageId, index) =>
      db
        .update(emailContentImages)
        .set({ sortOrder: index })
        .where(
          and(
            eq(emailContentImages.id, imageId),
            eq(emailContentImages.contentItemId, contentItemId)
          )
        )
    )
  );

  revalidatePath("/emails/submit");
}
