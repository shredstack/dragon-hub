"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  emailCampaigns,
  emailRecurringSections,
  emailSections,
  schools,
} from "@/lib/db/schema";
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
import {
  DEFAULT_EMAIL_FOOTER_HTML,
  EMAIL_FOOTER_KEY,
  retokenizeRecurringTemplate,
} from "@/lib/email/footer";
import { getBoardRosterHtml } from "@/lib/email/board-roster";

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

// ─── The Footer ────────────────────────────────────────────────────────────

/**
 * Writes the school's footer — the block that ends every email.
 *
 * An upsert rather than an update-by-id because the footer is addressed by what
 * it *is*, not by a row the caller had to find first: a school that has never
 * created a campaign has no `board_signoff` row yet, and the secretary opening
 * Email Settings to write her footer should not have to press "add standard
 * sections" before she is allowed to.
 *
 * Position is deliberately not a parameter. The footer is last; a "footer" that
 * can be third from the top is just a recurring section, and there is already a
 * screen for those.
 */
export async function updateEmailFooter(data: {
  title: string;
  bodyTemplate: string;
  active: boolean;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  await db
    .insert(emailRecurringSections)
    .values({
      schoolId,
      key: EMAIL_FOOTER_KEY,
      title: data.title,
      bodyTemplate: data.bodyTemplate,
      audience: "all",
      positionType: "from_end",
      positionIndex: 0,
      defaultSortOrder: 99,
      active: data.active,
      updatedBy: user.id!,
    })
    .onConflictDoUpdate({
      target: [emailRecurringSections.schoolId, emailRecurringSections.key],
      set: {
        title: data.title,
        bodyTemplate: data.bodyTemplate,
        active: data.active,
        updatedBy: user.id!,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/emails/settings");
}

/** Puts the built-in wording back, without touching whether it's switched on. */
export async function resetEmailFooter() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  await db
    .update(emailRecurringSections)
    .set({
      title: "",
      bodyTemplate: DEFAULT_EMAIL_FOOTER_HTML,
      updatedBy: user.id!,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(emailRecurringSections.schoolId, schoolId),
        eq(emailRecurringSections.key, EMAIL_FOOTER_KEY)
      )
    );

  revalidatePath("/emails/settings");
}

/**
 * Promotes a block the secretary edited inside one week's email to the version
 * every future email starts with.
 *
 * This is the counterpart of `saveCampaignHeaderAsDefault` and exists for the
 * same reason: recurring sections are **snapshots**, so a footer fixed up in
 * Thursday's email was fixed up in Thursday's email only, and next week the old
 * one came back. It is a separate button from Save for that same reason in
 * reverse — a one-off "we're closed Friday" line added to the sign-off must not
 * quietly become the house footer.
 *
 * Existing campaigns are left alone, including drafts. Rewording the footer
 * cannot be allowed to rewrite the bottom of an email that already went out,
 * and "except the ones not sent yet" is a rule nobody can keep in their head.
 */
export async function saveSectionAsRecurringDefault(sectionId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const [section] = await db
    .select({
      title: emailSections.title,
      body: emailSections.body,
      linkUrl: emailSections.linkUrl,
      linkText: emailSections.linkText,
      imageUrl: emailSections.imageUrl,
      imagePosition: emailSections.imagePosition,
      imageWidth: emailSections.imageWidth,
      audience: emailSections.audience,
      recurringKey: emailSections.recurringKey,
    })
    .from(emailSections)
    .innerJoin(emailCampaigns, eq(emailSections.campaignId, emailCampaigns.id))
    .where(
      and(
        eq(emailSections.id, sectionId),
        eq(emailCampaigns.schoolId, schoolId)
      )
    )
    .limit(1);

  if (!section) throw new Error("Section not found");
  if (!section.recurringKey) {
    throw new Error("This section isn't a recurring one");
  }

  // The body in front of her has the roster expanded into eleven real names and
  // the year spelled out. Saving that verbatim would file today's board and
  // this year's year as fixed text.
  const [school, rosterHtml] = await Promise.all([
    db.query.schools.findFirst({
      where: eq(schools.id, schoolId),
      columns: { name: true, currentSchoolYear: true },
    }),
    getBoardRosterHtml(schoolId),
  ]);

  const { bodyTemplate, rosterLinked } = retokenizeRecurringTemplate(
    section.body,
    {
      schoolName: school?.name || "School",
      schoolYear: school?.currentSchoolYear,
      rosterHtml,
    }
  );

  const isFooter = section.recurringKey === EMAIL_FOOTER_KEY;

  await db
    .insert(emailRecurringSections)
    .values({
      schoolId,
      key: section.recurringKey,
      title: section.title,
      bodyTemplate,
      linkUrl: section.linkUrl,
      linkText: section.linkText,
      imageUrl: section.imageUrl,
      imagePosition: parseImagePosition(section.imagePosition),
      imageWidth: parseImageWidth(section.imageWidth),
      audience: section.audience,
      // Only reached when the row was deleted out from under the campaign that
      // still carries its key; last is the safe place for anything unplaced.
      positionType: "from_end",
      positionIndex: 0,
      defaultSortOrder: isFooter ? 99 : 0,
      updatedBy: user.id!,
    })
    .onConflictDoUpdate({
      target: [emailRecurringSections.schoolId, emailRecurringSections.key],
      set: {
        title: section.title,
        bodyTemplate,
        linkUrl: section.linkUrl,
        linkText: section.linkText,
        imageUrl: section.imageUrl,
        imagePosition: parseImagePosition(section.imagePosition),
        imageWidth: parseImageWidth(section.imageWidth),
        audience: section.audience,
        updatedBy: user.id!,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/emails/settings");
  // `rosterLinked` is false when she retyped the names by hand — the block is
  // saved either way, but the roster has stopped tracking the board and she
  // should hear that now rather than in November.
  return { isFooter, rosterLinked };
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
