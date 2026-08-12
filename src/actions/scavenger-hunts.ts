"use server";

import {
  assertAuthenticated,
  assertPtaBoardMember,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db, dbPool } from "@/lib/db";
import {
  eventCatalog,
  eventPlans,
  schools,
  scavengerHuntCompletions,
  scavengerHuntItemResponses,
  scavengerHuntItems,
  scavengerHuntParticipants,
  scavengerHunts,
  volunteerCampaigns,
  volunteerCampaignEvents,
} from "@/lib/db/schema";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { nanoid } from "nanoid";
import QRCode from "qrcode";
import { getAppBaseUrl } from "@/lib/magic-link";
import { randomHandle, suffixedHandle } from "@/lib/scavenger-handles";
import { assertNoHistory, summarizeHistory } from "@/lib/history-guard";
import {
  normalizeLinkUrl,
  parseLinkOpenMode,
  type LinkOpenMode,
} from "@/lib/links-shared";
import { parseHuntImageFit, type HuntImageFit } from "@/lib/hunt-image-shared";

export type HuntStatus = "draft" | "active" | "closed";

// ─── Item questions ────────────────────────────────────────────────────────

/**
 * The answer that lets a question advance to the next one. `null` is a terminal
 * or ungated question: the flow always continues past it (or it's the last one).
 * Answering a gated question anything other than its `continueValue` ends the
 * flow — the remaining questions are skipped and the item still completes.
 */
export type ContinueValue = "yes" | "no" | null;

export interface HuntQuestion {
  id: string;
  prompt: string;
  continueValue: ContinueValue;
}

/** One answered question, snapshotted with its prompt for the saved record. */
export interface HuntAnswer {
  prompt: string;
  answer: "yes" | "no";
}

const MAX_QUESTIONS = 10;

/**
 * Cleans a board member's question list for storage: trims prompts, drops blank
 * rows, keeps (or mints) a stable `id` per question, and caps the count. A blank
 * prompt is dropped rather than rejected so a half-filled extra row on save is
 * forgiving instead of an error.
 */
function sanitizeQuestions(input: HuntQuestion[] | undefined | null): HuntQuestion[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((q) => ({
      id: q.id?.trim() || nanoid(8),
      prompt: (q.prompt ?? "").trim(),
      continueValue:
        q.continueValue === "yes" || q.continueValue === "no"
          ? q.continueValue
          : null,
    }))
    .filter((q) => q.prompt.length > 0)
    .slice(0, MAX_QUESTIONS);
}

/**
 * The gate, evaluated server-side — the single source of truth for which
 * answers a participant was actually allowed to give.
 *
 * Walks the questions in order applying the caller's answers. A gated question
 * answered anything other than its `continueValue` ends the walk (its own answer
 * is kept; nothing after it is). Any answer the client submitted for a question
 * the walk never reached is ignored, so a crafted request can't record a vote on
 * a question the player never saw.
 *
 * Returns the ordered snapshot to store, or `null` if the first question wasn't
 * answered (the one thing that's actually required).
 */
function reachableAnswers(
  questions: HuntQuestion[],
  rawAnswers: Record<string, unknown>
): HuntAnswer[] | null {
  const result: HuntAnswer[] = [];
  for (const q of questions) {
    const raw = rawAnswers[q.id];
    const answer = raw === "yes" || raw === "no" ? raw : null;
    if (!answer) {
      // An unanswered question stops the walk. If it's the first one, the
      // player answered nothing — reject; otherwise treat it as "flow ended
      // here" and keep what came before.
      return result.length === 0 ? null : result;
    }
    result.push({ prompt: q.prompt, answer });
    // A gated question answered the wrong way ends the flow after recording it.
    if (q.continueValue && answer !== q.continueValue) break;
  }
  return result.length === 0 ? null : result;
}

// ─── Authorization ─────────────────────────────────────────────────────────

/**
 * Hunts are run by whichever board member owns the event, so this is
 * board-wide rather than scoped to a position. Returns the acting user and the
 * school so callers don't repeat the lookup.
 */
async function assertHuntManager() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertPtaBoardMember(user.id!, schoolId);
  return { userId: user.id!, schoolId };
}

/** Loads a hunt, failing if it belongs to another school. */
async function assertHuntInSchool(huntId: string, schoolId: string) {
  const hunt = await db.query.scavengerHunts.findFirst({
    where: and(
      eq(scavengerHunts.id, huntId),
      eq(scavengerHunts.schoolId, schoolId)
    ),
  });
  if (!hunt) throw new Error("Hunt not found");
  return hunt;
}

/** Resolves an item to its hunt, failing across school boundaries. */
async function assertHuntItemInSchool(itemId: string, schoolId: string) {
  const item = await db.query.scavengerHuntItems.findFirst({
    where: eq(scavengerHuntItems.id, itemId),
    with: { hunt: true },
  });
  if (!item || item.hunt.schoolId !== schoolId) {
    throw new Error("Item not found");
  }
  return item;
}

function revalidateHunt(huntId: string, qrCode?: string) {
  revalidatePath("/admin/scavenger-hunts");
  revalidatePath(`/admin/scavenger-hunts/${huntId}`);
  // The catalog entry lists the hunts run at its event, so a title, status or
  // link change shows up there too.
  revalidatePath("/admin/board/event-catalog");
  if (qrCode) revalidatePath(`/hunt/${qrCode}`);
  // The volunteer sign-up page promotes whichever hunt holds the sign-up-success
  // slot, and that promo turns on and off from settings (the flag, the status,
  // the open window) *and* from items — a hunt with nothing to find isn't
  // promoted. Every caller here is a board mutation, so refreshing the public
  // page from all of them is cheap and saves reasoning about which ones matter.
  revalidatePath("/volunteer-signup", "layout");
}

/** The transaction handle `dbPool.transaction` hands its callback. */
type HuntTx = Parameters<Parameters<typeof dbPool.transaction>[0]>[0];

/**
 * At most one hunt per school year sits on the volunteer sign-up success
 * screen — this is what makes that true rather than merely intended.
 *
 * Nothing used to release the slot when a second hunt claimed it, so a board
 * that ran a test hunt and then the real one left both flagged. The promo
 * lookup takes a single row, so it could pick the retired hunt, find it closed,
 * and render nothing at all — the live hunt shadowed by its own rehearsal.
 * Clearing the losers at write time means the reader never has to arbitrate.
 */
async function claimSignupSuccessSlot(
  tx: HuntTx,
  schoolId: string,
  schoolYear: string,
  huntId: string
) {
  await tx
    .update(scavengerHunts)
    .set({ showOnSignupSuccess: false, updatedAt: new Date() })
    .where(
      and(
        eq(scavengerHunts.schoolId, schoolId),
        eq(scavengerHunts.schoolYear, schoolYear),
        eq(scavengerHunts.showOnSignupSuccess, true),
        ne(scavengerHunts.id, huntId)
      )
    );
}

// ─── Hunt CRUD ─────────────────────────────────────────────────────────────

export interface HuntInput {
  title: string;
  intro?: string | null;
  completionMessage?: string | null;
  status?: HuntStatus;
  showOnSignupSuccess?: boolean;
  collectFinisherContact?: boolean;
  /** Volunteer campaign a finisher is sent to next. "" / null clears it. */
  ctaCampaignId?: string | null;
  /** Recurring event this hunt is run at. "" / null clears it. */
  eventCatalogId?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
}

/**
 * Validates a finisher-CTA campaign choice against the acting school.
 *
 * The id comes from a board member's own dropdown, but it still crosses the
 * trust boundary on the way back — a hand-crafted request could point a hunt at
 * another school's campaign and leak its QR code onto this school's finish
 * screen. Empty/null clears the CTA; anything else must resolve inside `schoolId`.
 */
async function resolveCtaCampaignId(
  value: string | null | undefined,
  schoolId: string
): Promise<string | null> {
  if (!value) return null;
  const campaign = await db.query.volunteerCampaigns.findFirst({
    where: and(
      eq(volunteerCampaigns.id, value),
      eq(volunteerCampaigns.schoolId, schoolId)
    ),
    columns: { id: true },
  });
  if (!campaign) throw new Error("That volunteer campaign wasn't found.");
  return campaign.id;
}

/**
 * Validates a recurring-event choice against the acting school.
 *
 * Same trust-boundary reasoning as `resolveCtaCampaignId`: the id arrives from
 * the board member's own picker, but a hand-crafted request could otherwise
 * file this school's hunt under another school's event and leak its title onto
 * that school's catalog page. Empty/null clears the link.
 *
 * Retired entries are deliberately still accepted — an event coming back after
 * a year off is exactly when last year's hunt is worth finding.
 */
async function resolveEventCatalogId(
  value: string | null | undefined,
  schoolId: string
): Promise<string | null> {
  if (!value) return null;
  const entry = await db.query.eventCatalog.findFirst({
    where: and(
      eq(eventCatalog.id, value),
      eq(eventCatalog.schoolId, schoolId)
    ),
    columns: { id: true },
  });
  if (!entry) throw new Error("That recurring event wasn't found.");
  return entry.id;
}

export async function createHunt(data: HuntInput) {
  const { userId, schoolId } = await assertHuntManager();
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const title = data.title.trim();
  if (!title) throw new Error("Please give the hunt a title.");

  const ctaCampaignId = await resolveCtaCampaignId(data.ctaCampaignId, schoolId);
  const eventCatalogId = await resolveEventCatalogId(
    data.eventCatalogId,
    schoolId
  );

  const showOnSignupSuccess = data.showOnSignupSuccess ?? false;
  const values = {
    schoolId,
    qrCode: nanoid(12),
    title,
    intro: data.intro?.trim() || null,
    completionMessage: data.completionMessage?.trim() || null,
    schoolYear,
    status: data.status ?? "draft",
    showOnSignupSuccess,
    collectFinisherContact: data.collectFinisherContact ?? true,
    ctaCampaignId,
    eventCatalogId,
    opensAt: data.opensAt ? new Date(data.opensAt) : null,
    closesAt: data.closesAt ? new Date(data.closesAt) : null,
    createdBy: userId,
  };

  // Only a hunt claiming the sign-up-success slot pays for the WebSocket
  // transaction; every other create stays on the HTTP driver.
  const hunt = showOnSignupSuccess
    ? await dbPool.transaction(async (tx) => {
        const [created] = await tx
          .insert(scavengerHunts)
          .values(values)
          .returning();
        await claimSignupSuccessSlot(tx, schoolId, schoolYear, created.id);
        return created;
      })
    : (await db.insert(scavengerHunts).values(values).returning())[0];

  revalidateHunt(hunt.id, hunt.qrCode);
  return hunt;
}

/**
 * Copy a hunt's setup into a fresh, empty one — the same game run again.
 *
 * A board that ran "Back to School Night Hunt" last fall wants the same twelve
 * items, the same flyer copy and the same finish message, with nobody's score
 * on it. So this copies the *setup* and deliberately copies none of the play:
 * participants, completions and saved answers stay with the original, which is
 * what makes the copy's leaderboard start empty.
 *
 * The rest of what it doesn't carry over is the same idea applied to things
 * that are about one particular event:
 *
 * - **A new QR code**, because the old poster still points at the old hunt.
 * - **Draft status and no open/close window** — the copy is dated for whenever
 *   the board is planning, and going live is a deliberate act.
 * - **The current school year**, not the source's, so last year's hunt copies
 *   forward into this year's list.
 * - **`showOnSignupSuccess` off.** At most one hunt per year holds that slot
 *   (`claimSignupSuccessSlot`), so a copy that inherited the flag would take it
 *   away from the hunt that's actually running the moment it was saved.
 * - **Archived items**, which the board took off the board on purpose.
 *
 * The finisher CTA does come across, but only if that campaign is still live —
 * pointing a new hunt's finish screen at an archived campaign is a dead link.
 *
 * The recurring-event link always comes across, and is the point of the pair of
 * features: copying last fall's Back to School Night hunt forward keeps it
 * filed under Back to School Night, so the catalog entry accumulates the years.
 */
export async function duplicateHunt(huntId: string, title?: string) {
  const { userId, schoolId } = await assertHuntManager();
  const source = await assertHuntInSchool(huntId, schoolId);
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const newTitle = title?.trim() || `${source.title} (Copy)`;

  const items = await db.query.scavengerHuntItems.findMany({
    where: and(
      eq(scavengerHuntItems.huntId, huntId),
      isNull(scavengerHuntItems.archivedAt)
    ),
    orderBy: [asc(scavengerHuntItems.sortOrder), asc(scavengerHuntItems.title)],
  });

  const ctaCampaignId = source.ctaCampaignId
    ? (
        await db.query.volunteerCampaigns.findFirst({
          where: and(
            eq(volunteerCampaigns.id, source.ctaCampaignId),
            eq(volunteerCampaigns.schoolId, schoolId),
            isNull(volunteerCampaigns.archivedAt)
          ),
          columns: { id: true },
        })
      )?.id ?? null
    : null;

  // One transaction so a half-copied hunt — the settings without the items —
  // can never end up in the list for someone to publish by mistake.
  const hunt = await dbPool.transaction(async (tx) => {
    const [created] = await tx
      .insert(scavengerHunts)
      .values({
        schoolId,
        qrCode: nanoid(12),
        title: newTitle,
        intro: source.intro,
        completionMessage: source.completionMessage,
        schoolYear,
        status: "draft",
        showOnSignupSuccess: false,
        collectFinisherContact: source.collectFinisherContact,
        ctaCampaignId,
        eventCatalogId: source.eventCatalogId,
        createdBy: userId,
      })
      .returning();

    if (items.length > 0) {
      // Re-numbered from 0 rather than carrying the source's sort orders, which
      // have gaps wherever an archived item was skipped.
      await tx.insert(scavengerHuntItems).values(
        items.map((item, index) => ({
          huntId: created.id,
          title: item.title,
          description: item.description,
          emoji: item.emoji,
          linkUrl: item.linkUrl,
          linkLabel: item.linkLabel,
          linkOpenMode: item.linkOpenMode,
          imageUrl: item.imageUrl,
          imageAlt: item.imageAlt,
          imageFit: item.imageFit,
          questions: item.questions,
          saveResponses: item.saveResponses,
          sortOrder: index,
        }))
      );
    }

    return created;
  });

  revalidateHunt(hunt.id, hunt.qrCode);
  return { id: hunt.id, title: hunt.title, itemCount: items.length };
}

export async function updateHunt(huntId: string, data: HuntInput) {
  const { schoolId } = await assertHuntManager();
  const existing = await assertHuntInSchool(huntId, schoolId);

  const changes = {
    ...(data.title !== undefined && { title: data.title.trim() }),
    ...(data.intro !== undefined && { intro: data.intro?.trim() || null }),
    ...(data.completionMessage !== undefined && {
      completionMessage: data.completionMessage?.trim() || null,
    }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.showOnSignupSuccess !== undefined && {
      showOnSignupSuccess: data.showOnSignupSuccess,
    }),
    ...(data.collectFinisherContact !== undefined && {
      collectFinisherContact: data.collectFinisherContact,
    }),
    ...(data.ctaCampaignId !== undefined && {
      ctaCampaignId: await resolveCtaCampaignId(data.ctaCampaignId, schoolId),
    }),
    ...(data.eventCatalogId !== undefined && {
      eventCatalogId: await resolveEventCatalogId(
        data.eventCatalogId,
        schoolId
      ),
    }),
    ...(data.opensAt !== undefined && {
      opensAt: data.opensAt ? new Date(data.opensAt) : null,
    }),
    ...(data.closesAt !== undefined && {
      closesAt: data.closesAt ? new Date(data.closesAt) : null,
    }),
    updatedAt: new Date(),
  };

  // Scoped to the hunt's own year, not the school's current one, so editing a
  // past hunt can't clear the flag on the one running now.
  if (data.showOnSignupSuccess === true) {
    await dbPool.transaction(async (tx) => {
      await tx
        .update(scavengerHunts)
        .set(changes)
        .where(eq(scavengerHunts.id, huntId));
      await claimSignupSuccessSlot(tx, schoolId, existing.schoolYear, huntId);
    });
  } else {
    await db
      .update(scavengerHunts)
      .set(changes)
      .where(eq(scavengerHunts.id, huntId));
  }

  revalidateHunt(huntId, existing.qrCode);
}

/**
 * Count what a hunt delete would take with it. Participants and their progress
 * cascade off `scavenger_hunts`, so a hunt people have already played can't be
 * hard-deleted — that would erase the finisher list the prizes are based on.
 */
export async function getHuntHistoryCounts(huntId: string) {
  const { schoolId } = await assertHuntManager();
  await assertHuntInSchool(huntId, schoolId);

  const [items, participants] = await Promise.all([
    db.$count(scavengerHuntItems, eq(scavengerHuntItems.huntId, huntId)),
    db.$count(
      scavengerHuntParticipants,
      eq(scavengerHuntParticipants.huntId, huntId)
    ),
  ]);

  // Players are what makes a hunt unrecoverable; an item list nobody has
  // played is just unused setup, so it doesn't block the delete on its own.
  return summarizeHistory([
    { label: "player", count: participants },
    { label: "item", count: items },
  ]);
}

/** Retires a hunt and its QR code while keeping the results. */
export async function archiveHunt(huntId: string) {
  const { schoolId, userId } = await assertHuntManager();
  const hunt = await assertHuntInSchool(huntId, schoolId);

  await db
    .update(scavengerHunts)
    .set({
      archivedAt: new Date(),
      archivedBy: userId,
      status: "closed",
      // Retiring a hunt gives up the sign-up-success slot. Holding it while
      // archived is what let a finished test hunt keep the badge and re-claim
      // the slot on restore, months after the board had moved on.
      showOnSignupSuccess: false,
      updatedAt: new Date(),
    })
    .where(eq(scavengerHunts.id, huntId));

  revalidateHunt(huntId, hunt.qrCode);
}

export async function restoreHunt(huntId: string) {
  const { schoolId } = await assertHuntManager();
  const hunt = await assertHuntInSchool(huntId, schoolId);

  await db
    .update(scavengerHunts)
    .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
    .where(eq(scavengerHunts.id, huntId));

  revalidateHunt(huntId, hunt.qrCode);
}

/**
 * Permanently delete a hunt — only allowed while nobody has played it.
 * For anything with players, archive instead.
 */
export async function deleteHunt(huntId: string) {
  const { schoolId } = await assertHuntManager();
  const hunt = await assertHuntInSchool(huntId, schoolId);

  const players = await db.$count(
    scavengerHuntParticipants,
    eq(scavengerHuntParticipants.huntId, huntId)
  );
  assertNoHistory(
    hunt.title,
    [{ label: "player", count: players }],
    "Archive it instead — that retires the hunt and its QR code without losing who played."
  );

  await db.delete(scavengerHunts).where(eq(scavengerHunts.id, huntId));

  revalidatePath("/admin/scavenger-hunts");
}

/** Invalidates the old QR code — any printed poster stops working. */
export async function regenerateHuntQrCode(huntId: string) {
  const { schoolId } = await assertHuntManager();
  const existing = await assertHuntInSchool(huntId, schoolId);

  const qrCode = nanoid(12);
  await db
    .update(scavengerHunts)
    .set({ qrCode, updatedAt: new Date() })
    .where(eq(scavengerHunts.id, huntId));

  revalidateHunt(huntId, existing.qrCode);
  revalidatePath(`/hunt/${qrCode}`);
  return { qrCode };
}

/**
 * Clears every player off a hunt: the leaderboard, their progress, their saved
 * answers, and the anonymous handles they were assigned — which go straight
 * back into circulation, because handles are unique per hunt rather than
 * globally.
 *
 * This exists for a hunt that was played before it counted: the board's own
 * walkthrough, a practice run at setup, a table of volunteers testing the QR
 * code the night before. Everything the board authored survives — items,
 * settings, and the QR code itself, so posters already printed keep working.
 *
 * Deliberately unavailable once the hunt is closed or archived. By then the
 * finisher list is what prizes are handed out from, and the way to run the hunt
 * again is `duplicateHunt`, which copies the items into a fresh hunt and leaves
 * these results exactly where they are.
 */
export async function resetHunt(huntId: string) {
  const { schoolId, userId } = await assertHuntManager();
  const hunt = await assertHuntInSchool(huntId, schoolId);

  // Re-checked here rather than trusted from the UI: the button is hidden on a
  // closed hunt, but a hunt can be closed in another tab between render and tap.
  if (hunt.archivedAt || hunt.status === "closed") {
    throw new Error(
      "This hunt is closed, so its results are final. Duplicate it instead to run it again with a clean slate."
    );
  }

  // Completions and saved answers cascade off the participant rows, so this one
  // delete takes the whole game state with it. Wrapped in a transaction with the
  // stamp below so the record of the reset can't outlive the reset, or vice
  // versa — an unexplained empty leaderboard is the thing this is guarding.
  const clearedPlayers = await dbPool.transaction(async (tx) => {
    const deleted = await tx
      .delete(scavengerHuntParticipants)
      .where(eq(scavengerHuntParticipants.huntId, huntId))
      .returning({ id: scavengerHuntParticipants.id });

    await tx
      .update(scavengerHunts)
      .set({
        resetAt: new Date(),
        resetBy: userId,
        resetPlayerCount: deleted.length,
        updatedAt: new Date(),
      })
      .where(eq(scavengerHunts.id, huntId));

    return deleted.length;
  });

  // A phone still holding the cookie for a deleted participant lands back on the
  // start screen instead of an error — see `getParticipantFromCookie` — so
  // anyone who was mid-hunt simply begins again under a new handle.
  revalidateHunt(huntId, hunt.qrCode);
  return { clearedPlayers };
}

// ─── Hunt Items ────────────────────────────────────────────────────────────

export interface HuntItemInput {
  title: string;
  description?: string | null;
  emoji?: string | null;
  linkUrl?: string | null;
  linkLabel?: string | null;
  /** See src/lib/links-shared.ts. Ignored when there's no link. */
  linkOpenMode?: LinkOpenMode | null;
  /** At most one image, embedded in the card. Usually a media library blob URL. */
  imageUrl?: string | null;
  imageAlt?: string | null;
  /** See src/lib/hunt-image-shared.ts. Ignored when there's no image. */
  imageFit?: HuntImageFit | null;
  /** Optional yes/no question flow. Empty/omitted = a plain tap-to-complete item. */
  questions?: HuntQuestion[];
  /** Snapshot each participant's answers to the results page. Requires questions. */
  saveResponses?: boolean;
}

/**
 * The item's embedded image, cleaned up: a safe URL or nothing.
 *
 * Same reasoning as `parseItemLink` — this ends up in a `src` on a public page,
 * so it has to be a real http(s) URL and nothing else. Alt text and fit are
 * cleared along with the URL so removing an image can't leave a stale caption
 * behind for the next one.
 */
function parseItemImage(input: {
  imageUrl?: string | null;
  imageAlt?: string | null;
  imageFit?: HuntImageFit | null;
}) {
  const raw = input.imageUrl?.trim();
  if (!raw) {
    return { imageUrl: null, imageAlt: null, imageFit: "contain" as const };
  }

  const imageUrl = normalizeLinkUrl(raw);
  if (!imageUrl) {
    throw new Error("That image address doesn't look like a web address.");
  }

  return {
    imageUrl,
    imageAlt: input.imageAlt?.trim() || null,
    imageFit: parseHuntImageFit(input.imageFit),
  };
}

/**
 * The item's CTA, cleaned up: a safe URL or nothing.
 *
 * `/hunt/[code]` is a public page, so a board member's typo can't be allowed to
 * become a broken `href` and a `javascript:` URL can't be allowed at all — same
 * rule as every other board-entered link in the app.
 */
function parseItemLink(input: {
  linkUrl?: string | null;
  linkLabel?: string | null;
  linkOpenMode?: LinkOpenMode | null;
}) {
  const raw = input.linkUrl?.trim();
  if (!raw) {
    return { linkUrl: null, linkLabel: null, linkOpenMode: "new_tab" as const };
  }

  const linkUrl = normalizeLinkUrl(raw);
  if (!linkUrl) {
    throw new Error(
      "That link doesn't look like a web address — it should start with https://"
    );
  }

  return {
    linkUrl,
    linkLabel: input.linkLabel?.trim() || null,
    linkOpenMode: parseLinkOpenMode(input.linkOpenMode),
  };
}

export async function createHuntItem(huntId: string, data: HuntItemInput) {
  const { schoolId } = await assertHuntManager();
  const hunt = await assertHuntInSchool(huntId, schoolId);

  const title = data.title.trim();
  if (!title) throw new Error("Please give the item a title.");

  const questions = sanitizeQuestions(data.questions);

  const [{ maxOrder }] = await db
    .select({
      maxOrder: sql<number>`coalesce(max(${scavengerHuntItems.sortOrder}), -1)::int`,
    })
    .from(scavengerHuntItems)
    .where(eq(scavengerHuntItems.huntId, huntId));

  const [item] = await db
    .insert(scavengerHuntItems)
    .values({
      huntId,
      title,
      description: data.description?.trim() || null,
      // The column is NOT NULL with a default, so an empty picker still
      // produces a card with a visual hook rather than a blank square.
      emoji: data.emoji?.trim() || "⭐",
      ...parseItemLink(data),
      ...parseItemImage(data),
      questions,
      // Saving answers only means something once there's a real question to
      // answer — base it on the cleaned list, not the raw one, so a blank row
      // can't leave the flag on with nothing behind it.
      saveResponses: Boolean(data.saveResponses) && questions.length > 0,
      sortOrder: maxOrder + 1,
    })
    .returning();

  // Adding an item mid-event moves the finish line up, so anyone already
  // marked finished has to be un-finished until they catch up. Without this
  // the leaderboard and the prize list keep them as a finisher against a
  // count they never actually reached.
  await resyncHuntProgress(huntId);

  revalidateHunt(huntId, hunt.qrCode);
  return item;
}

export async function updateHuntItem(
  itemId: string,
  data: Partial<HuntItemInput>
) {
  const { schoolId } = await assertHuntManager();
  const item = await assertHuntItemInSchool(itemId, schoolId);

  // A URL in the patch re-decides the whole CTA — clearing the link has to
  // clear its label and mode with it, or the next edit inherits stale ones.
  const linkPatch =
    data.linkUrl !== undefined
      ? parseItemLink(data)
      : {
          ...(data.linkLabel !== undefined && {
            linkLabel: data.linkLabel?.trim() || null,
          }),
          ...(data.linkOpenMode !== undefined && {
            linkOpenMode: parseLinkOpenMode(data.linkOpenMode),
          }),
        };

  // Same rule for the image: a URL in the patch re-decides the whole thing, so
  // removing the image also drops its alt text and fit.
  const imagePatch =
    data.imageUrl !== undefined
      ? parseItemImage(data)
      : {
          ...(data.imageAlt !== undefined && {
            imageAlt: data.imageAlt?.trim() || null,
          }),
          ...(data.imageFit !== undefined && {
            imageFit: parseHuntImageFit(data.imageFit),
          }),
        };

  // Questions and the save-answers flag move together: saving answers only
  // means something when there are questions, so whenever either is in the
  // patch we recompute both against the questions the item will end up with.
  const nextQuestions =
    data.questions !== undefined
      ? sanitizeQuestions(data.questions)
      : item.questions;
  const questionsPatch =
    data.questions !== undefined || data.saveResponses !== undefined
      ? {
          ...(data.questions !== undefined && { questions: nextQuestions }),
          saveResponses:
            (data.saveResponses !== undefined
              ? Boolean(data.saveResponses)
              : item.saveResponses) && nextQuestions.length > 0,
        }
      : {};

  await db
    .update(scavengerHuntItems)
    .set({
      ...(data.title !== undefined && { title: data.title.trim() }),
      ...(data.description !== undefined && {
        description: data.description?.trim() || null,
      }),
      ...(data.emoji !== undefined && { emoji: data.emoji?.trim() || "⭐" }),
      ...linkPatch,
      ...imagePatch,
      ...questionsPatch,
      updatedAt: new Date(),
    })
    .where(eq(scavengerHuntItems.id, itemId));

  revalidateHunt(item.huntId, item.hunt.qrCode);
}

/**
 * Takes an item off the board but keeps the completions pointing at it.
 *
 * Archiving mid-event is the whole reason this isn't a delete: a player who
 * already checked the item off keeps their point, and the live item count
 * shrinks so nobody is stranded one item short of finishing.
 */
export async function archiveHuntItem(itemId: string) {
  const { schoolId } = await assertHuntManager();
  const item = await assertHuntItemInSchool(itemId, schoolId);

  await db
    .update(scavengerHuntItems)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(scavengerHuntItems.id, itemId));

  await resyncHuntProgress(item.huntId);
  revalidateHunt(item.huntId, item.hunt.qrCode);
}

export async function restoreHuntItem(itemId: string) {
  const { schoolId } = await assertHuntManager();
  const item = await assertHuntItemInSchool(itemId, schoolId);

  await db
    .update(scavengerHuntItems)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(scavengerHuntItems.id, itemId));

  await resyncHuntProgress(item.huntId);
  revalidateHunt(item.huntId, item.hunt.qrCode);
}

/**
 * Count what deleting an item would take with it, so the editor can pick
 * between a delete and an archive before it mutates anything rather than
 * inferring the answer from a failed delete.
 */
export async function getHuntItemHistoryCounts(itemId: string) {
  const { schoolId } = await assertHuntManager();
  await assertHuntItemInSchool(itemId, schoolId);

  const completions = await db.$count(
    scavengerHuntCompletions,
    eq(scavengerHuntCompletions.itemId, itemId)
  );

  return summarizeHistory([
    { label: "player check-off", count: completions },
  ]);
}

/**
 * Permanently delete an item — only allowed while nobody has checked it off,
 * since `scavenger_hunt_completions` cascades off this row.
 */
export async function deleteHuntItem(itemId: string) {
  const { schoolId } = await assertHuntManager();
  const item = await assertHuntItemInSchool(itemId, schoolId);

  const completions = await db.$count(
    scavengerHuntCompletions,
    eq(scavengerHuntCompletions.itemId, itemId)
  );
  assertNoHistory(
    item.title,
    [{ label: "player check-off", count: completions }],
    "Archive it instead — that removes it from the board without changing anyone's score."
  );

  await db.delete(scavengerHuntItems).where(eq(scavengerHuntItems.id, itemId));

  await resyncHuntProgress(item.huntId);
  revalidateHunt(item.huntId, item.hunt.qrCode);
}

export async function reorderHuntItems(huntId: string, orderedIds: string[]) {
  const { schoolId } = await assertHuntManager();
  const hunt = await assertHuntInSchool(huntId, schoolId);

  if (orderedIds.length === 0) return;

  // One statement rather than one UPDATE per item: a reorder rewrites every
  // row, so N round trips (and N row locks held concurrently) add up fast.
  const orderCases = sql.join(
    orderedIds.map(
      (id, index) => sql`when ${scavengerHuntItems.id} = ${id} then ${index}`
    ),
    sql` `
  );

  await db
    .update(scavengerHuntItems)
    .set({
      sortOrder: sql`case ${orderCases} else ${scavengerHuntItems.sortOrder} end`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(scavengerHuntItems.huntId, huntId),
        inArray(scavengerHuntItems.id, orderedIds)
      )
    );

  revalidateHunt(huntId, hunt.qrCode);
}

/**
 * Recompute every player's score for a hunt after the item list changes.
 *
 * `completedCount` counts live items only, so archiving or deleting an item
 * mid-event silently invalidates every cached score. This is the one place
 * that can't be folded into a toggle's transaction — it's a board action that
 * moves the finish line for everyone at once.
 */
async function resyncHuntProgress(huntId: string) {
  const liveItems = await db.$count(
    scavengerHuntItems,
    and(
      eq(scavengerHuntItems.huntId, huntId),
      isNull(scavengerHuntItems.archivedAt)
    )
  );

  await dbPool.execute(sql`
    update scavenger_hunt_participants p
    set completed_count = fresh.n,
        finished_at = case
          when ${liveItems} > 0 and fresh.n >= ${liveItems}
            then coalesce(p.finished_at, now())
          else null
        end
    from (
      select pp.id,
             count(c.id)::int as n
      from scavenger_hunt_participants pp
      left join scavenger_hunt_completions c on c.participant_id = pp.id
      left join scavenger_hunt_items i
        on i.id = c.item_id and i.archived_at is null
      where pp.hunt_id = ${huntId} and (c.id is null or i.id is not null)
      group by pp.id
    ) fresh
    where p.id = fresh.id
  `);
}

// ─── Admin Queries ─────────────────────────────────────────────────────────

export async function getHunts() {
  const { schoolId } = await assertHuntManager();

  const hunts = await db.query.scavengerHunts.findMany({
    where: eq(scavengerHunts.schoolId, schoolId),
    orderBy: [desc(scavengerHunts.createdAt)],
    with: {
      items: true,
      catalogEntry: { columns: { id: true, title: true } },
    },
  });

  if (hunts.length === 0) return [];

  // One grouped count instead of a query per hunt.
  const playerCounts = await db
    .select({
      huntId: scavengerHuntParticipants.huntId,
      total: count(),
      finishers: sql<number>`count(${scavengerHuntParticipants.finishedAt})::int`,
    })
    .from(scavengerHuntParticipants)
    .where(
      inArray(
        scavengerHuntParticipants.huntId,
        hunts.map((h) => h.id)
      )
    )
    .groupBy(scavengerHuntParticipants.huntId);

  const countMap = new Map(playerCounts.map((c) => [c.huntId, c]));

  return hunts.map((hunt) => ({
    ...hunt,
    itemCount: hunt.items.filter((i) => !i.archivedAt).length,
    playerCount: countMap.get(hunt.id)?.total ?? 0,
    finisherCount: countMap.get(hunt.id)?.finishers ?? 0,
  }));
}

export async function getHuntDetail(huntId: string) {
  const { schoolId } = await assertHuntManager();
  await assertHuntInSchool(huntId, schoolId);

  const hunt = await db.query.scavengerHunts.findFirst({
    where: eq(scavengerHunts.id, huntId),
    with: {
      items: {
        orderBy: [
          asc(scavengerHuntItems.sortOrder),
          asc(scavengerHuntItems.title),
        ],
      },
      // Participants are deliberately not loaded here — the page reads them
      // from `getHuntResults`, and eager-loading every player would grow
      // unbounded over the course of an event.
      // Names the board member who last cleared the hunt, so the settings page
      // can explain an empty leaderboard instead of leaving it a mystery.
      resetter: { columns: { name: true } },
    },
  });
  if (!hunt) throw new Error("Hunt not found");

  const huntUrl = buildHuntUrl(hunt.qrCode);
  const qrDataUrl = huntUrl ? await toQrDataUrl(huntUrl) : null;

  // Campaigns the board can point finishers at. Archived ones are excluded —
  // their QR code is dead, so a finish screen that linked to one would 404.
  // Status is surfaced so the dropdown can warn about a not-yet-live pick.
  const campaigns = await db.query.volunteerCampaigns.findMany({
    where: and(
      eq(volunteerCampaigns.schoolId, schoolId),
      isNull(volunteerCampaigns.archivedAt)
    ),
    columns: { id: true, title: true, status: true },
    orderBy: [desc(volunteerCampaigns.createdAt)],
  });

  // Recurring events this hunt can be filed under. Retired entries are included
  // only when this hunt is already filed under one, so the picker can render
  // the current value instead of silently showing "Not linked".
  const catalogEntries = await db.query.eventCatalog.findMany({
    where: and(
      eq(eventCatalog.schoolId, schoolId),
      hunt.eventCatalogId
        ? sql`(${eventCatalog.isActive} = true or ${eventCatalog.id} = ${hunt.eventCatalogId})`
        : eq(eventCatalog.isActive, true)
    ),
    columns: { id: true, title: true, typicalMonth: true, isActive: true },
    orderBy: [asc(eventCatalog.title)],
  });

  // This school year's plan for that same recurring event, if the board is
  // running one — the other side of the link the plan page shows. Matched on
  // school year so a hunt never points at a plan from a different fall.
  const eventPlan = hunt.eventCatalogId
    ? ((await db.query.eventPlans.findFirst({
        where: and(
          eq(eventPlans.schoolId, schoolId),
          eq(eventPlans.eventCatalogId, hunt.eventCatalogId),
          eq(eventPlans.schoolYear, hunt.schoolYear)
        ),
        columns: { id: true, title: true },
      })) ?? null)
    : null;

  return { hunt, huntUrl, qrDataUrl, campaigns, catalogEntries, eventPlan };
}

/**
 * Hunts grouped by the recurring event they were run at, for the catalog admin.
 *
 * Board-only, like every other query in this file — the catalog page it feeds
 * is a board hub page. Ordered newest school year first so the entry reads as a
 * history: this year's hunt on top, last year's underneath it.
 */
export async function getHuntsByCatalogEntry() {
  const { schoolId } = await assertHuntManager();

  const rows = await db.query.scavengerHunts.findMany({
    where: and(
      eq(scavengerHunts.schoolId, schoolId),
      isNotNull(scavengerHunts.eventCatalogId)
    ),
    columns: {
      id: true,
      title: true,
      schoolYear: true,
      status: true,
      eventCatalogId: true,
      archivedAt: true,
    },
    orderBy: [desc(scavengerHunts.schoolYear), desc(scavengerHunts.createdAt)],
  });

  const byCatalogId: Record<string, typeof rows> = {};
  for (const row of rows) {
    const key = row.eventCatalogId!;
    (byCatalogId[key] ??= []).push(row);
  }
  return byCatalogId;
}

function buildHuntUrl(qrCode: string): string {
  const baseUrl = getAppBaseUrl();
  return baseUrl ? `${baseUrl}/hunt/${qrCode}` : "";
}

function toQrDataUrl(url: string) {
  return QRCode.toDataURL(url, {
    width: 400,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/** Everything the board watches on a laptop during the event. */
export async function getHuntResults(huntId: string) {
  const { schoolId } = await assertHuntManager();
  await assertHuntInSchool(huntId, schoolId);

  const items = await db.query.scavengerHuntItems.findMany({
    where: and(
      eq(scavengerHuntItems.huntId, huntId),
      isNull(scavengerHuntItems.archivedAt)
    ),
    orderBy: [asc(scavengerHuntItems.sortOrder)],
  });

  const players = await db.query.scavengerHuntParticipants.findMany({
    where: eq(scavengerHuntParticipants.huntId, huntId),
    orderBy: [
      asc(scavengerHuntParticipants.finishedAt),
      desc(scavengerHuntParticipants.completedCount),
    ],
  });

  // Per-item completion counts, so the board can see which booth nobody found.
  const perItem =
    items.length === 0
      ? []
      : await db
          .select({
            itemId: scavengerHuntCompletions.itemId,
            total: count(),
          })
          .from(scavengerHuntCompletions)
          .where(
            inArray(
              scavengerHuntCompletions.itemId,
              items.map((i) => i.id)
            )
          )
          .groupBy(scavengerHuntCompletions.itemId);

  const perItemMap = new Map(perItem.map((r) => [r.itemId, r.total]));
  const finishers = players.filter((p) => p.finishedAt);

  // Saved answers, only for the items configured to keep them. Joined to the
  // participant so each row carries the anonymous handle it belongs to.
  const responseItemIds = items.filter((i) => i.saveResponses).map((i) => i.id);
  const responseRows =
    responseItemIds.length === 0
      ? []
      : await db
          .select({
            itemId: scavengerHuntItemResponses.itemId,
            answers: scavengerHuntItemResponses.answers,
            answeredAt: scavengerHuntItemResponses.createdAt,
            handle: scavengerHuntParticipants.handle,
            handleEmoji: scavengerHuntParticipants.handleEmoji,
          })
          .from(scavengerHuntItemResponses)
          .innerJoin(
            scavengerHuntParticipants,
            eq(
              scavengerHuntParticipants.id,
              scavengerHuntItemResponses.participantId
            )
          )
          .where(inArray(scavengerHuntItemResponses.itemId, responseItemIds))
          .orderBy(asc(scavengerHuntItemResponses.createdAt));

  const responsesByItem = new Map<string, typeof responseRows>();
  for (const r of responseRows) {
    const arr = responsesByItem.get(r.itemId) ?? [];
    arr.push(r);
    responsesByItem.set(r.itemId, arr);
  }

  return {
    totalItems: items.length,
    playerCount: players.length,
    finisherCount: finishers.length,
    // Ordered by finish time, so the row order is the prize-handout order.
    finishers: finishers.map((p, index) => ({
      rank: index + 1,
      handle: p.handle,
      handleEmoji: p.handleEmoji,
      startedAt: p.startedAt,
      finishedAt: p.finishedAt,
      claimedName: p.claimedName,
      claimedEmail: p.claimedEmail,
    })),
    inProgress: players
      .filter((p) => !p.finishedAt)
      .sort((a, b) => b.completedCount - a.completedCount)
      .map((p) => ({
        handle: p.handle,
        handleEmoji: p.handleEmoji,
        completedCount: p.completedCount,
        startedAt: p.startedAt,
        lastActiveAt: p.lastActiveAt,
      })),
    items: items.map((item) => {
      const itemResponses = responsesByItem.get(item.id) ?? [];

      // Tally yes/no by prompt text, then order by the item's current
      // questions. Keying on the snapshotted prompt (not question index or id)
      // keeps a mid-event edit from mislabeling votes already cast; any answers
      // to a prompt no longer on the item are appended after the current ones.
      const tallyMap = new Map<string, { yes: number; no: number }>();
      for (const r of itemResponses) {
        for (const a of r.answers) {
          const t = tallyMap.get(a.prompt) ?? { yes: 0, no: 0 };
          t[a.answer] += 1;
          tallyMap.set(a.prompt, t);
        }
      }
      const orderedPrompts = [
        ...item.questions.map((q) => q.prompt),
        ...[...tallyMap.keys()].filter(
          (p) => !item.questions.some((q) => q.prompt === p)
        ),
      ];
      const tally = orderedPrompts
        .filter((p, i, arr) => arr.indexOf(p) === i && tallyMap.has(p))
        .map((p) => ({ prompt: p, ...tallyMap.get(p)! }));

      return {
        id: item.id,
        title: item.title,
        emoji: item.emoji,
        completedBy: perItemMap.get(item.id) ?? 0,
        saveResponses: item.saveResponses,
        tally,
        responses: itemResponses.map((r) => ({
          handle: r.handle,
          handleEmoji: r.handleEmoji,
          answers: r.answers,
          answeredAt: r.answeredAt,
        })),
      };
    }),
  };
}

export async function exportHuntFinishers(huntId: string) {
  const results = await getHuntResults(huntId);

  const header = "Rank,Handle,Name,Email,Started,Finished";
  const rows = results.finishers.map((f) =>
    [
      String(f.rank),
      `${f.handleEmoji} ${f.handle}`,
      f.claimedName ?? "",
      f.claimedEmail ?? "",
      f.startedAt ? new Date(f.startedAt).toLocaleString() : "",
      f.finishedAt ? new Date(f.finishedAt).toLocaleString() : "",
    ]
      .map(csvCell)
      .join(",")
  );

  return [header, ...rows].join("\n");
}

function csvCell(value: string) {
  // Quote every cell so commas and quotes in a claimed name survive.
  return `"${value.replace(/"/g, '""')}"`;
}

// ─── Public: hunt resolution ───────────────────────────────────────────────

/**
 * `isHuntOpen` as a WHERE clause, for the queries that pick a hunt *out of*
 * several rather than validating one they were handed. Filtering in SQL is what
 * keeps a closed hunt from being selected and then rejected in JS, which reads
 * as "no hunt" even when a live one is sitting right next to it.
 */
function openHuntFilter(now = new Date()) {
  return and(
    isNull(scavengerHunts.archivedAt),
    eq(scavengerHunts.status, "active"),
    or(isNull(scavengerHunts.opensAt), lte(scavengerHunts.opensAt, now)),
    or(isNull(scavengerHunts.closesAt), gte(scavengerHunts.closesAt, now))
  );
}

/** True when a hunt should accept play right now. */
function isHuntOpen(hunt: {
  status: HuntStatus | string;
  opensAt: Date | null;
  closesAt: Date | null;
  archivedAt?: Date | null;
}) {
  // Archiving already forces status to "closed"; checking both means a later
  // status edit can't quietly republish a retired QR code.
  if (hunt.archivedAt) return false;
  if (hunt.status !== "active") return false;
  const now = new Date();
  if (hunt.opensAt && now < hunt.opensAt) return false;
  if (hunt.closesAt && now > hunt.closesAt) return false;
  return true;
}

/**
 * The gate every public action goes through.
 *
 * Each one re-resolves the hunt from the code it was handed rather than
 * trusting anything the client remembered, so a hunt that closed mid-session
 * stops accepting writes on the very next tap.
 */
async function resolveOpenHunt(code: string) {
  const hunt = await db.query.scavengerHunts.findFirst({
    where: eq(scavengerHunts.qrCode, code),
    with: { school: { columns: { name: true } } },
  });
  if (!hunt || !isHuntOpen(hunt)) return null;
  return hunt;
}

function huntCookieName(huntId: string) {
  // Per-hunt so a second hunt later doesn't collide with this one's token.
  return `hunt_${huntId}`;
}

/**
 * Only the hash is ever stored, so a database leak can't be replayed to
 * impersonate a participant — the raw token exists solely in the cookie.
 */
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Resolves the caller's participant row from their cookie, or null. */
async function getParticipantFromCookie(huntId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(huntCookieName(huntId))?.value;
  if (!token) return null;

  const participant = await db.query.scavengerHuntParticipants.findFirst({
    where: and(
      eq(scavengerHuntParticipants.huntId, huntId),
      eq(scavengerHuntParticipants.tokenHash, hashToken(token))
    ),
  });
  // A stale token that no longer resolves drops back to the landing screen
  // rather than erroring — see the lost-cookie note in the spec.
  return participant ?? null;
}

async function liveItemCount(huntId: string) {
  return db.$count(
    scavengerHuntItems,
    and(
      eq(scavengerHuntItems.huntId, huntId),
      isNull(scavengerHuntItems.archivedAt)
    )
  );
}

/** How many players finished at or before this one — the podium position. */
async function finishRank(huntId: string, finishedAt: Date) {
  return db.$count(
    scavengerHuntParticipants,
    and(
      eq(scavengerHuntParticipants.huntId, huntId),
      isNotNull(scavengerHuntParticipants.finishedAt),
      lte(scavengerHuntParticipants.finishedAt, finishedAt)
    )
  );
}

// ─── Public: page data ─────────────────────────────────────────────────────

export interface PublicHuntItem {
  id: string;
  title: string;
  description: string | null;
  emoji: string;
  linkUrl: string | null;
  linkLabel: string | null;
  linkOpenMode: LinkOpenMode;
  // Embedded inline on the card — the thing a family should see without having
  // to decide to open an attachment.
  imageUrl: string | null;
  imageAlt: string | null;
  imageFit: HuntImageFit;
  // A non-empty list turns the check target into a question flow instead of a
  // one-tap toggle. `saveResponses` tells the flow to warn that answers are
  // shared with the board.
  questions: HuntQuestion[];
  saveResponses: boolean;
  done: boolean;
}

export interface PublicHuntParticipant {
  handle: string;
  handleEmoji: string;
  completedCount: number;
  finishedAt: Date | null;
  finishRank: number | null;
  hasClaimedContact: boolean;
}

export interface PublicHunt {
  code: string;
  title: string;
  intro: string | null;
  completionMessage: string | null;
  collectFinisherContact: boolean;
  schoolName: string;
  totalItems: number;
  items: PublicHuntItem[];
  participant: PublicHuntParticipant | null;
  /**
   * The volunteer campaign a finisher is invited into — the hunt's conversion
   * goal, and the on-ramp to DragonHub. Null unless the board configured a
   * campaign that is currently open.
   */
  finisherCta: { url: string; campaignTitle: string } | null;
}

/**
 * Everything `/hunt/[code]` renders, for both the landing and the board.
 * Unauthenticated by design — the code plus an open hunt is the authorization.
 */
export async function getHuntPageData(
  code: string
): Promise<PublicHunt | null> {
  const hunt = await resolveOpenHunt(code);
  if (!hunt) return null;

  const items = await db.query.scavengerHuntItems.findMany({
    where: and(
      eq(scavengerHuntItems.huntId, hunt.id),
      isNull(scavengerHuntItems.archivedAt)
    ),
    orderBy: [asc(scavengerHuntItems.sortOrder), asc(scavengerHuntItems.title)],
  });
  // A hunt with nothing to find isn't playable; treat it like a closed one so
  // nobody starts a game they can't finish.
  if (items.length === 0) return null;

  const participant = await getParticipantFromCookie(hunt.id);

  let doneIds = new Set<string>();
  if (participant) {
    const completions = await db.query.scavengerHuntCompletions.findMany({
      where: eq(scavengerHuntCompletions.participantId, participant.id),
      columns: { itemId: true },
    });
    doneIds = new Set(completions.map((c) => c.itemId));
  }

  return {
    code: hunt.qrCode,
    title: hunt.title,
    intro: hunt.intro,
    completionMessage: hunt.completionMessage,
    collectFinisherContact: hunt.collectFinisherContact,
    schoolName: hunt.school.name,
    totalItems: items.length,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      emoji: item.emoji,
      linkUrl: item.linkUrl,
      linkLabel: item.linkLabel,
      linkOpenMode: parseLinkOpenMode(item.linkOpenMode),
      imageUrl: item.imageUrl,
      imageAlt: item.imageAlt,
      imageFit: parseHuntImageFit(item.imageFit),
      questions: item.questions,
      saveResponses: item.saveResponses,
      done: doneIds.has(item.id),
    })),
    participant: participant
      ? {
          handle: participant.handle,
          handleEmoji: participant.handleEmoji,
          completedCount: participant.completedCount,
          finishedAt: participant.finishedAt,
          finishRank: participant.finishedAt
            ? await finishRank(hunt.id, participant.finishedAt)
            : null,
          hasClaimedContact: Boolean(
            participant.claimedName || participant.claimedEmail
          ),
        }
      : null,
    finisherCta: await resolveFinisherCta(hunt.ctaCampaignId),
  };
}

/**
 * Resolves a hunt's configured campaign to the link a finisher taps.
 *
 * Only returns a link when the campaign is open right now: a closed or
 * scheduled campaign's public page shows "no longer accepting responses", and
 * sending a finisher there is worse than showing no button at all.
 */
async function resolveFinisherCta(
  ctaCampaignId: string | null
): Promise<{ url: string; campaignTitle: string } | null> {
  if (!ctaCampaignId) return null;

  const campaign = await db.query.volunteerCampaigns.findFirst({
    where: eq(volunteerCampaigns.id, ctaCampaignId),
    columns: {
      qrCode: true,
      title: true,
      status: true,
      opensAt: true,
      closesAt: true,
      archivedAt: true,
    },
  });
  if (!campaign) return null;

  // Same open-ness rule the campaign page enforces on itself, inlined so this
  // stays a leaf dependency of the hunt flow rather than importing it back.
  if (campaign.archivedAt || campaign.status !== "active") return null;
  const now = new Date();
  if (campaign.opensAt && now < campaign.opensAt) return null;
  if (campaign.closesAt && now > campaign.closesAt) return null;

  // getPublicCampaign also 404s when the campaign has no live (non-archived)
  // events, which would render the finish-screen button but dead-link it. Match
  // that rule so we never point finishers at a "Sign-up Closed" page.
  const liveEvent = await db.query.volunteerCampaignEvents.findFirst({
    where: and(
      eq(volunteerCampaignEvents.campaignId, ctaCampaignId),
      isNull(volunteerCampaignEvents.archivedAt)
    ),
    columns: { id: true },
  });
  if (!liveEvent) return null;

  return {
    url: `/volunteer-interest/${campaign.qrCode}`,
    campaignTitle: campaign.title,
  };
}

// ─── Public: start ─────────────────────────────────────────────────────────

export interface StartHuntResult {
  success: boolean;
  handle?: string;
  handleEmoji?: string;
  error?: string;
}

/**
 * Creates the participant and issues the cookie that identifies them for the
 * rest of the evening. Idempotent for a device that already started.
 */
export async function startHunt(code: string): Promise<StartHuntResult> {
  const hunt = await resolveOpenHunt(code);
  if (!hunt) {
    return { success: false, error: "This hunt isn't open right now." };
  }

  const existing = await getParticipantFromCookie(hunt.id);
  if (existing) {
    return {
      success: true,
      handle: existing.handle,
      handleEmoji: existing.handleEmoji,
    };
  }

  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);

  // Retry the unique(huntId, handle) violation. After 5 collisions fall back to
  // a numbered handle, which is a guaranteed terminator rather than a loop that
  // could in principle never land.
  let created: { handle: string; handleEmoji: string } | null = null;
  for (let attempt = 0; attempt < 6 && !created; attempt++) {
    const candidate = attempt < 5 ? randomHandle() : suffixedHandle();
    try {
      const [row] = await db
        .insert(scavengerHuntParticipants)
        .values({
          huntId: hunt.id,
          handle: candidate.handle,
          handleEmoji: candidate.emoji,
          tokenHash,
        })
        .returning({
          handle: scavengerHuntParticipants.handle,
          handleEmoji: scavengerHuntParticipants.handleEmoji,
        });
      created = row;
    } catch (error) {
      // Only a handle collision is retryable; anything else is a real failure.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("scavenger_hunt_participants_handle_unique")) {
        console.error("Failed to start hunt:", error);
        return {
          success: false,
          error: "Couldn't start the hunt. Please try again.",
        };
      }
    }
  }

  if (!created) {
    return {
      success: false,
      error: "Couldn't start the hunt. Please try again.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(huntCookieName(hunt.id), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Root path rather than "/hunt": the leaderboard endpoint the board polls
    // lives under /api/hunt/..., which a "/hunt"-scoped cookie would never be
    // sent to, and `isYou` is resolved from this cookie server-side.
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // one week — BTSN plus stragglers
  });

  revalidatePath(`/hunt/${hunt.qrCode}`);
  return {
    success: true,
    handle: created.handle,
    handleEmoji: created.handleEmoji,
  };
}

// ─── Public: toggle ────────────────────────────────────────────────────────

export interface ToggleResult {
  success: boolean;
  done?: boolean;
  completedCount?: number;
  totalItems?: number;
  justFinished?: boolean;
  finishRank?: number | null;
  error?: string;
}

/**
 * Checks an item on or off for the caller's participant.
 *
 * The completion row and the denormalized `completedCount` are written in one
 * transaction, so the leaderboard's cached score can never drift from the rows
 * it summarizes.
 */
export async function toggleHuntItem(
  code: string,
  itemId: string
): Promise<ToggleResult> {
  const hunt = await resolveOpenHunt(code);
  if (!hunt) {
    return { success: false, error: "This hunt isn't open right now." };
  }

  const participant = await getParticipantFromCookie(hunt.id);
  if (!participant) {
    return { success: false, error: "Start the hunt first." };
  }

  // Never trust an id from the client: walk it back to the hunt the code
  // resolved to before writing anything.
  const item = await db.query.scavengerHuntItems.findFirst({
    where: eq(scavengerHuntItems.id, itemId),
    columns: {
      id: true,
      huntId: true,
      archivedAt: true,
      questions: true,
      saveResponses: true,
    },
  });
  if (!item || item.huntId !== hunt.id || item.archivedAt) {
    return { success: false, error: "That item is no longer on this hunt." };
  }

  // A question item is completed only through submitHuntItemAnswers. A tap on
  // its check target can therefore only mean "uncheck" — if it isn't already
  // done, completing it has to go through the flow, so refuse rather than mark
  // it done without recording an answer.
  if (item.questions.length > 0) {
    const [alreadyDone] = await db
      .select({ id: scavengerHuntCompletions.id })
      .from(scavengerHuntCompletions)
      .where(
        and(
          eq(scavengerHuntCompletions.participantId, participant.id),
          eq(scavengerHuntCompletions.itemId, item.id)
        )
      );
    if (!alreadyDone) {
      return { success: false, error: "Answer the questions to check this off." };
    }
    // A done question item that saves its responses is a cast budget vote, and
    // a vote can't be withdrawn: an un-check here would delete the recorded
    // answers from the PTA's results. Refuse rather than clear.
    if (item.saveResponses) {
      return {
        success: false,
        error: "Your answers are recorded and can't be cleared.",
      };
    }
  }

  const totalItems = await liveItemCount(hunt.id);

  const result = await dbPool.transaction(async (tx) => {
    const existing = await tx
      .select({ id: scavengerHuntCompletions.id })
      .from(scavengerHuntCompletions)
      .where(
        and(
          eq(scavengerHuntCompletions.participantId, participant.id),
          eq(scavengerHuntCompletions.itemId, item.id)
        )
      );

    const nowDone = existing.length === 0;
    if (nowDone) {
      await tx
        .insert(scavengerHuntCompletions)
        .values({ participantId: participant.id, itemId: item.id })
        // A double-tap races two inserts; the unique index makes the loser a
        // no-op instead of an error.
        .onConflictDoNothing();
    } else {
      await tx
        .delete(scavengerHuntCompletions)
        .where(
          and(
            eq(scavengerHuntCompletions.participantId, participant.id),
            eq(scavengerHuntCompletions.itemId, item.id)
          )
        );
      // Clearing a check clears the recorded vote with it — an un-checked item
      // shouldn't leave a stale answer in the results.
      await tx
        .delete(scavengerHuntItemResponses)
        .where(
          and(
            eq(scavengerHuntItemResponses.participantId, participant.id),
            eq(scavengerHuntItemResponses.itemId, item.id)
          )
        );
    }

    // Recount from the rows rather than incrementing, so a lost race or a
    // mid-event item archive can't leave the counter permanently wrong.
    const [{ n }] = await tx
      .select({ n: count() })
      .from(scavengerHuntCompletions)
      .innerJoin(
        scavengerHuntItems,
        eq(scavengerHuntItems.id, scavengerHuntCompletions.itemId)
      )
      .where(
        and(
          eq(scavengerHuntCompletions.participantId, participant.id),
          isNull(scavengerHuntItems.archivedAt)
        )
      );

    const completedCount = Number(n);
    const isComplete = totalItems > 0 && completedCount >= totalItems;
    const finishedAt = isComplete
      ? (participant.finishedAt ?? new Date())
      : null;

    await tx
      .update(scavengerHuntParticipants)
      .set({ completedCount, finishedAt, lastActiveAt: new Date() })
      .where(eq(scavengerHuntParticipants.id, participant.id));

    return {
      nowDone,
      completedCount,
      finishedAt,
      justFinished: isComplete && !participant.finishedAt,
    };
  });

  return {
    success: true,
    done: result.nowDone,
    completedCount: result.completedCount,
    totalItems,
    justFinished: result.justFinished,
    finishRank: result.finishedAt
      ? await finishRank(hunt.id, result.finishedAt)
      : null,
  };
}

/**
 * Completes a question item by recording the participant's answers.
 *
 * This is the completing counterpart to `toggleHuntItem` for items that carry a
 * question flow: the same hunt/participant/item guards, the same transactional
 * recount so the leaderboard can't drift, plus the gate re-evaluated
 * server-side. The client's answers are never trusted directly — only the
 * answers `reachableAnswers` says the player was allowed to give are stored, and
 * only when the item is configured to save them.
 */
export async function submitHuntItemAnswers(
  code: string,
  itemId: string,
  rawAnswers: Record<string, unknown>
): Promise<ToggleResult> {
  const hunt = await resolveOpenHunt(code);
  if (!hunt) {
    return { success: false, error: "This hunt isn't open right now." };
  }

  const participant = await getParticipantFromCookie(hunt.id);
  if (!participant) {
    return { success: false, error: "Start the hunt first." };
  }

  const item = await db.query.scavengerHuntItems.findFirst({
    where: eq(scavengerHuntItems.id, itemId),
    columns: {
      id: true,
      huntId: true,
      archivedAt: true,
      questions: true,
      saveResponses: true,
    },
  });
  if (!item || item.huntId !== hunt.id || item.archivedAt) {
    return { success: false, error: "That item is no longer on this hunt." };
  }
  if (item.questions.length === 0) {
    // Nothing to answer — this item is a plain toggle. Steer the caller there
    // rather than silently completing without the flow they think they're in.
    return { success: false, error: "This item doesn't ask any questions." };
  }

  const answers = reachableAnswers(item.questions, rawAnswers ?? {});
  if (!answers) {
    return { success: false, error: "Please answer the first question." };
  }

  const totalItems = await liveItemCount(hunt.id);

  const result = await dbPool.transaction(async (tx) => {
    await tx
      .insert(scavengerHuntCompletions)
      .values({ participantId: participant.id, itemId: item.id })
      // Re-submitting (they changed an answer) shouldn't error on the second
      // completion — the row already exists and that's fine.
      .onConflictDoNothing();

    if (item.saveResponses) {
      await tx
        .insert(scavengerHuntItemResponses)
        .values({ participantId: participant.id, itemId: item.id, answers })
        // Re-answering overwrites the prior snapshot for this participant+item.
        .onConflictDoUpdate({
          target: [
            scavengerHuntItemResponses.participantId,
            scavengerHuntItemResponses.itemId,
          ],
          set: { answers, updatedAt: new Date() },
        });
    }

    // Recount from the rows rather than incrementing — identical to
    // toggleHuntItem, so an archive or a lost race can't leave the score wrong.
    const [{ n }] = await tx
      .select({ n: count() })
      .from(scavengerHuntCompletions)
      .innerJoin(
        scavengerHuntItems,
        eq(scavengerHuntItems.id, scavengerHuntCompletions.itemId)
      )
      .where(
        and(
          eq(scavengerHuntCompletions.participantId, participant.id),
          isNull(scavengerHuntItems.archivedAt)
        )
      );

    const completedCount = Number(n);
    const isComplete = totalItems > 0 && completedCount >= totalItems;
    const finishedAt = isComplete
      ? (participant.finishedAt ?? new Date())
      : null;

    await tx
      .update(scavengerHuntParticipants)
      .set({ completedCount, finishedAt, lastActiveAt: new Date() })
      .where(eq(scavengerHuntParticipants.id, participant.id));

    return {
      completedCount,
      finishedAt,
      justFinished: isComplete && !participant.finishedAt,
    };
  });

  return {
    success: true,
    done: true,
    completedCount: result.completedCount,
    totalItems,
    justFinished: result.justFinished,
    finishRank: result.finishedAt
      ? await finishRank(hunt.id, result.finishedAt)
      : null,
  };
}

// ─── Public: prize claim ───────────────────────────────────────────────────

export interface ClaimResult {
  success: boolean;
  error?: string;
}

/**
 * Optional contact details from a finisher, for prize handoff only.
 *
 * Deliberately a grown-up's name and email: the copy never asks for a
 * student's name, and nothing here is required to have played.
 */
export async function claimFinisherContact(
  code: string,
  data: { name: string; email: string }
): Promise<ClaimResult> {
  const hunt = await resolveOpenHunt(code);
  if (!hunt) {
    return { success: false, error: "This hunt isn't open right now." };
  }
  if (!hunt.collectFinisherContact) {
    return { success: false, error: "This hunt isn't collecting contacts." };
  }

  const participant = await getParticipantFromCookie(hunt.id);
  if (!participant) {
    return { success: false, error: "Start the hunt first." };
  }
  if (!participant.finishedAt) {
    return { success: false, error: "Finish the hunt first." };
  }

  const name = data.name.trim();
  const email = data.email.trim().toLowerCase();
  if (!name) return { success: false, error: "Please add a name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: "Please add a valid email address." };
  }

  await db
    .update(scavengerHuntParticipants)
    .set({ claimedName: name, claimedEmail: email, lastActiveAt: new Date() })
    .where(eq(scavengerHuntParticipants.id, participant.id));

  revalidatePath(`/admin/scavenger-hunts/${hunt.id}`);
  return { success: true };
}

// ─── Public: leaderboard ───────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank?: number;
  handle: string;
  emoji: string;
  completed: number;
  finishedAt: Date | null;
  isYou: boolean;
}

export interface LeaderboardPayload {
  totalItems: number;
  participantCount: number;
  finishers: LeaderboardEntry[];
  inProgress: LeaderboardEntry[];
  you: LeaderboardEntry | null;
}

const BOARD_SIZE = 5;

/**
 * The polled board. Two queries against `scavenger_hunt_participants` alone —
 * no joins — which is exactly what the denormalized `completedCount` buys at
 * 200 phones refreshing every five seconds.
 *
 * `isYou` is resolved from the cookie server-side, so the client never learns
 * another participant's identity beyond their public handle.
 */
export async function getHuntLeaderboard(
  code: string
): Promise<LeaderboardPayload | null> {
  const hunt = await resolveOpenHunt(code);
  if (!hunt) return null;

  const me = await getParticipantFromCookie(hunt.id);

  const [totalItems, participantCount, finishers, inProgress] =
    await Promise.all([
      liveItemCount(hunt.id),
      db.$count(
        scavengerHuntParticipants,
        eq(scavengerHuntParticipants.huntId, hunt.id)
      ),
      db.query.scavengerHuntParticipants.findMany({
        where: and(
          eq(scavengerHuntParticipants.huntId, hunt.id),
          isNotNull(scavengerHuntParticipants.finishedAt)
        ),
        orderBy: [asc(scavengerHuntParticipants.finishedAt)],
        limit: BOARD_SIZE,
      }),
      db.query.scavengerHuntParticipants.findMany({
        where: and(
          eq(scavengerHuntParticipants.huntId, hunt.id),
          isNull(scavengerHuntParticipants.finishedAt),
          sql`${scavengerHuntParticipants.completedCount} > 0`
        ),
        // Tiebreak on startedAt: whoever got to the same score first ranks
        // higher, which is how people intuitively read a race.
        orderBy: [
          desc(scavengerHuntParticipants.completedCount),
          asc(scavengerHuntParticipants.startedAt),
        ],
        limit: BOARD_SIZE,
      }),
    ]);

  const toEntry = (
    p: typeof scavengerHuntParticipants.$inferSelect,
    rank?: number
  ): LeaderboardEntry => ({
    rank,
    handle: p.handle,
    emoji: p.handleEmoji,
    completed: p.completedCount,
    finishedAt: p.finishedAt,
    isYou: me?.id === p.id,
  });

  return {
    totalItems,
    participantCount,
    finishers: finishers.map((p, i) => toEntry(p, i + 1)),
    inProgress: inProgress.map((p) => toEntry(p)),
    // Always returned, even when off the podium, so everyone has a personal
    // stat to watch.
    you: me
      ? toEntry(
          me,
          me.finishedAt
            ? await finishRank(hunt.id, me.finishedAt)
            : undefined
        )
      : null,
  };
}

// ─── Public: cross-link ────────────────────────────────────────────────────

export interface HuntPromo {
  code: string;
  title: string;
  intro: string | null;
}

/**
 * The hunt, if any, to promote on this school's volunteer signup success
 * screen. Returns null so that flow renders exactly as it does today when no
 * hunt opts in.
 */
export async function getSignupSuccessHuntByQrCode(
  volunteerQrCode: string
): Promise<HuntPromo | null> {
  const school = await db.query.schools.findFirst({
    where: eq(schools.volunteerQrCode, volunteerQrCode),
    columns: { id: true },
  });
  if (!school) return null;

  const schoolYear = await getSchoolCurrentYear(school.id);
  // Openness is part of the WHERE, not a check on whatever row came back: a
  // retired hunt that still carries the flag (a test run, a hunt whose
  // successor took the slot) must not be able to shadow the live one. The
  // ordering is the second half of that — with the flag held exclusively it
  // picks the only row, and if one ever slips through it picks the newest.
  const hunt = await db.query.scavengerHunts.findFirst({
    where: and(
      eq(scavengerHunts.schoolId, school.id),
      eq(scavengerHunts.schoolYear, schoolYear),
      eq(scavengerHunts.showOnSignupSuccess, true),
      openHuntFilter()
    ),
    orderBy: [desc(scavengerHunts.createdAt)],
  });
  if (!hunt) return null;

  // Same rule as the hunt page: nothing to find means nothing to promote.
  const items = await liveItemCount(hunt.id);
  if (items === 0) return null;

  return { code: hunt.qrCode, title: hunt.title, intro: hunt.intro };
}
