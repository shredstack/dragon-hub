"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { emailRecurringSections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { EmailAudience, SectionPositionType } from "@/types";
import {
  parseImagePosition,
  type EmailImagePosition,
} from "@/lib/email/image-position";
import {
  parseImageWidth,
  type EmailImageWidth,
} from "@/lib/email/image-width";
import { DEFAULT_RECURRING_SECTIONS } from "@/lib/email/recurring-defaults";

// ─── Recurring Section Management ──────────────────────────────────────────

export async function updateRecurringSection(
  sectionId: string,
  data: Partial<{
    title: string;
    bodyTemplate: string;
    linkUrl: string | null;
    linkText: string | null;
    imageUrl: string | null;
    imagePosition: EmailImagePosition;
    imageWidth: EmailImageWidth;
    audience: EmailAudience;
    positionType: SectionPositionType;
    positionIndex: number;
    defaultSortOrder: number;
    active: boolean;
  }>
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify section belongs to this school
  const section = await db.query.emailRecurringSections.findFirst({
    where: and(
      eq(emailRecurringSections.id, sectionId),
      eq(emailRecurringSections.schoolId, schoolId)
    ),
  });
  if (!section) throw new Error("Recurring section not found");

  await db
    .update(emailRecurringSections)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.bodyTemplate !== undefined && { bodyTemplate: data.bodyTemplate }),
      ...(data.linkUrl !== undefined && { linkUrl: data.linkUrl }),
      ...(data.linkText !== undefined && { linkText: data.linkText }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      ...(data.imagePosition !== undefined && {
        imagePosition: parseImagePosition(data.imagePosition),
      }),
      ...(data.imageWidth !== undefined && {
        imageWidth: parseImageWidth(data.imageWidth),
      }),
      ...(data.audience !== undefined && { audience: data.audience }),
      ...(data.positionType !== undefined && { positionType: data.positionType }),
      ...(data.positionIndex !== undefined && { positionIndex: data.positionIndex }),
      ...(data.defaultSortOrder !== undefined && {
        defaultSortOrder: data.defaultSortOrder,
      }),
      ...(data.active !== undefined && { active: data.active }),
      updatedBy: user.id!,
      updatedAt: new Date(),
    })
    .where(eq(emailRecurringSections.id, sectionId));

  revalidatePath("/emails/settings");
}

export async function toggleRecurringSectionActive(
  sectionId: string,
  active: boolean
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify section belongs to this school
  const section = await db.query.emailRecurringSections.findFirst({
    where: and(
      eq(emailRecurringSections.id, sectionId),
      eq(emailRecurringSections.schoolId, schoolId)
    ),
  });
  if (!section) throw new Error("Recurring section not found");

  await db
    .update(emailRecurringSections)
    .set({
      active,
      updatedBy: user.id!,
      updatedAt: new Date(),
    })
    .where(eq(emailRecurringSections.id, sectionId));

  revalidatePath("/emails/settings");
}

// ─── Seed Default Recurring Sections ───────────────────────────────────────

/**
 * Which of the standard sections this school is missing, by name.
 *
 * Names rather than a count because the board sees them before adding them —
 * a school that wrote its own "Join PTA" section under a different key would
 * otherwise be one blind click from having two of them.
 */
export async function listMissingDefaultRecurringSections() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const existing = await db.query.emailRecurringSections.findMany({
    where: eq(emailRecurringSections.schoolId, schoolId),
    columns: { key: true },
  });
  const have = new Set(existing.map((s) => s.key));

  return DEFAULT_RECURRING_SECTIONS.filter((s) => !have.has(s.key)).map((s) => ({
    key: s.key,
    // The sign-off has no title — it is the "Thanks again" block — so name it
    // for the list rather than showing an empty row.
    label: s.title || "Board roster and sign-off",
  }));
}

/**
 * Adds the standard recurring sections this school doesn't have yet.
 *
 * Per-key, not all-or-nothing. Refusing to run whenever *any* section existed
 * meant a school that wrote one section of its own could never get the board
 * sign-off — which is exactly how a school ended up sending emails with no
 * "Thanks again" and no board roster at the bottom. A school that deliberately
 * deleted one gets it back and can delete it again; a school that never had it
 * gets it, which is the case worth optimizing for.
 */
export async function seedDefaultRecurringSections(schoolId?: string) {
  const user = await assertAuthenticated();
  const targetSchoolId = schoolId || (await getCurrentSchoolId());
  if (!targetSchoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, targetSchoolId);

  const existingSections = await db.query.emailRecurringSections.findMany({
    where: eq(emailRecurringSections.schoolId, targetSchoolId),
    columns: { key: true },
  });
  const have = new Set(existingSections.map((s) => s.key));

  const missing = DEFAULT_RECURRING_SECTIONS.filter((s) => !have.has(s.key));
  if (missing.length === 0) return { added: 0 };

  await db.insert(emailRecurringSections).values(
    missing.map((section) => ({
      schoolId: targetSchoolId,
      key: section.key,
      title: section.title,
      bodyTemplate: section.bodyTemplate,
      audience: section.audience,
      positionType: section.positionType,
      positionIndex: section.positionIndex,
      defaultSortOrder: section.defaultSortOrder,
      updatedBy: user.id!,
    }))
  );

  revalidatePath("/emails/settings");
  return { added: missing.length };
}

export async function createRecurringSection(data: {
  key: string;
  title: string;
  bodyTemplate: string;
  linkUrl?: string;
  linkText?: string;
  imageUrl?: string;
  imagePosition?: EmailImagePosition;
  imageWidth?: EmailImageWidth;
  audience?: EmailAudience;
  positionType?: SectionPositionType;
  positionIndex?: number;
  defaultSortOrder?: number;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Check if key already exists
  const existing = await db.query.emailRecurringSections.findFirst({
    where: and(
      eq(emailRecurringSections.schoolId, schoolId),
      eq(emailRecurringSections.key, data.key)
    ),
  });
  if (existing) {
    throw new Error(`A recurring section with key "${data.key}" already exists`);
  }

  const [section] = await db
    .insert(emailRecurringSections)
    .values({
      schoolId,
      key: data.key,
      title: data.title,
      bodyTemplate: data.bodyTemplate,
      linkUrl: data.linkUrl || null,
      linkText: data.linkText || null,
      imageUrl: data.imageUrl || null,
      imagePosition: parseImagePosition(data.imagePosition),
      imageWidth: parseImageWidth(data.imageWidth),
      audience: data.audience || "all",
      positionType: data.positionType || "from_end",
      positionIndex: data.positionIndex ?? 0,
      defaultSortOrder: data.defaultSortOrder ?? 99,
      updatedBy: user.id!,
    })
    .returning();

  revalidatePath("/emails/settings");
  return section;
}

export async function deleteRecurringSection(sectionId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify section belongs to this school
  const section = await db.query.emailRecurringSections.findFirst({
    where: and(
      eq(emailRecurringSections.id, sectionId),
      eq(emailRecurringSections.schoolId, schoolId)
    ),
  });
  if (!section) throw new Error("Recurring section not found");

  await db
    .delete(emailRecurringSections)
    .where(eq(emailRecurringSections.id, sectionId));

  revalidatePath("/emails/settings");
}
