"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
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

// ─── Content Item CRUD ─────────────────────────────────────────────────────

export async function submitEmailContent(data: {
  title: string;
  description?: string;
  linkUrl?: string;
  linkText?: string;
  audience?: EmailAudience;
  targetDate?: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const [contentItem] = await db
    .insert(emailContentItems)
    .values({
      schoolId,
      title: data.title,
      description: data.description || null,
      linkUrl: data.linkUrl || null,
      linkText: data.linkText || null,
      audience: data.audience || "all",
      targetDate: data.targetDate || null,
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
    targetDate: string | null;
    status: "pending" | "included" | "skipped";
  }>
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.linkUrl !== undefined && { linkUrl: data.linkUrl }),
      ...(data.linkText !== undefined && { linkText: data.linkText }),
      ...(data.audience !== undefined && { audience: data.audience }),
      ...(data.targetDate !== undefined && { targetDate: data.targetDate }),
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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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

  // Get next sort order
  const existingSections = await db.query.emailSections.findMany({
    where: eq(emailSections.campaignId, campaignId),
    orderBy: [desc(emailSections.sortOrder)],
    limit: 1,
  });
  const sortOrder = (existingSections[0]?.sortOrder ?? -1) + 1;

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

  // Mark content item as included
  await db
    .update(emailContentItems)
    .set({
      status: "included",
      includedInCampaignId: campaignId,
      updatedAt: new Date(),
    })
    .where(eq(emailContentItems.id, itemId));

  revalidatePath(`/emails/${campaignId}`);
  revalidatePath("/emails/submit");
  return section;
}

export async function skipContentItem(itemId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
