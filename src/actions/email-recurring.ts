"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { emailRecurringSections } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { EmailAudience } from "@/types";

// ─── Recurring Section Management ──────────────────────────────────────────

export async function updateRecurringSection(
  sectionId: string,
  data: Partial<{
    title: string;
    bodyTemplate: string;
    linkUrl: string | null;
    linkText: string | null;
    imageUrl: string | null;
    audience: EmailAudience;
    defaultSortOrder: number;
    active: boolean;
  }>
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
      ...(data.audience !== undefined && { audience: data.audience }),
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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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

const DEFAULT_RECURRING_SECTIONS = [
  {
    key: "join_pta",
    title:
      "Join PTA -- Please encourage others to join, share this link with Grandparents, Spouses, Friends",
    bodyTemplate: `<p><a href="{{membership_link}}">{{membership_link}}</a></p>
<p><strong>We now have {{member_count}} members! Thank you for joining. Please encourage others. Our goal is 300 members.</strong></p>`,
    audience: "all" as EmailAudience,
    defaultSortOrder: 80,
  },
  {
    key: "volunteer",
    title:
      "VOLUNTEER OPPORTUNITIES - we list all volunteer sign-ups here on our linktree",
    bodyTemplate: `<p><a href="{{linktree_url}}"><strong>{{linktree_url}}</strong></a></p>
<p><strong>Also follow us on instagram @draperelementarypta</strong></p>`,
    audience: "all" as EmailAudience,
    defaultSortOrder: 90,
  },
  {
    key: "yearbook",
    title: "YEARBOOK -- BUY YOUR BOOK",
    bodyTemplate: `<p>If you signed a social media opt-out form, please remember that it also applies to the yearbook <strong>unless</strong> you speak with the Principal. Students with a media opt-out cannot be included in the yearbook.</p>
<p><strong>Don't miss out—order your yearbook now!</strong> <a href="{{yearbook_link}}">{{yearbook_link}}</a></p>`,
    audience: "all" as EmailAudience,
    defaultSortOrder: 85,
  },
  {
    key: "board_signoff",
    title: "",
    bodyTemplate: `<p>Thanks again,</p>
<p>{{school_name}} PTA Board {{school_year}}</p>
{{board_roster}}`,
    audience: "all" as EmailAudience,
    defaultSortOrder: 100,
  },
];

export async function seedDefaultRecurringSections(schoolId?: string) {
  const user = await assertAuthenticated();
  const targetSchoolId = schoolId || (await getCurrentSchoolId());
  if (!targetSchoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, targetSchoolId);

  // Check if sections already exist for this school
  const existingSections = await db.query.emailRecurringSections.findMany({
    where: eq(emailRecurringSections.schoolId, targetSchoolId),
  });

  if (existingSections.length > 0) {
    throw new Error(
      "Recurring sections already exist for this school. Use update instead."
    );
  }

  // Insert default sections
  await db.insert(emailRecurringSections).values(
    DEFAULT_RECURRING_SECTIONS.map((section) => ({
      schoolId: targetSchoolId,
      key: section.key,
      title: section.title,
      bodyTemplate: section.bodyTemplate,
      audience: section.audience,
      defaultSortOrder: section.defaultSortOrder,
      updatedBy: user.id!,
    }))
  );

  revalidatePath("/emails/settings");
}

export async function createRecurringSection(data: {
  key: string;
  title: string;
  bodyTemplate: string;
  linkUrl?: string;
  linkText?: string;
  imageUrl?: string;
  audience?: EmailAudience;
  defaultSortOrder?: number;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
      audience: data.audience || "all",
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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
