"use server";

import {
  assertAuthenticated,
  assertSchoolPtaBoardOrAdmin,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  eventCatalog,
  eventPlans,
  schools,
  volunteerCampaignEvents,
  volunteerCampaigns,
  volunteerInterests,
} from "@/lib/db/schema";
import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { getAppBaseUrl } from "@/lib/magic-link";
import {
  linkExistingAccountToSchool,
  normalizeContact,
  sendWelcomeEmail,
} from "@/lib/volunteer-onboarding";
import { formatPhoneNumber } from "@/lib/utils";

export type CampaignStatus = "draft" | "active" | "closed";
export type InterestLevel = "interested" | "lead";

// ─── Authorization ─────────────────────────────────────────────────────────

/**
 * Campaigns are run by whichever board member owns the event, so this is
 * board-wide rather than scoped to a position. Returns the acting user and the
 * school so callers don't repeat the lookup.
 */
async function assertCampaignManager() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertSchoolPtaBoardOrAdmin(user.id!, schoolId);
  return { userId: user.id!, schoolId };
}

/** Loads a campaign, failing if it belongs to another school. */
async function assertCampaignInSchool(campaignId: string, schoolId: string) {
  const campaign = await db.query.volunteerCampaigns.findFirst({
    where: and(
      eq(volunteerCampaigns.id, campaignId),
      eq(volunteerCampaigns.schoolId, schoolId)
    ),
  });
  if (!campaign) throw new Error("Campaign not found");
  return campaign;
}

/** Resolves a campaign event to its campaign, failing across school boundaries. */
async function assertCampaignEventInSchool(eventId: string, schoolId: string) {
  const event = await db.query.volunteerCampaignEvents.findFirst({
    where: eq(volunteerCampaignEvents.id, eventId),
    with: { campaign: true },
  });
  if (!event || event.campaign.schoolId !== schoolId) {
    throw new Error("Event not found");
  }
  return event;
}

function revalidateCampaign(campaignId: string) {
  revalidatePath("/admin/volunteer-campaigns");
  revalidatePath(`/admin/volunteer-campaigns/${campaignId}`);
}

// ─── Campaign CRUD ─────────────────────────────────────────────────────────

export interface CampaignInput {
  title: string;
  intro?: string;
  status?: CampaignStatus;
  showOnRoomParentSignup?: boolean;
  ownerPosition?: string | null;
  contactEmail?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
}

/**
 * Only one campaign per school/year can ride along on the room parent signup
 * page — otherwise Back to School Night turns into a wall of checkboxes. Newest
 * flag wins; the others are switched off.
 */
async function clearOtherRoomParentAddons(
  schoolId: string,
  schoolYear: string,
  keepCampaignId: string
) {
  await db
    .update(volunteerCampaigns)
    .set({ showOnRoomParentSignup: false, updatedAt: new Date() })
    .where(
      and(
        eq(volunteerCampaigns.schoolId, schoolId),
        eq(volunteerCampaigns.schoolYear, schoolYear),
        eq(volunteerCampaigns.showOnRoomParentSignup, true),
        ne(volunteerCampaigns.id, keepCampaignId)
      )
    );
}

export async function createCampaign(data: CampaignInput) {
  const { userId, schoolId } = await assertCampaignManager();
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const title = data.title.trim();
  if (!title) throw new Error("Please give the campaign a title.");

  const [campaign] = await db
    .insert(volunteerCampaigns)
    .values({
      schoolId,
      qrCode: nanoid(12),
      title,
      intro: data.intro?.trim() || null,
      schoolYear,
      status: data.status ?? "draft",
      showOnRoomParentSignup: data.showOnRoomParentSignup ?? false,
      ownerPosition: (data.ownerPosition as never) || null,
      contactEmail: data.contactEmail?.trim().toLowerCase() || null,
      opensAt: data.opensAt ? new Date(data.opensAt) : null,
      closesAt: data.closesAt ? new Date(data.closesAt) : null,
      createdBy: userId,
    })
    .returning();

  if (campaign.showOnRoomParentSignup) {
    await clearOtherRoomParentAddons(schoolId, schoolYear, campaign.id);
  }

  revalidateCampaign(campaign.id);
  return campaign;
}

export async function updateCampaign(campaignId: string, data: CampaignInput) {
  const { schoolId } = await assertCampaignManager();
  const existing = await assertCampaignInSchool(campaignId, schoolId);

  await db
    .update(volunteerCampaigns)
    .set({
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.intro !== undefined && { intro: data.intro?.trim() || null }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.showOnRoomParentSignup !== undefined && {
        showOnRoomParentSignup: data.showOnRoomParentSignup,
      }),
      ...(data.ownerPosition !== undefined && {
        ownerPosition: (data.ownerPosition as never) || null,
      }),
      ...(data.contactEmail !== undefined && {
        contactEmail: data.contactEmail?.trim().toLowerCase() || null,
      }),
      ...(data.opensAt !== undefined && {
        opensAt: data.opensAt ? new Date(data.opensAt) : null,
      }),
      ...(data.closesAt !== undefined && {
        closesAt: data.closesAt ? new Date(data.closesAt) : null,
      }),
      updatedAt: new Date(),
    })
    .where(eq(volunteerCampaigns.id, campaignId));

  if (data.showOnRoomParentSignup) {
    await clearOtherRoomParentAddons(schoolId, existing.schoolYear, campaignId);
  }

  revalidateCampaign(campaignId);
  revalidatePath("/volunteer-signup", "layout");
}

export async function deleteCampaign(campaignId: string) {
  const { schoolId } = await assertCampaignManager();
  await assertCampaignInSchool(campaignId, schoolId);

  await db
    .delete(volunteerCampaigns)
    .where(eq(volunteerCampaigns.id, campaignId));

  revalidatePath("/admin/volunteer-campaigns");
}

/** Invalidates the old QR code — any printed poster stops working. */
export async function regenerateCampaignQrCode(campaignId: string) {
  const { schoolId } = await assertCampaignManager();
  await assertCampaignInSchool(campaignId, schoolId);

  const qrCode = nanoid(12);
  await db
    .update(volunteerCampaigns)
    .set({ qrCode, updatedAt: new Date() })
    .where(eq(volunteerCampaigns.id, campaignId));

  revalidateCampaign(campaignId);
  return { qrCode };
}

// ─── Campaign Events ───────────────────────────────────────────────────────

export interface CampaignEventInput {
  title: string;
  description?: string | null;
  volunteerResponsibilities?: string | null;
  typicalTiming?: string | null;
  timeCommitment?: string | null;
  iconEmoji?: string | null;
  imageUrl?: string | null;
  eventPlanId?: string | null;
}

export async function addCampaignEvent(
  campaignId: string,
  data: CampaignEventInput
) {
  const { schoolId } = await assertCampaignManager();
  await assertCampaignInSchool(campaignId, schoolId);

  const title = data.title.trim();
  if (!title) throw new Error("Please give the event a name.");

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${volunteerCampaignEvents.sortOrder}), -1)::int` })
    .from(volunteerCampaignEvents)
    .where(eq(volunteerCampaignEvents.campaignId, campaignId));

  const [event] = await db
    .insert(volunteerCampaignEvents)
    .values({
      campaignId,
      title,
      description: data.description?.trim() || null,
      volunteerResponsibilities: data.volunteerResponsibilities?.trim() || null,
      typicalTiming: data.typicalTiming?.trim() || null,
      timeCommitment: data.timeCommitment?.trim() || null,
      iconEmoji: data.iconEmoji?.trim() || null,
      imageUrl: data.imageUrl?.trim() || null,
      eventPlanId: data.eventPlanId || null,
      sortOrder: maxOrder + 1,
    })
    .returning();

  revalidateCampaign(campaignId);
  return event;
}

export async function updateCampaignEvent(
  eventId: string,
  data: Partial<CampaignEventInput>
) {
  const { schoolId } = await assertCampaignManager();
  const event = await assertCampaignEventInSchool(eventId, schoolId);

  await db
    .update(volunteerCampaignEvents)
    .set({
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.description !== undefined && {
        description: data.description?.trim() || null,
      }),
      ...(data.volunteerResponsibilities !== undefined && {
        volunteerResponsibilities: data.volunteerResponsibilities?.trim() || null,
      }),
      ...(data.typicalTiming !== undefined && {
        typicalTiming: data.typicalTiming?.trim() || null,
      }),
      ...(data.timeCommitment !== undefined && {
        timeCommitment: data.timeCommitment?.trim() || null,
      }),
      ...(data.iconEmoji !== undefined && {
        iconEmoji: data.iconEmoji?.trim() || null,
      }),
      ...(data.imageUrl !== undefined && {
        imageUrl: data.imageUrl?.trim() || null,
      }),
      ...(data.eventPlanId !== undefined && { eventPlanId: data.eventPlanId || null }),
      updatedAt: new Date(),
    })
    .where(eq(volunteerCampaignEvents.id, eventId));

  revalidateCampaign(event.campaignId);
}

export async function deleteCampaignEvent(eventId: string) {
  const { schoolId } = await assertCampaignManager();
  const event = await assertCampaignEventInSchool(eventId, schoolId);

  await db
    .delete(volunteerCampaignEvents)
    .where(eq(volunteerCampaignEvents.id, eventId));

  revalidateCampaign(event.campaignId);
}

export async function reorderCampaignEvents(
  campaignId: string,
  orderedEventIds: string[]
) {
  const { schoolId } = await assertCampaignManager();
  await assertCampaignInSchool(campaignId, schoolId);

  if (orderedEventIds.length === 0) return;

  // One statement rather than one UPDATE per event: a drag-and-drop reorder
  // rewrites every row, so N round trips (and N row locks held concurrently)
  // add up fast on a campaign with a long event list.
  const orderCases = sql.join(
    orderedEventIds.map(
      (id, index) => sql`when ${volunteerCampaignEvents.id} = ${id} then ${index}`
    ),
    sql` `
  );

  await db
    .update(volunteerCampaignEvents)
    .set({
      sortOrder: sql`case ${orderCases} else ${volunteerCampaignEvents.sortOrder} end`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(volunteerCampaignEvents.campaignId, campaignId),
        inArray(volunteerCampaignEvents.id, orderedEventIds)
      )
    );

  revalidateCampaign(campaignId);
}

/**
 * Copies event catalog entries in as campaign events. The catalog is
 * institutional knowledge keyed one-row-per-event-type, so this snapshots the
 * copy rather than referencing it live — the board can then rewrite the blurb
 * for this year's flyer without touching the catalog.
 */
export async function importEventsFromCatalog(
  campaignId: string,
  catalogIds: string[]
) {
  const { schoolId } = await assertCampaignManager();
  await assertCampaignInSchool(campaignId, schoolId);
  if (catalogIds.length === 0) return { imported: 0 };

  const entries = await db.query.eventCatalog.findMany({
    where: and(
      eq(eventCatalog.schoolId, schoolId),
      inArray(eventCatalog.id, catalogIds)
    ),
  });

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${volunteerCampaignEvents.sortOrder}), -1)::int` })
    .from(volunteerCampaignEvents)
    .where(eq(volunteerCampaignEvents.campaignId, campaignId));

  if (entries.length === 0) return { imported: 0 };

  await db.insert(volunteerCampaignEvents).values(
    entries.map((entry, index) => ({
      campaignId,
      title: entry.title,
      description: entry.description,
      // keyTasks is a JSON array of strings in the catalog; render it as a
      // readable list so the board has a starting point to edit down.
      volunteerResponsibilities: formatKeyTasks(entry.keyTasks),
      typicalTiming: entry.typicalTiming,
      eventCatalogId: entry.id,
      sortOrder: maxOrder + 1 + index,
    }))
  );

  revalidateCampaign(campaignId);
  return { imported: entries.length };
}

function formatKeyTasks(keyTasks: string | null): string | null {
  if (!keyTasks) return null;
  try {
    const parsed = JSON.parse(keyTasks);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((task) => `• ${String(task)}`).join("\n");
  } catch {
    // Not valid JSON — surface it as-is rather than dropping the content.
    return keyTasks;
  }
}

// ─── Admin Queries ─────────────────────────────────────────────────────────

export async function getCampaigns() {
  const { schoolId } = await assertCampaignManager();

  const campaigns = await db.query.volunteerCampaigns.findMany({
    where: eq(volunteerCampaigns.schoolId, schoolId),
    orderBy: [desc(volunteerCampaigns.createdAt)],
    with: { events: true },
  });

  if (campaigns.length === 0) return [];

  // One grouped count instead of a query per campaign.
  const interestCounts = await db
    .select({
      campaignId: volunteerInterests.campaignId,
      total: count(),
    })
    .from(volunteerInterests)
    .where(
      and(
        eq(volunteerInterests.schoolId, schoolId),
        eq(volunteerInterests.status, "active")
      )
    )
    .groupBy(volunteerInterests.campaignId);

  const countMap = new Map(interestCounts.map((c) => [c.campaignId, c.total]));

  return campaigns.map((campaign) => ({
    ...campaign,
    eventCount: campaign.events.length,
    interestCount: countMap.get(campaign.id) ?? 0,
  }));
}

export async function getCampaignDetail(campaignId: string) {
  const { schoolId } = await assertCampaignManager();
  await assertCampaignInSchool(campaignId, schoolId);

  const campaign = await db.query.volunteerCampaigns.findFirst({
    where: eq(volunteerCampaigns.id, campaignId),
    with: {
      events: {
        orderBy: [
          asc(volunteerCampaignEvents.sortOrder),
          asc(volunteerCampaignEvents.title),
        ],
        with: { eventPlan: { columns: { id: true, title: true } } },
      },
      // Interests are deliberately not loaded here — the page reads them from
      // `getCampaignRoster`, and eager-loading every response would grow
      // unbounded as a campaign collects sign-ups.
    },
  });
  if (!campaign) throw new Error("Campaign not found");

  const signupUrl = buildCampaignUrl(campaign.qrCode);
  const qrDataUrl = signupUrl ? await toQrDataUrl(signupUrl) : null;

  // Event plans available to link a campaign event to, so the "sign up for a
  // time slot" handoff has somewhere to point.
  const plans = await db.query.eventPlans.findMany({
    where: eq(eventPlans.schoolId, schoolId),
    columns: { id: true, title: true, schoolYear: true },
    orderBy: [desc(eventPlans.createdAt)],
    limit: 100,
  });

  const catalogEntries = await db.query.eventCatalog.findMany({
    where: eq(eventCatalog.schoolId, schoolId),
    columns: { id: true, title: true, description: true, typicalTiming: true },
    orderBy: [asc(eventCatalog.title)],
  });

  const alreadyImported = new Set(
    campaign.events.map((e) => e.eventCatalogId).filter(Boolean) as string[]
  );

  return {
    campaign,
    signupUrl,
    qrDataUrl,
    eventPlans: plans,
    catalogEntries: catalogEntries.map((entry) => ({
      ...entry,
      alreadyImported: alreadyImported.has(entry.id),
    })),
  };
}

function buildCampaignUrl(qrCode: string): string {
  const baseUrl = getAppBaseUrl();
  return baseUrl ? `${baseUrl}/volunteer-interest/${qrCode}` : "";
}

function toQrDataUrl(url: string) {
  return QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/** Interest roster grouped by event — the "who do I email" view. */
export async function getCampaignRoster(campaignId: string) {
  const { schoolId } = await assertCampaignManager();
  await assertCampaignInSchool(campaignId, schoolId);

  const events = await db.query.volunteerCampaignEvents.findMany({
    where: eq(volunteerCampaignEvents.campaignId, campaignId),
    orderBy: [asc(volunteerCampaignEvents.sortOrder)],
    with: {
      interests: {
        // The campaign is already asserted to be in this school and interests
        // inherit their schoolId from it, so the schoolId match is redundant
        // today — kept as a backstop so a denormalization slip can never
        // surface one school's volunteers on another's roster.
        where: and(
          eq(volunteerInterests.status, "active"),
          eq(volunteerInterests.schoolId, schoolId)
        ),
        orderBy: [desc(volunteerInterests.createdAt)],
      },
    },
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    iconEmoji: event.iconEmoji,
    volunteers: event.interests.map((i) => ({
      id: i.id,
      name: i.name,
      email: i.email,
      phone: i.phone ? formatPhoneNumber(i.phone) : null,
      interestLevel: i.interestLevel,
      notes: i.notes,
      createdAt: i.createdAt,
    })),
  }));
}

export async function exportCampaignInterests(campaignId: string) {
  const roster = await getCampaignRoster(campaignId);

  const header = "Event,Name,Email,Phone,Interest Level,Notes,Signed Up";
  const rows = roster.flatMap((event) =>
    event.volunteers.map((v) =>
      [
        event.title,
        v.name,
        v.email,
        v.phone ?? "",
        v.interestLevel === "lead" ? "Wants to help lead" : "Interested",
        v.notes ?? "",
        v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "",
      ]
        .map(csvCell)
        .join(",")
    )
  );

  return [header, ...rows].join("\n");
}

function csvCell(value: string) {
  // Quote every cell so commas, quotes, and newlines in free-text notes survive.
  return `"${value.replace(/"/g, '""')}"`;
}

export async function removeCampaignInterest(interestId: string) {
  const { userId, schoolId } = await assertCampaignManager();

  const interest = await db.query.volunteerInterests.findFirst({
    where: and(
      eq(volunteerInterests.id, interestId),
      eq(volunteerInterests.schoolId, schoolId)
    ),
  });
  if (!interest) throw new Error("Signup not found");

  await db
    .update(volunteerInterests)
    .set({ status: "removed", removedAt: new Date(), removedBy: userId })
    .where(eq(volunteerInterests.id, interestId));

  revalidateCampaign(interest.campaignId);
}

// ─── Public Campaign Page ──────────────────────────────────────────────────

/** True when a campaign should accept submissions right now. */
function isCampaignOpen(campaign: {
  status: CampaignStatus | string;
  opensAt: Date | null;
  closesAt: Date | null;
}) {
  if (campaign.status !== "active") return false;
  const now = new Date();
  if (campaign.opensAt && now < campaign.opensAt) return false;
  if (campaign.closesAt && now > campaign.closesAt) return false;
  return true;
}

export interface PublicCampaignEvent {
  id: string;
  title: string;
  description: string | null;
  volunteerResponsibilities: string | null;
  typicalTiming: string | null;
  timeCommitment: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  /** Present once the board has opened time-slot signups for this event. */
  signupGeniusUrl: string | null;
}

export interface PublicCampaign {
  id: string;
  title: string;
  intro: string | null;
  contactEmail: string | null;
  schoolName: string;
  events: PublicCampaignEvent[];
}

async function loadPublicCampaignEvents(
  campaignId: string
): Promise<PublicCampaignEvent[]> {
  const events = await db.query.volunteerCampaignEvents.findMany({
    where: eq(volunteerCampaignEvents.campaignId, campaignId),
    orderBy: [
      asc(volunteerCampaignEvents.sortOrder),
      asc(volunteerCampaignEvents.title),
    ],
    with: { eventPlan: { columns: { signupGeniusUrl: true } } },
  });

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    volunteerResponsibilities: event.volunteerResponsibilities,
    typicalTiming: event.typicalTiming,
    timeCommitment: event.timeCommitment,
    iconEmoji: event.iconEmoji,
    imageUrl: event.imageUrl,
    signupGeniusUrl: event.eventPlan?.signupGeniusUrl ?? null,
  }));
}

/** Public, unauthenticated read for the standalone campaign QR page. */
export async function getPublicCampaign(
  qrCode: string
): Promise<PublicCampaign | null> {
  const campaign = await db.query.volunteerCampaigns.findFirst({
    where: eq(volunteerCampaigns.qrCode, qrCode),
    with: { school: { columns: { name: true } } },
  });

  if (!campaign || !isCampaignOpen(campaign)) return null;

  const events = await loadPublicCampaignEvents(campaign.id);
  if (events.length === 0) return null;

  return {
    id: campaign.id,
    title: campaign.title,
    intro: campaign.intro,
    contactEmail: campaign.contactEmail,
    schoolName: campaign.school.name,
    events,
  };
}

/**
 * The campaign, if any, that should be appended to this school's room parent
 * signup page. Returns null so the room parent flow renders exactly as it does
 * today when no campaign opts in.
 */
export async function getRoomParentAddonCampaign(
  schoolId: string,
  schoolYear: string
): Promise<PublicCampaign | null> {
  const campaign = await db.query.volunteerCampaigns.findFirst({
    where: and(
      eq(volunteerCampaigns.schoolId, schoolId),
      eq(volunteerCampaigns.schoolYear, schoolYear),
      eq(volunteerCampaigns.showOnRoomParentSignup, true)
    ),
    with: { school: { columns: { name: true } } },
  });

  if (!campaign || !isCampaignOpen(campaign)) return null;

  const events = await loadPublicCampaignEvents(campaign.id);
  if (events.length === 0) return null;

  return {
    id: campaign.id,
    title: campaign.title,
    intro: campaign.intro,
    contactEmail: campaign.contactEmail,
    schoolName: campaign.school.name,
    events,
  };
}

// ─── Public Submission ─────────────────────────────────────────────────────

export interface InterestSelection {
  campaignEventId: string;
  interestLevel: InterestLevel;
}

export interface InterestSubmission {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  selections: InterestSelection[];
}

export interface InterestResponse {
  success: boolean;
  savedEventTitles: string[];
  error?: string;
}

/**
 * Records interest against a campaign. Shared by the standalone campaign page
 * and the room parent signup add-on, so both stay idempotent in the same way:
 * re-submitting updates the interest level instead of erroring on the unique
 * index.
 *
 * `skipWelcomeEmail` is set by the room parent flow, which sends its own
 * combined welcome email covering both the classroom signups and these events.
 */
export async function recordCampaignInterest(
  campaignId: string,
  data: InterestSubmission,
  options: { skipWelcomeEmail?: boolean } = {}
): Promise<InterestResponse> {
  const campaign = await db.query.volunteerCampaigns.findFirst({
    where: eq(volunteerCampaigns.id, campaignId),
    with: { school: { columns: { id: true, name: true } } },
  });

  if (!campaign || !isCampaignOpen(campaign)) {
    return {
      success: false,
      savedEventTitles: [],
      error: "This volunteer sign-up is no longer accepting responses.",
    };
  }

  const validation = normalizeContact(data);
  if (!validation.ok) {
    return { success: false, savedEventTitles: [], error: validation.error };
  }
  const contact = validation.contact;

  if (data.selections.length === 0) {
    return {
      success: false,
      savedEventTitles: [],
      error: "Pick at least one event you'd be interested in helping with.",
    };
  }

  // Only accept events that actually belong to this campaign — the client sends
  // ids, and a stale page could send ones that have since been deleted.
  const validEvents = await db.query.volunteerCampaignEvents.findMany({
    where: and(
      eq(volunteerCampaignEvents.campaignId, campaignId),
      inArray(
        volunteerCampaignEvents.id,
        data.selections.map((s) => s.campaignEventId)
      )
    ),
    columns: { id: true, title: true },
  });

  if (validEvents.length === 0) {
    return {
      success: false,
      savedEventTitles: [],
      error: "Those events are no longer available. Please refresh and try again.",
    };
  }

  const titleById = new Map(validEvents.map((e) => [e.id, e.title]));
  const schoolYear = campaign.schoolYear;
  const existingUser = await linkExistingAccountToSchool(
    contact.email,
    campaign.schoolId,
    schoolYear
  );

  const rows = data.selections
    .filter((s) => titleById.has(s.campaignEventId))
    .map((s) => ({
      schoolId: campaign.schoolId,
      campaignId,
      campaignEventId: s.campaignEventId,
      userId: existingUser?.id ?? null,
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      interestLevel: s.interestLevel,
      notes: data.notes?.trim() || null,
      schoolYear,
    }));

  await db
    .insert(volunteerInterests)
    .values(rows)
    .onConflictDoUpdate({
      target: [volunteerInterests.campaignEventId, volunteerInterests.email],
      set: {
        name: sql`excluded.name`,
        phone: sql`excluded.phone`,
        interestLevel: sql`excluded.interest_level`,
        notes: sql`excluded.notes`,
        userId: sql`excluded.user_id`,
        // A parent re-submitting is opting back in after a removal.
        status: sql`'active'`,
        removedAt: sql`NULL`,
        removedBy: sql`NULL`,
      },
    });

  const savedEventTitles = rows.map((r) => titleById.get(r.campaignEventId)!);

  if (!options.skipWelcomeEmail) {
    try {
      await sendWelcomeEmail({
        email: contact.email,
        name: contact.name,
        schoolName: campaign.school.name,
        signups: rows.map((r) => ({
          role:
            r.interestLevel === "lead"
              ? `${titleById.get(r.campaignEventId)} (interested in helping lead)`
              : titleById.get(r.campaignEventId)!,
        })),
        listIntro: "You told us you're interested in helping with:",
        benefits: [
          "The school calendar and event details in one place",
          "A heads-up when time-slot sign-ups open for these events",
          "PTA announcements, budget, and fundraiser progress",
        ],
      });
    } catch (error) {
      console.error("Failed to send interest welcome email:", error);
      // An email failure shouldn't lose the signup.
    }
  }

  revalidateCampaign(campaignId);
  return { success: true, savedEventTitles };
}

/** Entry point for the standalone `/volunteer-interest/[code]` page. */
export async function submitCampaignInterest(
  qrCode: string,
  data: InterestSubmission
): Promise<InterestResponse> {
  const campaign = await db.query.volunteerCampaigns.findFirst({
    where: eq(volunteerCampaigns.qrCode, qrCode),
    columns: { id: true },
  });

  if (!campaign) {
    return {
      success: false,
      savedEventTitles: [],
      error: "This sign-up link is no longer valid.",
    };
  }

  return recordCampaignInterest(campaign.id, data);
}

// ─── School Lookup (public) ────────────────────────────────────────────────

/** Used by the room parent page, which only has the school's volunteer QR code. */
export async function getRoomParentAddonByQrCode(
  volunteerQrCode: string
): Promise<PublicCampaign | null> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.volunteerQrCode, volunteerQrCode),
    columns: { id: true },
  });
  if (!school) return null;

  const schoolYear = await getSchoolCurrentYear(school.id);
  return getRoomParentAddonCampaign(school.id, schoolYear);
}
