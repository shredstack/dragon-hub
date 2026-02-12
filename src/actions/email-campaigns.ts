"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  emailCampaigns,
  emailSections,
  emailContentItems,
  emailRecurringSections,
  calendarEvents,
  schools,
  schoolMemberships,
  users,
  ptaMinutes,
} from "@/lib/db/schema";
import { and, eq, gte, lte, asc, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { EmailAudience, EmailSectionType } from "@/types";
import { generateWeeklyEmail } from "@/lib/ai/email-generator";
import { compileEmailHtml } from "@/lib/email/template";

// ─── Campaign CRUD ─────────────────────────────────────────────────────────

export async function createEmailCampaign(data: {
  title: string;
  weekStart: string;
  weekEnd: string;
}) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  const [campaign] = await db
    .insert(emailCampaigns)
    .values({
      schoolId,
      title: data.title,
      weekStart: data.weekStart,
      weekEnd: data.weekEnd,
      createdBy: user.id!,
    })
    .returning();

  revalidatePath("/emails");
  return campaign;
}

export async function updateEmailCampaign(
  campaignId: string,
  data: Partial<{
    title: string;
    status: "draft" | "review" | "sent";
    ptaHtml: string;
    schoolHtml: string;
  }>
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
      updatedAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

  revalidatePath("/emails");
  revalidatePath(`/emails/${campaignId}`);
}

export async function deleteEmailCampaign(campaignId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify campaign belongs to this school
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");

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
    recurringKey?: string;
    sortOrder?: number;
  }
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

  // Verify campaign belongs to this school
  const campaign = await db.query.emailCampaigns.findFirst({
    where: and(
      eq(emailCampaigns.id, campaignId),
      eq(emailCampaigns.schoolId, schoolId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");

  // Get next sort order if not provided
  let sortOrder = data.sortOrder;
  if (sortOrder === undefined) {
    const existingSections = await db.query.emailSections.findMany({
      where: eq(emailSections.campaignId, campaignId),
      orderBy: [desc(emailSections.sortOrder)],
      limit: 1,
    });
    sortOrder = (existingSections[0]?.sortOrder ?? -1) + 1;
  }

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
    audience: EmailAudience;
    sortOrder: number;
  }>
) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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

  // Get lookahead events (next 2 weeks after weekEnd)
  const lookaheadStart = new Date(campaign.weekEnd);
  lookaheadStart.setDate(lookaheadStart.getDate() + 1);
  const lookaheadEnd = new Date(lookaheadStart);
  lookaheadEnd.setDate(lookaheadEnd.getDate() + 14);

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

  // Get pending content items
  const contentItems = await db.query.emailContentItems.findMany({
    where: and(
      eq(emailContentItems.schoolId, schoolId),
      eq(emailContentItems.status, "pending")
    ),
    with: { images: true },
  });

  // Get active recurring sections
  const recurringSections = await db.query.emailRecurringSections.findMany({
    where: and(
      eq(emailRecurringSections.schoolId, schoolId),
      eq(emailRecurringSections.active, true)
    ),
    orderBy: [asc(emailRecurringSections.defaultSortOrder)],
  });

  // Get board members
  const boardMembers = await db
    .select({
      name: users.name,
      position: schoolMemberships.boardPosition,
    })
    .from(schoolMemberships)
    .innerJoin(users, eq(schoolMemberships.userId, users.id))
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.role, "pta_board"),
        eq(schoolMemberships.status, "approved")
      )
    );

  // Generate email with AI
  const generatedEmail = await generateWeeklyEmail({
    schoolName: school.name,
    weekStart: campaign.weekStart,
    weekEnd: campaign.weekEnd,
    calendarEvents: events.map((e) => ({
      title: e.title,
      startTime: e.startTime.toISOString(),
      description: e.description || undefined,
      location: e.location || undefined,
    })),
    contentItems: contentItems.map((item) => ({
      title: item.title,
      description: item.description || undefined,
      linkUrl: item.linkUrl || undefined,
      linkText: item.linkText || undefined,
      audience: item.audience,
      imageUrls: item.images.map((img) => img.blobUrl),
    })),
    recurringSections: recurringSections.map((s) => ({
      key: s.key,
      title: s.title,
      bodyTemplate: s.bodyTemplate,
      linkUrl: s.linkUrl || undefined,
      imageUrl: s.imageUrl || undefined,
      audience: s.audience,
    })),
    boardMembers: boardMembers.map((m) => ({
      name: m.name || "Board Member",
      position: m.position || "Member",
    })),
    // NEW: Lookahead events for suggestions
    lookaheadEvents: upcomingEvents.map((e) => ({
      title: e.title,
      startTime: e.startTime.toISOString(),
      description: e.description || undefined,
      location: e.location || undefined,
    })),
    // NEW: Recent minutes for suggestions
    recentMinutes: recentMinutes.map((m) => ({
      meetingDate: m.meetingDate,
      aiSummary: m.aiSummary,
      aiKeyItems: m.aiKeyItems,
      aiActionItems: m.aiActionItems,
    })),
  });

  // Clear existing sections
  await db
    .delete(emailSections)
    .where(eq(emailSections.campaignId, campaignId));

  // Insert generated sections
  for (let i = 0; i < generatedEmail.sections.length; i++) {
    const section = generatedEmail.sections[i];
    await db.insert(emailSections).values({
      campaignId,
      title: section.title,
      body: section.body,
      linkUrl: section.linkUrl || null,
      linkText: section.linkText || null,
      audience: section.audience,
      sectionType: section.sectionType,
      recurringKey: section.recurringKey || null,
      sortOrder: i,
      submittedBy: user.id!,
    });
  }

  // Mark included content items
  for (const item of contentItems) {
    await db
      .update(emailContentItems)
      .set({
        status: "included",
        includedInCampaignId: campaignId,
        updatedAt: new Date(),
      })
      .where(eq(emailContentItems.id, item.id));
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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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

  // Compile PTA version (all sections)
  const ptaHtml = compileEmailHtml({
    schoolName: school.name,
    schoolLogoUrl: "", // TODO: Get from school settings
    greeting: `Hi ${school.name} PTA Members,`,
    sections: campaign.sections.map((s) => ({
      title: s.title,
      body: s.body,
      linkUrl: s.linkUrl || undefined,
      linkText: s.linkText || undefined,
      imageUrl: s.imageUrl || undefined,
      imageAlt: s.imageAlt || undefined,
      imageLinkUrl: s.imageLinkUrl || undefined,
    })),
    audience: "pta_only",
  });

  // Compile school-wide version (exclude pta_only sections)
  const schoolSections = campaign.sections.filter((s) => s.audience === "all");
  const schoolHtml = compileEmailHtml({
    schoolName: school.name,
    schoolLogoUrl: "",
    greeting: `Hi ${school.name} Families,`,
    sections: schoolSections.map((s) => ({
      title: s.title,
      body: s.body,
      linkUrl: s.linkUrl || undefined,
      linkText: s.linkText || undefined,
      imageUrl: s.imageUrl || undefined,
      imageAlt: s.imageAlt || undefined,
      imageLinkUrl: s.imageLinkUrl || undefined,
    })),
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
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);

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
