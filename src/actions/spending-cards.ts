"use server";

import {
  assertAuthenticated,
  assertEventPlanAccess,
  assertPtaBoardMember,
  assertTreasurer,
  getCurrentSchoolId,
  isReimbursementViewer,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  budgetCategories,
  eventPlans,
  reimbursementReceipts,
  schoolMemberships,
  spendingCardRequests,
  users,
} from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notify } from "@/lib/notify";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getReimbursementPolicy } from "@/lib/reimbursement-policy";
import { parseMoney, toMoneyString } from "@/lib/reimbursements-shared";
import type { SpendingCardStatus } from "@/lib/spending-cards-shared";

/**
 * Pre-funded spending cards.
 *
 * The volunteer who cannot float $400 of their own money for the carnival is
 * the reason this exists, and the substantiation trail is why it isn't simply a
 * cash advance: a card transaction never becomes a check, but the IRS wants the
 * same itemized proof of what was bought and why, plus the unspent balance
 * returned. So the receipts live in `reimbursement_receipts` beside every other
 * receipt, and reconciliation is a first-class step rather than an afterthought.
 *
 * Everything here is gated on `policy.spendingCardsEnabled`. A school in a state
 * whose PTA doesn't run cards must not be able to reach these actions even by
 * calling them directly — the gate is here, not only in the UI.
 */

export interface SpendingCardInput {
  eventPlanId?: string | null;
  eventLabel?: string | null;
  purpose: string;
  requestedAmount: string;
  budgetCategoryId?: string | null;
}

export interface SpendingCardView {
  id: string;
  status: SpendingCardStatus;
  purpose: string;
  requestedAmount: string;
  issuedAmount: string | null;
  spentAmount: string | null;
  cardLabel: string | null;
  issuedAt: string | null;
  reconciledAt: string | null;
  reconciliationNote: string | null;
  deniedReason: string | null;
  eventPlanId: string | null;
  eventPlanTitle: string | null;
  eventLabel: string | null;
  budgetCategoryId: string | null;
  budgetCategoryName: string | null;
  requestedBy: string;
  requesterName: string;
  createdAt: string | null;
  receiptCount: number;
}

export interface SpendingCardDetail extends SpendingCardView {
  receipts: {
    id: string;
    blobUrl: string;
    fileName: string;
    contentType: string;
    paymentMethodHint: string | null;
  }[];
  viewer: {
    isRequester: boolean;
    isTreasurer: boolean;
    /** True while the requester may still attach receipts. */
    canAddReceipts: boolean;
  };
  /** Issued minus substantiated, once there is an issued amount to compare. */
  unaccounted: string | null;
}

// ─── Guards ─────────────────────────────────────────────────────────────────

/** School, plus the refusal when this state's PTA doesn't run cards. */
async function cardContext() {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const policy = await getReimbursementPolicy(schoolId);
  if (!policy.spendingCardsEnabled) {
    throw new Error(
      "Your state PTA doesn't run pre-funded spending cards. Submit a reimbursement request instead."
    );
  }
  return { user, schoolId };
}

async function loadCard(id: string) {
  const { user, schoolId } = await cardContext();

  const card = await db.query.spendingCardRequests.findFirst({
    where: eq(spendingCardRequests.id, id),
  });
  if (!card || card.schoolId !== schoolId) {
    throw new Error("Spending card request not found");
  }

  const isRequester = card.requestedBy === user.id;
  // The board reads; the treasurer issues and reconciles.
  const isViewer = await isReimbursementViewer(user.id!, schoolId);
  if (!isRequester && !isViewer) {
    throw new Error("Unauthorized: Not your spending card request");
  }

  return { user, schoolId, card, isRequester, isViewer };
}

/**
 * The treasurers to tell about a card request.
 *
 * Year-scoped with the same rollover fallback as `officerRecipients` in
 * `reimbursements.ts` — an approved 2019 membership still reads "treasurer",
 * and notifying that person about this year's carnival is how push gets
 * switched off.
 */
async function treasurerIds(schoolId: string): Promise<string[]> {
  const rows = await db
    .select({
      userId: schoolMemberships.userId,
      schoolYear: schoolMemberships.schoolYear,
    })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.status, "approved"),
        eq(schoolMemberships.role, "pta_board"),
        eq(schoolMemberships.boardPosition, "treasurer")
      )
    );
  if (rows.length === 0) return [];

  const currentYear = await getSchoolCurrentYear(schoolId);
  const years = [...new Set(rows.map((row) => row.schoolYear))].sort();
  const year = years.includes(currentYear) ? currentYear : years[years.length - 1];

  return [
    ...new Set(rows.filter((row) => row.schoolYear === year).map((r) => r.userId)),
  ];
}

function revalidateCard(id: string, eventPlanId?: string | null) {
  revalidatePath("/reimbursements");
  revalidatePath(`/reimbursements/cards/${id}`);
  if (eventPlanId) revalidatePath(`/events/${eventPlanId}`);
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

/**
 * Ask for a card. Same audience rule as a reimbursement: a plan member files
 * against their plan, and only the board files a general one.
 */
export async function requestSpendingCard(
  data: SpendingCardInput
): Promise<{ id: string }> {
  const { user, schoolId } = await cardContext();
  const schoolYear = await getSchoolCurrentYear(schoolId);

  if (data.eventPlanId) {
    await assertEventPlanAccess(user.id!, data.eventPlanId);
  } else {
    await assertPtaBoardMember(user.id!, schoolId);
    if (!data.eventLabel?.trim()) {
      throw new Error("Say what this card is for.");
    }
  }

  const purpose = data.purpose.trim();
  if (!purpose) throw new Error("Say what the card will be spent on.");
  if (parseMoney(data.requestedAmount) <= 0) {
    throw new Error("Ask for an amount.");
  }
  if (data.budgetCategoryId) {
    const category = await db.query.budgetCategories.findFirst({
      where: eq(budgetCategories.id, data.budgetCategoryId),
      columns: { schoolId: true },
    });
    if (!category || category.schoolId !== schoolId) {
      throw new Error("That budget category is not one of this school's");
    }
  }

  const [created] = await db
    .insert(spendingCardRequests)
    .values({
      schoolId,
      schoolYear,
      requestedBy: user.id!,
      eventPlanId: data.eventPlanId ?? null,
      eventLabel: data.eventLabel?.trim() || null,
      purpose,
      requestedAmount: toMoneyString(data.requestedAmount),
      budgetCategoryId: data.budgetCategoryId ?? null,
      status: "requested",
    })
    .returning({ id: spendingCardRequests.id });

  after(async () => {
    await notify({
      type: "reimbursement_submitted",
      schoolId,
      recipients: await treasurerIds(schoolId),
      actorId: user.id!,
      title: "Spending card requested",
      body: `${purpose} — $${toMoneyString(data.requestedAmount)}.`,
      url: `/reimbursements/cards/${created.id}`,
      groupKey: `spending_card:${created.id}`,
    });
  });

  revalidateCard(created.id, data.eventPlanId);
  return { id: created.id };
}

/** The treasurer agrees in principle; the money isn't on a card yet. */
export async function approveSpendingCard(id: string): Promise<void> {
  const { user, schoolId, card } = await loadCard(id);
  await assertTreasurer(user.id!, schoolId);
  if (card.status !== "requested") {
    throw new Error("Only a new request can be approved.");
  }

  await db
    .update(spendingCardRequests)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(spendingCardRequests.id, id));

  after(async () => {
    await notify({
      type: "reimbursement_update",
      schoolId,
      recipients: [card.requestedBy],
      actorId: user.id!,
      title: "Your spending card request was approved",
      body: `${card.purpose} — the treasurer will load the card.`,
      url: `/reimbursements/cards/${id}`,
      groupKey: `spending_card:${id}`,
    });
  });

  revalidateCard(id, card.eventPlanId);
}

export async function denySpendingCard(
  id: string,
  reason: string
): Promise<void> {
  const { user, schoolId, card } = await loadCard(id);
  await assertTreasurer(user.id!, schoolId);
  const body = reason.trim();
  if (!body) throw new Error("Give a reason.");
  if (card.status !== "requested" && card.status !== "approved") {
    throw new Error("This request is already past the point of being denied.");
  }

  await db
    .update(spendingCardRequests)
    .set({ status: "denied", deniedReason: body, updatedAt: new Date() })
    .where(eq(spendingCardRequests.id, id));

  after(async () => {
    await notify({
      type: "reimbursement_update",
      schoolId,
      recipients: [card.requestedBy],
      actorId: user.id!,
      title: "Your spending card request was declined",
      body,
      url: `/reimbursements/cards/${id}`,
      groupKey: `spending_card:${id}`,
    });
  });

  revalidateCard(id, card.eventPlanId);
}

/** The requester changed their mind, before any money moved. */
export async function cancelSpendingCard(id: string): Promise<void> {
  const { card, isRequester } = await loadCard(id);
  if (!isRequester) {
    throw new Error("Only the person who asked for the card can cancel it.");
  }
  if (card.status !== "requested" && card.status !== "approved") {
    throw new Error(
      "The card has already been issued — the treasurer has to reconcile it."
    );
  }

  await db
    .update(spendingCardRequests)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(spendingCardRequests.id, id));

  revalidateCard(id, card.eventPlanId);
}

/**
 * The card is loaded and handed over.
 *
 * `issuedAmount` is recorded separately from `requestedAmount` because the
 * treasurer often loads a rounder or smaller number than was asked for, and it
 * is the issued figure the reconciliation has to account for.
 */
export async function issueSpendingCard(
  id: string,
  data: { cardLabel: string; issuedAmount: string }
): Promise<void> {
  const { user, schoolId, card } = await loadCard(id);
  await assertTreasurer(user.id!, schoolId);
  if (card.status !== "approved") {
    throw new Error("Approve the request before issuing a card for it.");
  }

  const label = data.cardLabel.trim();
  if (!label) throw new Error("Record which card this is — a number or last four.");
  if (parseMoney(data.issuedAmount) <= 0) {
    throw new Error("Record how much was loaded onto the card.");
  }

  await db
    .update(spendingCardRequests)
    .set({
      status: "issued",
      cardLabel: label,
      issuedAmount: toMoneyString(data.issuedAmount),
      issuedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(spendingCardRequests.id, id));

  after(async () => {
    await notify({
      type: "reimbursement_update",
      schoolId,
      recipients: [card.requestedBy],
      actorId: user.id!,
      title: "Your spending card is ready",
      body: `${label} loaded with $${toMoneyString(data.issuedAmount)}. Photograph every receipt and add it to the request.`,
      url: `/reimbursements/cards/${id}`,
      groupKey: `spending_card:${id}`,
    });
  });

  revalidateCard(id, card.eventPlanId);
}

/**
 * Close the card out.
 *
 * `spentAmount` is what the receipts actually substantiate. The note is where
 * the unspent balance goes on the record — the IRS accountable-plan rule gives
 * 120 days to return it, and "returned $42.13 by check 1048" is the sentence an
 * auditor is looking for. Reconciling with no receipts at all is refused: a
 * pre-funded card with no substantiation is precisely the arrangement the rule
 * exists to prevent.
 */
export async function reconcileSpendingCard(
  id: string,
  data: { spentAmount: string; note: string }
): Promise<void> {
  const { user, schoolId, card } = await loadCard(id);
  await assertTreasurer(user.id!, schoolId);
  if (card.status !== "issued") {
    throw new Error("Only an issued card can be reconciled.");
  }

  const note = data.note.trim();
  if (!note) {
    throw new Error(
      "Record what happened to the unspent balance — that is what the reconciliation is for."
    );
  }

  const [receipts] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reimbursementReceipts)
    .where(eq(reimbursementReceipts.spendingCardRequestId, id));
  if ((receipts?.count ?? 0) === 0) {
    throw new Error(
      "No receipts have been attached. A pre-funded card needs the same substantiation as a check — chase the receipts before closing this."
    );
  }

  await db
    .update(spendingCardRequests)
    .set({
      status: "reconciled",
      spentAmount: toMoneyString(data.spentAmount),
      reconciliationNote: note,
      reconciledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(spendingCardRequests.id, id));

  after(async () => {
    await notify({
      type: "reimbursement_update",
      schoolId,
      recipients: [card.requestedBy],
      actorId: user.id!,
      title: "Your spending card is reconciled",
      body: `${card.cardLabel ?? "The card"} is closed out. ${note}`,
      url: `/reimbursements/cards/${id}`,
      groupKey: `spending_card:${id}`,
    });
  });

  revalidateCard(id, card.eventPlanId);
}

/**
 * Remove a receipt from a card that is still out being spent.
 *
 * Deliberately closed once the card is reconciled: the receipts are what the
 * reconciliation was based on, and removing one afterwards would leave a closed
 * card whose substantiation no longer adds up to what the treasurer signed off.
 */
export async function deleteSpendingCardReceipt(
  receiptId: string
): Promise<void> {
  const receipt = await db.query.reimbursementReceipts.findFirst({
    where: eq(reimbursementReceipts.id, receiptId),
    columns: { id: true, spendingCardRequestId: true },
  });
  if (!receipt?.spendingCardRequestId) throw new Error("Receipt not found");

  const { card, isRequester } = await loadCard(receipt.spendingCardRequestId);
  if (!isRequester) {
    throw new Error("Only the cardholder can remove a receipt.");
  }
  if (card.status !== "issued") {
    throw new Error("This card is closed.");
  }

  await db
    .delete(reimbursementReceipts)
    .where(eq(reimbursementReceipts.id, receiptId));

  revalidateCard(card.id, card.eventPlanId);
}

// ─── Reads ──────────────────────────────────────────────────────────────────

function cardQuery() {
  return db
    .select({
      card: spendingCardRequests,
      eventPlanTitle: eventPlans.title,
      budgetCategoryName: budgetCategories.name,
      requesterName: users.name,
      requesterEmail: users.email,
    })
    .from(spendingCardRequests)
    .leftJoin(eventPlans, eq(spendingCardRequests.eventPlanId, eventPlans.id))
    .leftJoin(
      budgetCategories,
      eq(spendingCardRequests.budgetCategoryId, budgetCategories.id)
    )
    .leftJoin(users, eq(spendingCardRequests.requestedBy, users.id));
}

type CardRow = {
  card: typeof spendingCardRequests.$inferSelect;
  eventPlanTitle: string | null;
  budgetCategoryName: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
};

async function toCardViews(rows: CardRow[]): Promise<SpendingCardView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.card.id);

  const counts = await db
    .select({
      cardId: reimbursementReceipts.spendingCardRequestId,
      count: sql<number>`count(*)::int`,
    })
    .from(reimbursementReceipts)
    .where(inArray(reimbursementReceipts.spendingCardRequestId, ids))
    .groupBy(reimbursementReceipts.spendingCardRequestId);

  const countByCard = new Map(
    counts
      .filter((row): row is { cardId: string; count: number } => !!row.cardId)
      .map((row) => [row.cardId, row.count])
  );

  return rows.map((row) => ({
    id: row.card.id,
    status: row.card.status as SpendingCardStatus,
    purpose: row.card.purpose,
    requestedAmount: row.card.requestedAmount,
    issuedAmount: row.card.issuedAmount,
    spentAmount: row.card.spentAmount,
    cardLabel: row.card.cardLabel,
    issuedAt: row.card.issuedAt?.toISOString() ?? null,
    reconciledAt: row.card.reconciledAt?.toISOString() ?? null,
    reconciliationNote: row.card.reconciliationNote,
    deniedReason: row.card.deniedReason,
    eventPlanId: row.card.eventPlanId,
    eventPlanTitle: row.eventPlanTitle,
    eventLabel: row.card.eventLabel,
    budgetCategoryId: row.card.budgetCategoryId,
    budgetCategoryName: row.budgetCategoryName,
    requestedBy: row.card.requestedBy,
    requesterName: row.requesterName || row.requesterEmail || "Unknown",
    createdAt: row.card.createdAt?.toISOString() ?? null,
    receiptCount: countByCard.get(row.card.id) ?? 0,
  }));
}

/** Mine, or — for a board member — every card at the school. */
export async function getSpendingCards(options: {
  scope: "mine" | "all";
}): Promise<SpendingCardView[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];
  const policy = await getReimbursementPolicy(schoolId);
  if (!policy.spendingCardsEnabled) return [];

  const seesAll =
    options.scope === "all" &&
    (await isReimbursementViewer(user.id!, schoolId));

  const rows = await cardQuery()
    .where(
      and(
        eq(spendingCardRequests.schoolId, schoolId),
        ...(seesAll ? [] : [eq(spendingCardRequests.requestedBy, user.id!)])
      )
    )
    .orderBy(desc(spendingCardRequests.createdAt));

  return toCardViews(rows);
}

/** A plan's cards. Same visibility rule as the plan's reimbursements. */
export async function getEventPlanSpendingCards(
  eventPlanId: string
): Promise<SpendingCardView[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];
  const policy = await getReimbursementPolicy(schoolId);
  if (!policy.spendingCardsEnabled) return [];

  const access = await assertEventPlanAccess(user.id!, eventPlanId);
  const seesAll =
    access.role === "lead" ||
    access.isBoardMember ||
    (await isReimbursementViewer(user.id!, schoolId));

  const rows = await cardQuery()
    .where(
      and(
        eq(spendingCardRequests.schoolId, schoolId),
        eq(spendingCardRequests.eventPlanId, eventPlanId),
        ...(seesAll ? [] : [eq(spendingCardRequests.requestedBy, user.id!)])
      )
    )
    .orderBy(desc(spendingCardRequests.createdAt));

  return toCardViews(rows);
}

export async function getSpendingCard(
  id: string
): Promise<SpendingCardDetail | null> {
  const loaded = await loadCard(id).catch(() => null);
  if (!loaded) return null;
  const { user, schoolId, card, isRequester } = loaded;

  const rows = await cardQuery().where(eq(spendingCardRequests.id, id));
  const [view] = await toCardViews(rows);
  if (!view) return null;

  const receipts = await db
    .select()
    .from(reimbursementReceipts)
    .where(eq(reimbursementReceipts.spendingCardRequestId, id))
    .orderBy(asc(reimbursementReceipts.createdAt));

  const isTreasurer = await assertTreasurer(user.id!, schoolId)
    .then(() => true)
    .catch(() => false);

  const substantiated = receipts.length > 0 ? parseMoney(card.spentAmount) : 0;
  const unaccounted = card.issuedAmount
    ? (parseMoney(card.issuedAmount) - substantiated).toFixed(2)
    : null;

  return {
    ...view,
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      blobUrl: receipt.blobUrl,
      fileName: receipt.fileName,
      contentType: receipt.contentType,
      paymentMethodHint: receipt.paymentMethodHint,
    })),
    viewer: {
      isRequester,
      isTreasurer,
      canAddReceipts: isRequester && card.status === "issued",
    },
    unaccounted,
  };
}
