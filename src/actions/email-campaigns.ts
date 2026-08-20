"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  emailCampaigns,
  emailSections,
  emailContentItems,
  emailContentImages,
  calendarEvents,
  schools,
  ptaMinutes,
  mediaLibrary,
} from "@/lib/db/schema";
import {
  and,
  eq,
  gte,
  lte,
  asc,
  desc,
  inArray,
  type SQL,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { EmailAudience, EmailSectionType } from "@/types";
import { generateWeeklyEmail } from "@/lib/ai/email-generator";
import { compileEmailHtml } from "@/lib/email/template";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { getSchoolEmailHeaderDefault } from "@/lib/email/settings";
import { parseImagePosition, type EmailImagePosition } from "@/lib/email/image-position";
import {
  DEFAULT_EMAIL_HEADER_IMAGE_WIDTH,
  parseImageWidth,
  type EmailImageWidth,
} from "@/lib/email/image-width";
import {
  reviewEmailDraft as runEmailReview,
  type EmailReviewResult,
} from "@/lib/ai/email-review";
import { renderEmailHeaderPlainText } from "@/lib/email/header";
import { getBoardRoster } from "@/lib/email/board-roster";
import { attachRecurringSections } from "@/lib/email/recurring-attach";
import { reserveNewsSortOrders } from "@/lib/email/section-order";
import { formatDateOnlyRange } from "@/lib/date-only";

// ─── Submitted Content: Which Items Belong in Which Week ────────────────────

/**
 * Every submission whose relevance window overlaps this campaign's week.
 *
 * The overlap test — `start_date <= week_end AND end_date >= week_start` — is
 * the same one `isContentRelevantToWeek` runs client-side, expressed in SQL so
 * the pull-in doesn't have to load the school's whole inbox. It is an overlap
 * rather than a containment test on purpose: a one-day spirit night mid-week
 * and a month-long fundraiser spanning it are both this week's news.
 *
 * `status = 'pending'` is the eligibility gate. Nothing marks an item
 * "included" any more — an item runs for as many weeks as its window covers —
 * so the only ways out are the end date passing or the secretary marking it no
 * longer relevant (`skipped`). Legacy rows left at `included` by the old
 * one-shot behaviour stay out, which is what their board intended at the time.
 */
function relevantContentFilter(
  schoolId: string,
  week: { weekStart: string; weekEnd: string }
): SQL | undefined {
  return and(
    eq(emailContentItems.schoolId, schoolId),
    eq(emailContentItems.status, "pending"),
    lte(emailContentItems.startDate, week.weekEnd),
    gte(emailContentItems.endDate, week.weekStart)
  );
}

/**
 * Adds every relevant submission that isn't already in this campaign, as a
 * section at the end of the *news*. Returns how many it added.
 *
 * "Isn't already in this campaign" is decided by
 * `email_sections.source_content_item_id`, so running this twice is a no-op
 * and a clone doesn't duplicate what it copied. Note the consequence: a
 * section the secretary *deleted* can come back if she asks for a re-check.
 * That is the right trade — the button is opt-in, and the alternative is a
 * table of per-campaign dismissals for a problem she can solve by deleting it
 * again.
 *
 * "End of the news" rather than end of the email — the sign-off and the roster
 * stay last on a draft the secretary re-checks all week. That placement is
 * `reserveNewsSortOrders`, shared with the inbox's per-item "Add" button.
 */
async function attachRelevantContent(
  campaignId: string,
  schoolId: string,
  week: { weekStart: string; weekEnd: string }
): Promise<number> {
  const items = await db.query.emailContentItems.findMany({
    where: relevantContentFilter(schoolId, week),
    with: { images: { orderBy: [asc(emailContentImages.sortOrder)] } },
    orderBy: [asc(emailContentItems.startDate), asc(emailContentItems.createdAt)],
  });
  if (items.length === 0) return 0;

  const existing = await db.query.emailSections.findMany({
    where: eq(emailSections.campaignId, campaignId),
    columns: {
      id: true,
      sourceContentItemId: true,
      recurringKey: true,
      sortOrder: true,
    },
    orderBy: [asc(emailSections.sortOrder)],
  });
  const alreadyIn = new Set(
    existing.map((s) => s.sourceContentItemId).filter(Boolean) as string[]
  );

  const toAdd = items.filter((item) => !alreadyIn.has(item.id));
  if (toAdd.length === 0) return 0;

  let sortOrder = await reserveNewsSortOrders(campaignId, toAdd.length, existing);

  await db.insert(emailSections).values(
    toAdd.map((item) => ({
      campaignId,
      title: item.title,
      body: item.description || "",
      linkUrl: item.linkUrl,
      linkText: item.linkText,
      imageUrl: item.images[0]?.blobUrl || null,
      imageAlt: item.images[0]?.fileName || null,
      audience: item.audience,
      sectionType: "custom" as const,
      sortOrder: sortOrder++,
      // The submitter, not whoever created the campaign — this is their item.
      submittedBy: item.submittedBy,
      sourceContentItemId: item.id,
    }))
  );

  await db
    .update(emailContentItems)
    .set({ includedInCampaignId: campaignId, updatedAt: new Date() })
    .where(
      inArray(
        emailContentItems.id,
        toAdd.map((item) => item.id)
      )
    );

  return toAdd.length;
}

/**
 * Pulls in submissions that have become relevant since the email was created.
 *
 * The auto-attach at creation covers the normal case; this covers the two days
 * between drafting Thursday's email and sending it, when three more people
 * submit something.
 */
export async function syncRelevantContent(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const campaign = await assertCampaignInSchool(campaignId, schoolId);
  if (campaign.status === "sent") {
    throw new Error("This email has already been sent.");
  }

  const added = await attachRelevantContent(campaignId, schoolId, campaign);
  // Every path builds the same email: content first, then the recurring blocks
  // at their positions. Without this, a recurring section added since the draft
  // was started would never reach it.
  await attachRecurringSections(campaignId, schoolId);

  revalidatePath(`/emails/${campaignId}`);
  return { added };
}

/**
 * Puts the school's recurring blocks into a draft that predates them.
 *
 * Called when the editor opens, because the alternative is telling a secretary
 * her half-written email can only get its sign-off by being started over. It is
 * a no-op the moment every active recurring key is already in the campaign, so
 * the steady state costs two reads.
 *
 * Sent emails are left exactly as they were sent — the same rule
 * `syncRelevantContent` follows.
 *
 * It takes only the id and resolves the rest itself: this file is `use server`,
 * so every export is a callable endpoint and a caller-supplied `schoolId` would
 * be a caller-supplied authorization decision.
 */
export async function ensureCampaignRecurringSections(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return;
  await assertPtaBoardMember(user.id!, schoolId);

  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
    columns: { id: true, status: true },
  });
  if (!campaign || campaign.status === "sent") return;

  await attachRecurringSections(campaignId, schoolId);
}

// ─── Campaign CRUD ─────────────────────────────────────────────────────────

export async function createEmailCampaign(data: {
  title: string;
  weekStart: string;
  weekEnd: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // The header is snapshotted from the school default, never read through —
  // see src/lib/email/header.ts. Rewording the default next term must not
  // rewrite the header on an email that already went out.
  const header = await getSchoolEmailHeaderDefault(schoolId);

  const [campaign] = await db
    .insert(emailCampaigns)
    .values({
      schoolId,
      title: data.title,
      weekStart: data.weekStart,
      weekEnd: data.weekEnd,
      headerHtml: header.headerHtml,
      headerImageUrl: header.headerImageUrl,
      headerImageAlt: header.headerImageAlt,
      // Narrowed here rather than at render time: the column is NOT NULL, so
      // a school default written under an older slate must not become a value
      // the renderer has to guess at every week from now on.
      headerImageWidth: parseImageWidth(
        header.headerImageWidth,
        DEFAULT_EMAIL_HEADER_IMAGE_WIDTH
      ),
      createdBy: user.id!,
    })
    .returning();

  // Even an "empty" email starts with what people submitted for this week.
  // Working an inbox by hand was the job this replaces.
  await attachRelevantContent(campaign.id, schoolId, data);
  // ...and with the blocks that belong on every email — the board roster and
  // the sign-off. Last, because their positions are relative to the rest.
  await attachRecurringSections(campaign.id, schoolId);

  revalidatePath("/emails");
  return campaign;
}

/**
 * Starts next week's email as a copy of a previous one.
 *
 * Most weeks are the last week with three things changed, and rebuilding that
 * from an empty draft is the bulk of the work. The copy is a real copy — new
 * section rows, not a reference — so editing it cannot reach back into the
 * email that was already sent.
 *
 * `source_content_item_id` is carried across so the copied sections still
 * count as "already in this campaign", and the newly-relevant sweep that runs
 * afterwards doesn't file the same spirit night twice.
 */
export async function cloneEmailCampaign(
  sourceCampaignId: string,
  data: { title: string; weekStart: string; weekEnd: string }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const source = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, sourceCampaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
    with: { sections: { orderBy: [asc(emailSections.sortOrder)] } },
  });
  if (!source) throw new Error("The email you're copying was not found.");

  const [campaign] = await db
    .insert(emailCampaigns)
    .values({
      schoolId,
      title: data.title,
      weekStart: data.weekStart,
      weekEnd: data.weekEnd,
      // The header travels with the copy — it's part of what she's reusing.
      headerHtml: source.headerHtml,
      headerImageUrl: source.headerImageUrl,
      headerImageAlt: source.headerImageAlt,
      headerImageWidth: source.headerImageWidth,
      clonedFromCampaignId: source.id,
      createdBy: user.id!,
    })
    .returning();

  if (source.sections.length > 0) {
    await db.insert(emailSections).values(
      source.sections.map((section, index) => ({
        campaignId: campaign.id,
        title: section.title,
        body: section.body,
        linkUrl: section.linkUrl,
        linkText: section.linkText,
        imageUrl: section.imageUrl,
        imageAlt: section.imageAlt,
        imageLinkUrl: section.imageLinkUrl,
        imagePosition: section.imagePosition,
        imageWidth: section.imageWidth,
        sectionType: section.sectionType,
        recurringKey: section.recurringKey,
        audience: section.audience,
        sortOrder: index,
        submittedBy: section.submittedBy,
        sourceContentItemId: section.sourceContentItemId,
      }))
    );
  }

  // Then top it up with anything submitted for the new week that last week's
  // email didn't already carry, plus any recurring section added since.
  await attachRelevantContent(campaign.id, schoolId, data);
  await attachRecurringSections(campaign.id, schoolId);

  revalidatePath("/emails");
  return campaign;
}

/** The past emails offered as a starting point, newest first. */
export async function getCloneableCampaigns() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  return db
    .select({
      id: emailCampaigns.id,
      title: emailCampaigns.title,
      weekStart: emailCampaigns.weekStart,
      weekEnd: emailCampaigns.weekEnd,
      status: emailCampaigns.status,
      sentAt: emailCampaigns.sentAt,
    })
    .from(emailCampaigns)
    .where(eq(emailCampaigns.schoolId, schoolId))
    .orderBy(desc(emailCampaigns.createdAt))
    .limit(25);
}

export async function updateEmailCampaign(
  campaignId: string,
  data: Partial<{
    title: string;
    status: "draft" | "review" | "sent";
    ptaHtml: string;
    schoolHtml: string;
    /** "" is a deliberately blank header; null restores the built-in wording. */
    headerHtml: string | null;
    headerImageUrl: string | null;
    headerImageAlt: string | null;
    headerImageWidth: EmailImageWidth;
  }>
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify campaign belongs to this school
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");

  await db
    .update(emailCampaigns)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.ptaHtml !== undefined && { ptaHtml: data.ptaHtml }),
      ...(data.schoolHtml !== undefined && { schoolHtml: data.schoolHtml }),
      ...(data.headerHtml !== undefined && { headerHtml: data.headerHtml }),
      ...(data.headerImageUrl !== undefined && {
        headerImageUrl: data.headerImageUrl,
      }),
      ...(data.headerImageAlt !== undefined && {
        headerImageAlt: data.headerImageAlt,
      }),
      ...(data.headerImageWidth !== undefined && {
        headerImageWidth: parseImageWidth(
          data.headerImageWidth,
          DEFAULT_EMAIL_HEADER_IMAGE_WIDTH
        ),
      }),
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

  revalidatePath("/emails");
  revalidatePath(`/emails/${campaignId}`);
}

/**
 * Makes this email's header the one every future email starts with.
 *
 * A separate, deliberate act rather than a side effect of editing the header:
 * a one-off "Happy Thanksgiving week!" banner should not silently become the
 * house style. Existing campaigns keep their own snapshot either way.
 */
export async function saveCampaignHeaderAsDefault(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const campaign = await assertCampaignInSchool(campaignId, schoolId);

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { emailSettings: true },
  });

  await db
    .update(schools)
    .set({
      emailSettings: {
        ...(school?.emailSettings ?? {}),
        headerHtml: campaign.headerHtml ?? undefined,
        headerImageUrl: campaign.headerImageUrl ?? undefined,
        headerImageAlt: campaign.headerImageAlt ?? undefined,
        headerImageWidth: campaign.headerImageWidth,
      },
    })
    .where(eq(schools.id, schoolId));

  revalidatePath(`/emails/${campaignId}`);
  revalidatePath("/emails/settings");
}

/** Loads a campaign, failing if it belongs to another school. */
async function assertCampaignInSchool(campaignId: string, schoolId: string) {
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");
  return campaign;
}

/** Hides a campaign from the list while keeping what was sent, and when. */
export async function archiveEmailCampaign(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);
  await assertCampaignInSchool(campaignId, schoolId);

  await db
    .update(emailCampaigns)
    .set({ archivedAt: new Date(), archivedBy: user.id!, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  revalidatePath("/emails");
}

export async function restoreEmailCampaign(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);
  await assertCampaignInSchool(campaignId, schoolId);

  await db
    .update(emailCampaigns)
    .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  revalidatePath("/emails");
}

/**
 * Permanently delete a campaign. A campaign that has gone out is the record of
 * what the school was told and when, so once it is sent it can only be
 * archived — an unsent draft is still just a draft and deletes freely.
 */
export async function deleteEmailCampaign(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const campaign = await assertCampaignInSchool(campaignId, schoolId);

  if (campaign.sentAt) {
    throw new Error(
      `"${campaign.title}" was sent on ${campaign.sentAt.toLocaleDateString()}, so it's part of the school's record. ` +
        `Archive it instead — that clears it off the list without losing what went out.`
    );
  }

  await db.delete(emailCampaigns).where(eq(emailCampaigns.id, campaignId));

  revalidatePath("/emails");
}

// ─── Section Management ────────────────────────────────────────────────────

export async function addEmailSection(
  campaignId: string,
  data: {
    title: string;
    body: string;
    audience?: EmailAudience;
    sectionType?: EmailSectionType;
    linkUrl?: string;
    linkText?: string;
    imageUrl?: string;
    imageAlt?: string;
    imageLinkUrl?: string;
    imagePosition?: EmailImagePosition;
    imageWidth?: EmailImageWidth;
    recurringKey?: string;
    sortOrder?: number;
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify campaign belongs to this school
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");

  // Get next sort order if not provided. At the end of the *news*: a blank
  // section the secretary adds is something she is about to write, and it
  // belongs above the sign-off like every other piece of news.
  const sortOrder =
    data.sortOrder ?? (await reserveNewsSortOrders(campaignId, 1));

  const [section] = await db
    .insert(emailSections)
    .values({
      campaignId,
      title: data.title,
      body: data.body,
      audience: data.audience || "all",
      sectionType: data.sectionType || "custom",
      linkUrl: data.linkUrl || null,
      linkText: data.linkText || null,
      imageUrl: data.imageUrl || null,
      imageAlt: data.imageAlt || null,
      imageLinkUrl: data.imageLinkUrl || null,
      imagePosition: parseImagePosition(data.imagePosition),
      imageWidth: parseImageWidth(data.imageWidth),
      recurringKey: data.recurringKey || null,
      sortOrder,
      submittedBy: user.id!,
    })
    .returning();

  revalidatePath(`/emails/${campaignId}`);
  return section;
}

export async function updateEmailSection(
  sectionId: string,
  data: Partial<{
    title: string;
    body: string;
    linkUrl: string | null;
    linkText: string | null;
    imageUrl: string | null;
    imageAlt: string | null;
    imageLinkUrl: string | null;
    imagePosition: EmailImagePosition;
    imageWidth: EmailImageWidth;
    audience: EmailAudience;
    sortOrder: number;
  }>
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify section's campaign belongs to this school
  const section = await db.query.emailSections.findFirst({
    where: eq(emailSections.id, sectionId),
    with: { campaign: true },
  });
  if (!section) throw new Error("Section not found");
  if (section.campaign.schoolId !== schoolId)
    throw new Error("Section not found");

  await db
    .update(emailSections)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.body !== undefined && { body: data.body }),
      ...(data.linkUrl !== undefined && { linkUrl: data.linkUrl }),
      ...(data.linkText !== undefined && { linkText: data.linkText }),
      ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      ...(data.imageAlt !== undefined && { imageAlt: data.imageAlt }),
      ...(data.imageLinkUrl !== undefined && { imageLinkUrl: data.imageLinkUrl }),
      ...(data.imagePosition !== undefined && {
        imagePosition: parseImagePosition(data.imagePosition),
      }),
      ...(data.imageWidth !== undefined && {
        imageWidth: parseImageWidth(data.imageWidth),
      }),
      ...(data.audience !== undefined && { audience: data.audience }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      updatedAt: new Date(),
    })
    .where(eq(emailSections.id, sectionId));

  revalidatePath(`/emails/${section.campaignId}`);
}

export async function deleteEmailSection(sectionId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify section's campaign belongs to this school
  const section = await db.query.emailSections.findFirst({
    where: eq(emailSections.id, sectionId),
    with: { campaign: true },
  });
  if (!section) throw new Error("Section not found");
  if (section.campaign.schoolId !== schoolId)
    throw new Error("Section not found");

  await db.delete(emailSections).where(eq(emailSections.id, sectionId));

  revalidatePath(`/emails/${section.campaignId}`);
}

export async function reorderEmailSections(
  campaignId: string,
  sectionIds: string[]
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify campaign belongs to this school
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");

  // Update sort orders
  await Promise.all(
    sectionIds.map((sectionId, index) =>
      db
        .update(emailSections)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(
          and(
            eq(emailSections.id, sectionId),
            eq(emailSections.campaignId, campaignId)
          )
        )
    )
  );

  revalidatePath(`/emails/${campaignId}`);
}

// ─── AI Generation ─────────────────────────────────────────────────────────

export async function generateEmailDraft(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Get campaign details
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");

  // Get school info
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  if (!school) throw new Error("School not found");

  // Get calendar events for the week
  const weekStart = new Date(campaign.weekStart);
  const weekEnd = new Date(campaign.weekEnd);
  weekEnd.setHours(23, 59, 59, 999);

  const events = await db.query.calendarEvents.findMany({
    where: and(
      eq(calendarEvents.schoolId, schoolId),
      gte(calendarEvents.startTime, weekStart),
      lte(calendarEvents.startTime, weekEnd)
    ),
    orderBy: [asc(calendarEvents.startTime)],
  });

  // Get lookahead events (next 4 weeks after weekEnd)
  const lookaheadStart = new Date(campaign.weekEnd);
  lookaheadStart.setDate(lookaheadStart.getDate() + 1);
  const lookaheadEnd = new Date(lookaheadStart);
  lookaheadEnd.setDate(lookaheadEnd.getDate() + 28);

  const upcomingEvents = await db.query.calendarEvents.findMany({
    where: and(
      eq(calendarEvents.schoolId, schoolId),
      gte(calendarEvents.startTime, lookaheadStart),
      lte(calendarEvents.startTime, lookaheadEnd)
    ),
    orderBy: [asc(calendarEvents.startTime)],
  });

  // Get recent approved PTA minutes with AI analysis
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const recentMinutes = await db.query.ptaMinutes.findMany({
    where: and(
      eq(ptaMinutes.schoolId, schoolId),
      eq(ptaMinutes.status, "approved"),
      gte(ptaMinutes.createdAt, sixtyDaysAgo)
    ),
    columns: {
      id: true,
      meetingDate: true,
      aiSummary: true,
      aiKeyItems: true,
      aiActionItems: true,
    },
    orderBy: [desc(ptaMinutes.createdAt)],
    limit: 3,
  });

  // Only the submissions whose window covers this week — the same set an
  // empty or cloned email pulls in, so "generate with AI" and "start empty"
  // don't disagree about what this week's news is.
  const contentItems = await db.query.emailContentItems.findMany({
    where: relevantContentFilter(schoolId, campaign),
    with: { images: true },
  });

  // Get reusable media library items for AI image suggestions
  const mediaItems = await db.query.mediaLibrary.findMany({
    where: and(
      eq(mediaLibrary.schoolId, schoolId),
      eq(mediaLibrary.reusable, true)
    ),
    columns: {
      id: true,
      blobUrl: true,
      fileName: true,
      altText: true,
      tags: true,
    },
    orderBy: [desc(mediaLibrary.createdAt)],
    limit: 50, // Limit to most recent 50 to keep context manageable
  });

  // Context only — the sign-off itself is the `board_signoff` recurring
  // section, attached below. Labels rather than slugs, since this text goes
  // into a prompt whose output is read by families.
  const boardMembers = await getBoardRoster(schoolId);

  // Generate email with AI (recurring sections will be inserted programmatically)
  const generatedEmail = await generateWeeklyEmail({
    schoolName: school.name,
    weekStart: campaign.weekStart,
    weekEnd: campaign.weekEnd,
    timeZone: await getSchoolTimeZone(schoolId),
    calendarEvents: events.map((e) => ({
      title: e.title,
      startTime: e.startTime.toISOString(),
      timeZone: e.timeZone,
      allDay: e.allDay,
      description: e.description || undefined,
      location: e.location || undefined,
    })),
    contentItems: contentItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description || undefined,
      linkUrl: item.linkUrl || undefined,
      linkText: item.linkText || undefined,
      audience: item.audience,
      imageUrls: item.images.map((img) => img.blobUrl),
    })),
    boardMembers,
    lookaheadEvents: upcomingEvents.map((e) => ({
      title: e.title,
      startTime: e.startTime.toISOString(),
      timeZone: e.timeZone,
      allDay: e.allDay,
      description: e.description || undefined,
      location: e.location || undefined,
    })),
    recentMinutes: recentMinutes.map((m) => ({
      meetingDate: m.meetingDate,
      aiSummary: m.aiSummary,
      aiKeyItems: m.aiKeyItems,
      aiActionItems: m.aiActionItems,
    })),
    mediaLibraryItems: mediaItems.map((item) => ({
      id: item.id,
      url: item.blobUrl,
      fileName: item.fileName,
      altText: item.altText,
      tags: item.tags || [],
    })),
  });

  // Clear existing sections
  await db
    .delete(emailSections)
    .where(eq(emailSections.campaignId, campaignId));

  const generated = generatedEmail.sections;
  if (generated.length > 0) {
    await db.insert(emailSections).values(
      generated.map((section, i) => ({
        campaignId,
        title: section.title,
        body: section.body,
        linkUrl: section.linkUrl || null,
        linkText: section.linkText || null,
        imageUrl: section.imageUrl || null,
        imageAlt: section.imageAlt || null,
        audience: section.audience,
        sectionType: section.sectionType,
        recurringKey: section.recurringKey || null,
        sortOrder: i,
        submittedBy: user.id!,
        // What the AI wrote this section from, when it wrote it from a
        // submission. This is what stops "Check submissions" from adding a
        // second copy of everything the draft already covers.
        sourceContentItemId: section.sourceContentItemId || null,
      }))
    );
  }

  // The recurring blocks go on afterwards, through the same helper an empty or
  // cloned email uses — one implementation of "the roster goes last", not two.
  await attachRecurringSections(campaignId, schoolId);

  // Record where these went without taking them out of the running — an item
  // whose window spans a month belongs in all four of that month's emails.
  if (contentItems.length > 0) {
    await db
      .update(emailContentItems)
      .set({ includedInCampaignId: campaignId, updatedAt: new Date() })
      .where(
        inArray(
          emailContentItems.id,
          contentItems.map((item) => item.id)
        )
      );
  }

  revalidatePath(`/emails/${campaignId}`);
  revalidatePath("/emails");

  // Return suggestions for UI display
  return { suggestions: generatedEmail.suggestions };
}

// ─── HTML Compilation ──────────────────────────────────────────────────────

export async function compileAndSaveEmailHtml(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Get campaign with sections
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
    with: {
      sections: {
        orderBy: [asc(emailSections.sortOrder)],
      },
    },
  });
  if (!campaign) throw new Error("Campaign not found");

  // Get school info
  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
  });
  if (!school) throw new Error("School not found");

  // The campaign's own header snapshot, not the school default — see
  // src/lib/email/header.ts.
  const header = {
    headerHtml: campaign.headerHtml,
    headerImageUrl: campaign.headerImageUrl,
    headerImageAlt: campaign.headerImageAlt,
    headerImageWidth: campaign.headerImageWidth,
  };

  const toTemplateSection = (s: (typeof campaign.sections)[number]) => ({
    title: s.title,
    body: s.body,
    linkUrl: s.linkUrl || undefined,
    linkText: s.linkText || undefined,
    imageUrl: s.imageUrl || undefined,
    imageAlt: s.imageAlt || undefined,
    imageLinkUrl: s.imageLinkUrl || undefined,
    imagePosition: s.imagePosition,
    imageWidth: s.imageWidth,
  });

  // Compile PTA version (all sections)
  const ptaHtml = compileEmailHtml({
    schoolName: school.name,
    schoolLogoUrl: "", // TODO: Get from school settings
    header,
    sections: campaign.sections.map(toTemplateSection),
    audience: "pta_only",
  });

  // Compile school-wide version (exclude pta_only sections)
  const schoolSections = campaign.sections.filter((s) => s.audience === "all");
  const schoolHtml = compileEmailHtml({
    schoolName: school.name,
    schoolLogoUrl: "",
    header,
    sections: schoolSections.map(toTemplateSection),
    audience: "all",
  });

  // Save compiled HTML
  await db
    .update(emailCampaigns)
    .set({
      ptaHtml,
      schoolHtml,
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

  revalidatePath(`/emails/${campaignId}`);
  return { ptaHtml, schoolHtml };
}

// ─── Mark as Sent ──────────────────────────────────────────────────────────

export async function markCampaignSent(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  // Verify campaign belongs to this school
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");

  await db
    .update(emailCampaigns)
    .set({
      status: "sent",
      sentAt: new Date(),
      sentBy: user.id!,
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

  revalidatePath("/emails");
  revalidatePath(`/emails/${campaignId}`);
}

/**
 * Puts a campaign back into draft, clearing the record of who sent it and when.
 *
 * "Sent" is a bookmark somebody ticked, not something the app observed, so it
 * can be ticked by mistake — and while it stands, the campaign can only be
 * archived. Undoing it is what makes a test email (or a misclick) deletable
 * again. It returns to `draft` rather than to whatever it was before, because
 * nothing records that; the secretary can put it back in review.
 */
export async function markCampaignUnsent(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);
  await assertCampaignInSchool(campaignId, schoolId);

  await db
    .update(emailCampaigns)
    .set({
      status: "draft",
      sentAt: null,
      sentBy: null,
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

  revalidatePath("/emails");
  revalidatePath(`/emails/${campaignId}`);
}

// ─── AI Readability Review ─────────────────────────────────────────────────

/**
 * Reads the draft back and says what would make it easier to skim.
 *
 * Deliberately read-only. Nothing here writes to `email_sections` — the
 * secretary's draft is hers, and a button that lets AI overwrite what she has
 * been writing all afternoon is the one thing she doesn't want. It returns
 * notes; she applies the ones she agrees with.
 */
export async function reviewEmailDraft(
  campaignId: string
): Promise<EmailReviewResult> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);

  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
    with: { sections: { orderBy: [asc(emailSections.sortOrder)] } },
  });
  if (!campaign) throw new Error("Campaign not found");

  if (campaign.sections.length === 0) {
    throw new Error("There's nothing to review yet — add a section first.");
  }

  const school = await db.query.schools.findFirst({
    where: eq(schools.id, schoolId),
    columns: { name: true },
  });
  const schoolName = school?.name || "School";

  return runEmailReview({
    schoolName,
    title: campaign.title,
    weekLabel: formatDateOnlyRange(campaign.weekStart, campaign.weekEnd, {
      year: true,
    }),
    // The reviewer reads the same header a family will, greeting expanded.
    headerText: renderEmailHeaderPlainText({
      header: {
        headerHtml: campaign.headerHtml,
        headerImageUrl: campaign.headerImageUrl,
        headerImageAlt: campaign.headerImageAlt,
        headerImageWidth: campaign.headerImageWidth,
      },
      schoolName,
      audience: "all",
    }),
    sections: campaign.sections.map((section) => ({
      title: section.title,
      body: section.body,
      linkUrl: section.linkUrl || undefined,
      linkText: section.linkText || undefined,
      hasImage: Boolean(section.imageUrl),
      audience: section.audience,
    })),
  });
}
