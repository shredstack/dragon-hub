"use server";

import {
  assertAuthenticated,
  assertEventPlanAccess,
  assertPtaBoardMember,
  assertReimbursementOfficer,
  assertReimbursementViewer,
  assertTreasurer,
  getCurrentSchoolId,
  heldBoardPosition,
  invitedEventPlansFilter,
  isPtaBoardMember,
  isReimbursementOfficer,
  isReimbursementViewer,
  isSchoolLeadership,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  budgetCategories,
  eventPlans,
  reimbursementActivity,
  reimbursementApprovals,
  reimbursementExpenses,
  reimbursementItems,
  reimbursementReceipts,
  reimbursementRequests,
  schoolMemberships,
  users,
} from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notify } from "@/lib/notify";
import { getSchoolCurrentYear } from "@/lib/school-year";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { getReimbursementPolicy } from "@/lib/reimbursement-policy";
import { getBoardPositionLabels } from "@/lib/board-positions";
import { positionLabel } from "@/lib/board-positions-shared";
import { compareDateOnly, todayDateOnly, toDateOnly } from "@/lib/date-only";
import {
  daysBetweenDateOnly,
  moneyEquals,
  parseMoney,
  summarizeVendors,
  toMoneyString,
  type ReimbursementFlags,
  type ReimbursementPolicy,
  type ReimbursementStatus,
} from "@/lib/reimbursements-shared";
import { AiStructuredError } from "@/lib/ai/structured";
import {
  extractReceipt,
  type ExtractedReceipt,
} from "@/lib/ai/receipt-extraction";

/**
 * Digital check requests.
 *
 * Every action here opens the same way — authenticate, re-derive the school from
 * `getCurrentSchoolId()`, load the request and refuse it if it belongs to a
 * different school — because the request id is the only thing the client sends
 * and it is guessable in principle. The cookie is a preference, never an
 * authorization; see the comment above `getCurrentSchoolId`.
 *
 * The status machine is enforced here rather than in the UI, because a
 * reimbursement's audit trail is the product: `draft → submitted →
 * (changes_requested → submitted)* → approved → paid`, with `rejected`
 * reachable from `submitted` and `changes_requested`. Every transition writes a
 * `reimbursement_activity` row.
 */

// ─── Shapes ─────────────────────────────────────────────────────────────────

export interface ReimbursementItemInput {
  description: string;
  quantity: number;
  amount: string;
}

/**
 * One receipt on the request being edited.
 *
 * `id` names an existing receipt row; an entry without one is a receipt the
 * form has just added. Ids that don't belong to this request are treated as
 * new rather than trusted — see `replaceExpenses`.
 */
export interface ReimbursementExpenseInput {
  id?: string | null;
  vendor?: string;
  /** `YYYY-MM-DD`. */
  purchaseDate?: string;
  subtotalAmount?: string;
  salesTaxAmount?: string;
  totalAmount?: string;
  items?: ReimbursementItemInput[];
}

export interface ReimbursementDraftInput {
  eventPlanId?: string | null;
  /** The stated reason, for a board member's general (non-event) request. */
  eventLabel?: string | null;
  payeeName?: string;
  purpose?: string;
  budgetCategoryId?: string | null;
  missingReceipt?: boolean;
  attestedPersonalFunds?: boolean;
  /**
   * The request's receipts, in the order they are shown. Omitted means "leave
   * them alone"; an empty array means "this request now has none".
   *
   * The vendor, date and money that used to sit on the request are per receipt
   * now, and the request's own copies are rewritten from these by
   * `recalcRequestFromExpenses`.
   */
  expenses?: ReimbursementExpenseInput[];
}

export interface ReimbursementApprovalView {
  role: string;
  roleLabel: string;
  approvedBy: string;
  approverName: string;
  createdAt: string;
}

export interface ReimbursementListItem {
  id: string;
  status: ReimbursementStatus;
  payeeName: string;
  /** Rolled up from the receipts — see `summarizeVendors`. */
  vendor: string;
  purpose: string;
  /** The earliest purchase on the request: the one the 60-day clock runs from. */
  purchaseDate: string;
  subtotalAmount: string;
  salesTaxAmount: string;
  totalAmount: string;
  eventPlanId: string | null;
  eventLabel: string | null;
  eventPlanTitle: string | null;
  budgetCategoryId: string | null;
  budgetCategoryName: string | null;
  submittedBy: string;
  submitterName: string;
  submittedAt: string | null;
  checkNumber: string | null;
  paidAt: string | null;
  missingReceipt: boolean;
  /** Uploaded images and PDFs — several per receipt for a long till roll. */
  receiptCount: number;
  /** How many receipts this one check covers. */
  expenseCount: number;
  /** The snapshot taken at submission, or the live policy for a draft. */
  requiredApproverRoles: string[];
  approvals: ReimbursementApprovalView[];
  flags: ReimbursementFlags;
}

export interface ReimbursementItemView {
  id: string;
  description: string;
  quantity: number;
  amount: string;
  sortOrder: number;
}

export interface ReimbursementReceiptView {
  id: string;
  /** The receipt this image belongs to, null only for a card's receipts. */
  expenseId: string | null;
  blobUrl: string;
  fileName: string;
  contentType: string;
  /** What the receipt says it was paid with, when extraction read one. */
  paymentMethodHint: string | null;
  createdAt: string | null;
}

/** One receipt: what it says, what was on it, and the pictures of it. */
export interface ReimbursementExpenseView {
  id: string;
  vendor: string;
  purchaseDate: string;
  subtotalAmount: string;
  salesTaxAmount: string;
  totalAmount: string;
  sortOrder: number;
  items: ReimbursementItemView[];
  receipts: ReimbursementReceiptView[];
}

export interface ReimbursementDetail extends ReimbursementListItem {
  schoolYear: string;
  attestedPersonalFunds: boolean;
  boardDecisionNote: string | null;
  authorizationNote: string | null;
  authorizationMinutesDate: string | null;
  principalAcknowledged: boolean;
  rejectionReason: string | null;
  paidByName: string | null;
  /**
   * The receipts this check covers, in display order. The request's own
   * totals are these summed; the money is read here and rolled up there.
   */
  expenses: ReimbursementExpenseView[];
  /** Every image on the request, flattened — the same rows as above. */
  receipts: ReimbursementReceiptView[];
  activity: {
    id: string;
    action: string;
    note: string | null;
    actorName: string | null;
    createdAt: string | null;
  }[];
  /** What the viewer may do, resolved server-side so the UI never guesses. */
  viewer: {
    isOwner: boolean;
    isOfficer: boolean;
    /** On the board, so may read this — with or without an officer's buttons. */
    isViewer: boolean;
    isTreasurer: boolean;
    /** The required role this viewer could sign as, if any. */
    approvableAs: string | null;
    approvableAsLabel: string | null;
    /** Why the approve button is off, when it is. */
    approvalBlockedReason: string | null;
  };
  /** Remaining allocation on the budget line, when one is set. */
  budget: {
    allocatedAmount: string;
    committedAmount: string;
    remainingAmount: string;
  } | null;
}

// ─── Loading and guards ─────────────────────────────────────────────────────

/**
 * The request, plus who the caller is to it.
 *
 * A request from another school is reported as not found rather than
 * unauthorized: confirming it exists is itself a leak, and a school id in a
 * cookie is not proof of anything.
 */
async function loadRequest(requestId: string) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");

  const request = await db.query.reimbursementRequests.findFirst({
    where: eq(reimbursementRequests.id, requestId),
  });
  if (!request || request.schoolId !== schoolId) {
    throw new Error("Reimbursement request not found");
  }

  const isOwner = request.submittedBy === user.id;
  // `isViewer` is the read gate and covers every officer; `isOfficer` decides
  // only what the action bar offers.
  const [isOfficer, isViewer] = await Promise.all([
    isReimbursementOfficer(user.id!, schoolId),
    isReimbursementViewer(user.id!, schoolId),
  ]);
  if (!isOwner && !isViewer) {
    throw new Error("Unauthorized: Not your reimbursement request");
  }

  return { user, schoolId, request, isOwner, isOfficer, isViewer };
}

/** As `loadRequest`, but the caller must be a policy officer. */
async function loadRequestAsOfficer(requestId: string) {
  const loaded = await loadRequest(requestId);
  await assertReimbursementOfficer(loaded.user.id!, loaded.schoolId);
  return loaded;
}

/** As `loadRequest`, but the caller must be the submitter, still editing. */
async function loadEditableRequest(requestId: string) {
  const loaded = await loadRequest(requestId);
  if (!loaded.isOwner) {
    throw new Error("Only the person who submitted a request can edit it");
  }
  if (
    loaded.request.status !== "draft" &&
    loaded.request.status !== "changes_requested"
  ) {
    throw new Error(
      "This request has been submitted and can no longer be edited. Ask an officer to send it back if something is wrong."
    );
  }
  return loaded;
}

/**
 * Verify the caller may file against this event plan, and that the plan belongs
 * to the school they are acting in. `assertEventPlanAccess` does both.
 */
async function assertEventPlanForRequest(
  userId: string,
  eventPlanId: string
): Promise<void> {
  await assertEventPlanAccess(userId, eventPlanId);
}

async function writeActivity(params: {
  requestId: string;
  actorId: string | null;
  action: string;
  note?: string | null;
}) {
  await db.insert(reimbursementActivity).values({
    requestId: params.requestId,
    actorId: params.actorId,
    action: params.action,
    note: params.note?.trim() || null,
  });
}

function revalidateRequest(requestId: string, eventPlanId?: string | null) {
  revalidatePath("/reimbursements");
  revalidatePath(`/reimbursements/${requestId}`);
  if (eventPlanId) revalidatePath(`/events/${eventPlanId}`);
}

// ─── Recipients ─────────────────────────────────────────────────────────────

/**
 * Everyone currently holding one of these board positions at the school.
 *
 * Year-scoped, because a `school_memberships` row is per year and an approved
 * 2019 row still says "treasurer" — notifying the treasurer of six years ago
 * about today's receipts is exactly the kind of thing that gets push switched
 * off. The fallback to the most recent year that *does* have holders covers the
 * fortnight after a rollover, when this year's board rows may not exist yet.
 */
async function officerRecipients(
  schoolId: string,
  roles: string[]
): Promise<string[]> {
  if (roles.length === 0) return [];

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
        inArray(schoolMemberships.boardPosition, roles)
      )
    );
  if (rows.length === 0) return [];

  const currentYear = await getSchoolCurrentYear(schoolId);
  const years = [...new Set(rows.map((r) => r.schoolYear))].sort();
  const year = years.includes(currentYear) ? currentYear : years[years.length - 1];

  return [
    ...new Set(rows.filter((r) => r.schoolYear === year).map((r) => r.userId)),
  ];
}

// ─── Flags ──────────────────────────────────────────────────────────────────

/**
 * What every flag in a batch needs, loaded once.
 *
 * The officer queue asks the same two questions of every row — "is this line
 * over its allocation?" and "does it therefore need a minutes reference?" — and
 * both are answered from school-wide totals. Loading them per row would be a
 * query per request.
 */
interface FlagContext {
  /** categoryId → allocation, for the school year. */
  allocations: Map<string, number>;
  /** categoryId → total already approved or paid against it. */
  committed: Map<string, number>;
  /**
   * Every receipt filed at the school this year, reduced to the fields a
   * duplicate check compares. A school files hundreds of these a year, not
   * hundreds of thousands, so one scan beats a correlated query per row.
   *
   * Receipt-level rather than request-level, because that is where the
   * question lives: the same $84.12 Costco run filed twice is a duplicate
   * whether or not the two requests it landed on look alike.
   */
  expenses: {
    id: string;
    requestId: string;
    status: ReimbursementStatus;
    vendor: string;
    subtotalAmount: string;
    salesTaxAmount: string;
    totalAmount: string;
    purchaseDate: string;
  }[];
  /** The same rows, grouped by the request they sit on. */
  expensesByRequest: Map<string, FlagContext["expenses"]>;
  /** Today in the school's zone — the reference day for an unsubmitted request. */
  today: string;
}

async function buildFlagContext(
  schoolId: string,
  schoolYear: string
): Promise<FlagContext> {
  const [categories, committed, expenses, timeZone] = await Promise.all([
    db
      .select({
        id: budgetCategories.id,
        allocatedAmount: budgetCategories.allocatedAmount,
      })
      .from(budgetCategories)
      .where(
        and(
          eq(budgetCategories.schoolId, schoolId),
          eq(budgetCategories.schoolYear, schoolYear)
        )
      ),
    db
      .select({
        categoryId: reimbursementRequests.budgetCategoryId,
        total: sql<string>`sum(${reimbursementRequests.totalAmount})`,
      })
      .from(reimbursementRequests)
      .where(
        and(
          eq(reimbursementRequests.schoolId, schoolId),
          eq(reimbursementRequests.schoolYear, schoolYear),
          inArray(reimbursementRequests.status, ["approved", "paid"])
        )
      )
      .groupBy(reimbursementRequests.budgetCategoryId),
    // Drafts are included: a draft's *own* receipts are what its flags are
    // computed from. `computeFlags` is what refuses to treat one as something
    // another request could be duplicating — nobody has claimed anything yet.
    db
      .select({
        id: reimbursementExpenses.id,
        requestId: reimbursementExpenses.requestId,
        status: reimbursementRequests.status,
        vendor: reimbursementExpenses.vendor,
        subtotalAmount: reimbursementExpenses.subtotalAmount,
        salesTaxAmount: reimbursementExpenses.salesTaxAmount,
        totalAmount: reimbursementExpenses.totalAmount,
        purchaseDate: reimbursementExpenses.purchaseDate,
      })
      .from(reimbursementExpenses)
      .innerJoin(
        reimbursementRequests,
        eq(reimbursementExpenses.requestId, reimbursementRequests.id)
      )
      .where(
        and(
          eq(reimbursementRequests.schoolId, schoolId),
          eq(reimbursementRequests.schoolYear, schoolYear)
        )
      ),
    getSchoolTimeZone(schoolId),
  ]);

  const rows = expenses.map((row) => ({
    id: row.id,
    requestId: row.requestId,
    status: row.status as ReimbursementStatus,
    vendor: row.vendor,
    subtotalAmount: row.subtotalAmount,
    salesTaxAmount: row.salesTaxAmount,
    totalAmount: row.totalAmount,
    purchaseDate: toDateOnly(row.purchaseDate),
  }));

  const expensesByRequest = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = expensesByRequest.get(row.requestId) ?? [];
    list.push(row);
    expensesByRequest.set(row.requestId, list);
  }

  return {
    allocations: new Map(
      categories
        .filter((c) => c.allocatedAmount !== null)
        .map((c) => [c.id, parseMoney(c.allocatedAmount)])
    ),
    committed: new Map(
      committed
        .filter((c): c is { categoryId: string; total: string } => !!c.categoryId)
        .map((c) => [c.categoryId, parseMoney(c.total)])
    ),
    expenses: rows,
    expensesByRequest,
    today: todayDateOnly(timeZone),
  };
}

/** How close two purchases must be, in days, to look like the same one. */
const DUPLICATE_WINDOW_DAYS = 7;

/**
 * Flags for one request. Derived, never stored — a flag that outlived the fact
 * behind it would be worse than no flag, and every one of these answers a
 * question about the *current* state of the school's budget and records.
 *
 * They inform; they do not decide. Nothing here blocks a submission, and only
 * `needsAuthorization` gates anything at all (approval), because that one is
 * not really a warning — it is the board's spending authority being absent.
 */
function computeFlags(
  request: typeof reimbursementRequests.$inferSelect,
  policy: ReimbursementPolicy,
  context: FlagContext
): ReimbursementFlags {
  const categoryId = request.budgetCategoryId;
  const allocation = categoryId ? context.allocations.get(categoryId) : undefined;

  let overBudget = false;
  if (categoryId && allocation !== undefined) {
    const committed = context.committed.get(categoryId) ?? 0;
    // A request already counted in `committed` must not be counted twice — for
    // an approved or paid request the question is whether the line is over, not
    // whether adding it again would put it over.
    const alreadyCounted =
      request.status === "approved" || request.status === "paid";
    const projected =
      committed + (alreadyCounted ? 0 : parseMoney(request.totalAmount));
    overBudget = projected > allocation;
  }

  const purchaseDate = toDateOnly(request.purchaseDate);

  // Age is measured to the day it was *submitted*, not to today: the IRS
  // window is about how promptly the expense was substantiated, and a request
  // that sat in the queue for a fortnight was not the submitter's delay.
  const reference = request.submittedAt
    ? toDateOnly(request.submittedAt)
    : context.today;

  // The receipts behind this request. The fallback covers a request whose
  // receipts haven't been read into the context (a caller flagging a row it
  // loaded on its own) by treating the rollup as the one receipt it describes.
  const own = context.expensesByRequest.get(request.id) ?? [
    {
      id: request.id,
      requestId: request.id,
      status: request.status as ReimbursementStatus,
      vendor: request.vendor,
      subtotalAmount: request.subtotalAmount,
      salesTaxAmount: request.salesTaxAmount,
      totalAmount: request.totalAmount,
      purchaseDate,
    },
  ];

  return {
    // Asked of each receipt rather than of the rollup, because the rollup is a
    // sum and two receipts wrong in opposite directions would add up to
    // something that looks right.
    totalsMismatch: own.some(
      (expense) =>
        parseMoney(expense.totalAmount) > 0 &&
        !moneyEquals(
          parseMoney(expense.subtotalAmount) + parseMoney(expense.salesTaxAmount),
          parseMoney(expense.totalAmount)
        )
    ),
    staleExpense:
      !!purchaseDate &&
      daysBetweenDateOnly(purchaseDate, reference) > policy.submissionWindowDays,
    possibleDuplicate: own.some((mine) => {
      const vendorKey = mine.vendor.trim().toLowerCase();
      const amount = parseMoney(mine.totalAmount);
      if (amount <= 0 || !vendorKey || !mine.purchaseDate) return false;
      const looksLikeMine = (other: FlagContext["expenses"][number]) =>
        other.vendor.trim().toLowerCase() === vendorKey &&
        moneyEquals(parseMoney(other.totalAmount), amount) &&
        Math.abs(daysBetweenDateOnly(other.purchaseDate, mine.purchaseDate!)) <=
          DUPLICATE_WINDOW_DAYS;
      // A sibling on this same request — the same slip added twice through
      // "Add another receipt". The draft rule below deliberately doesn't apply
      // here: these are the submitter's own rows, and a draft is precisely when
      // they can still take one back off.
      if (own.some((sibling) => sibling.id !== mine.id && looksLikeMine(sibling))) {
        return true;
      }
      return context.expenses.some(
        (other) =>
          // A draft is not a claim on anything yet, so it can't be the thing
          // another request duplicates.
          other.status !== "draft" &&
          other.requestId !== request.id &&
          looksLikeMine(other)
      );
    }),
    overBudget,
    missingReceipt: request.missingReceipt,
    needsAuthorization:
      (overBudget || policy.requiresMinutesApproval) && !request.authorizationNote,
  };
}

// ─── Draft lifecycle ────────────────────────────────────────────────────────

/**
 * Start a request.
 *
 * Created before it is filled in, because step one of the wizard is
 * photographing the receipt and a receipt row needs a request to hang off. The
 * NOT NULL money and text columns therefore open at zero and empty; nothing
 * checks them until `submitReimbursement`, which is where "is this a real
 * request?" is actually asked.
 *
 * `eventPlanId` is required for everyone except PTA board members, who may file
 * general operating expenses (insurance, office supplies) with a stated reason
 * instead.
 */
export async function createReimbursementDraft(
  data: ReimbursementDraftInput
): Promise<{ id: string }> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  const schoolYear = await getSchoolCurrentYear(schoolId);

  if (data.eventPlanId) {
    await assertEventPlanForRequest(user.id!, data.eventPlanId);
  } else {
    // The entry point for everyone else is inside an event plan; a request with
    // no plan is an operating expense, and those are the board's to file.
    await assertPtaBoardMember(user.id!, schoolId);
  }

  await assertBudgetCategoryBelongsToSchool(data.budgetCategoryId, schoolId);

  const timeZone = await getSchoolTimeZone(schoolId);

  const [created] = await db
    .insert(reimbursementRequests)
    .values({
      schoolId,
      schoolYear,
      submittedBy: user.id!,
      payeeName: data.payeeName?.trim() || user.name || user.email || "",
      eventPlanId: data.eventPlanId ?? null,
      eventLabel: data.eventLabel?.trim() || null,
      budgetCategoryId: data.budgetCategoryId ?? null,
      purpose: data.purpose?.trim() ?? "",
      // Rolled up from the receipts as soon as there are any; until then the
      // request describes nothing, which is what a fresh draft is.
      vendor: "",
      purchaseDate: todayDateOnly(timeZone),
      subtotalAmount: "0.00",
      salesTaxAmount: "0.00",
      totalAmount: "0.00",
      missingReceipt: data.missingReceipt ?? false,
      attestedPersonalFunds: data.attestedPersonalFunds ?? false,
      status: "draft",
    })
    .returning({ id: reimbursementRequests.id });

  if (data.expenses?.length) {
    await replaceExpenses(created.id, data.expenses, timeZone);
    await recalcRequestFromExpenses(created.id);
  }

  revalidateRequest(created.id, data.eventPlanId);
  return { id: created.id };
}

/**
 * Add another receipt to a request being edited.
 *
 * Called by the act of photographing, the same way the draft itself is: the
 * row has to exist before an image can name it as its owner. It opens empty —
 * no vendor, no money, dated today — and `submitReimbursement` is where "is
 * this a real receipt?" is asked.
 */
export async function createReimbursementExpense(
  requestId: string
): Promise<{ id: string }> {
  const { schoolId, request } = await loadEditableRequest(requestId);
  const timeZone = await getSchoolTimeZone(schoolId);

  const [existing] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reimbursementExpenses)
    .where(eq(reimbursementExpenses.requestId, requestId));

  const [created] = await db
    .insert(reimbursementExpenses)
    .values({
      requestId,
      purchaseDate: todayDateOnly(timeZone),
      sortOrder: existing?.count ?? 0,
    })
    .returning({ id: reimbursementExpenses.id });

  revalidateRequest(requestId, request.eventPlanId);
  return { id: created.id };
}

/**
 * Drop a receipt from a request being edited.
 *
 * Its line items and its images go with it (both cascade), because they only
 * ever described this receipt. The blobs are left in place for the same reason
 * `deleteReimbursementReceipt` leaves them: they are unreachable without their
 * URL, and an accidental removal should be survivable.
 */
export async function deleteReimbursementExpense(
  expenseId: string
): Promise<void> {
  const expense = await db.query.reimbursementExpenses.findFirst({
    where: eq(reimbursementExpenses.id, expenseId),
    columns: { id: true, requestId: true },
  });
  if (!expense) throw new Error("Receipt not found");

  const { user, request } = await loadEditableRequest(expense.requestId);

  await db
    .delete(reimbursementExpenses)
    .where(eq(reimbursementExpenses.id, expenseId));

  await recalcRequestFromExpenses(expense.requestId);

  if (request.status === "changes_requested") {
    await writeActivity({
      requestId: request.id,
      actorId: user.id!,
      action: "receipt_removed",
    });
  }

  revalidateRequest(request.id, request.eventPlanId);
}

/**
 * Edit a request. Only the submitter, only in `draft` / `changes_requested`.
 *
 * Returns the ids of the request's receipts in the order they were sent, so a
 * form that has just added one can adopt its id rather than send it again as
 * new on the next save.
 */
export async function updateReimbursementDraft(
  id: string,
  data: ReimbursementDraftInput
): Promise<{ expenseIds: string[] }> {
  const { user, schoolId, request } = await loadEditableRequest(id);

  // Moving a request to a different plan re-asks the access question, so a
  // request cannot be walked into a plan the submitter isn't on.
  if (data.eventPlanId && data.eventPlanId !== request.eventPlanId) {
    await assertEventPlanForRequest(user.id!, data.eventPlanId);
  }
  if (data.eventPlanId === null && request.eventPlanId) {
    await assertPtaBoardMember(user.id!, schoolId);
  }
  await assertBudgetCategoryBelongsToSchool(data.budgetCategoryId, schoolId);

  await db
    .update(reimbursementRequests)
    .set({
      ...(data.eventPlanId !== undefined ? { eventPlanId: data.eventPlanId } : {}),
      ...(data.eventLabel !== undefined
        ? { eventLabel: data.eventLabel?.trim() || null }
        : {}),
      ...(data.payeeName !== undefined ? { payeeName: data.payeeName.trim() } : {}),
      ...(data.purpose !== undefined ? { purpose: data.purpose.trim() } : {}),
      ...(data.budgetCategoryId !== undefined
        ? { budgetCategoryId: data.budgetCategoryId }
        : {}),
      ...(data.missingReceipt !== undefined
        ? { missingReceipt: data.missingReceipt }
        : {}),
      ...(data.attestedPersonalFunds !== undefined
        ? { attestedPersonalFunds: data.attestedPersonalFunds }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(reimbursementRequests.id, id));

  let expenseIds: string[] = [];
  if (data.expenses !== undefined) {
    const timeZone = await getSchoolTimeZone(schoolId);
    expenseIds = await replaceExpenses(id, data.expenses, timeZone);
    await recalcRequestFromExpenses(id);
  }

  // An edit to a draft nobody has seen is not history. An edit to a request an
  // officer sent back is — it is what they asked for, and the trail has to show
  // it happened between their note and the re-submission.
  if (request.status === "changes_requested") {
    await writeActivity({ requestId: id, actorId: user.id!, action: "edited" });
  }

  revalidateRequest(id, data.eventPlanId ?? request.eventPlanId);
  return { expenseIds };
}

/**
 * Discard a draft. `draft` only — once submitted, a request is a record, and
 * the way to end one is `rejected`, which says who ended it and why.
 */
export async function deleteReimbursementDraft(id: string): Promise<void> {
  const { request } = await loadEditableRequest(id);
  if (request.status !== "draft") {
    throw new Error(
      "Only an unsubmitted draft can be deleted. Ask an officer to reject this request instead."
    );
  }

  await db
    .delete(reimbursementRequests)
    .where(eq(reimbursementRequests.id, id));

  revalidateRequest(id, request.eventPlanId);
}

/**
 * Read an uploaded receipt and hand the values back to the form.
 *
 * Nothing is saved onto the request here — the return value pre-fills editable
 * inputs, and the submitter's Continue is what writes anything. The one thing
 * that *is* stored is `paymentMethodHint`, because it is an observation about
 * the image rather than a claim by the submitter, and officers need it beside
 * the image to perform the government-funds check the law requires of them.
 *
 * Returns `null` rather than throwing when extraction fails: the caller's
 * fallback is a blank form, which is exactly what the wizard did before this
 * existed. A failed read must never be the reason a receipt goes unfiled.
 */
export async function extractReceiptDetails(
  receiptId: string
): Promise<ExtractedReceipt | null> {
  const receipt = await db.query.reimbursementReceipts.findFirst({
    where: eq(reimbursementReceipts.id, receiptId),
    columns: {
      id: true,
      requestId: true,
      blobUrl: true,
      contentType: true,
    },
  });
  if (!receipt) throw new Error("Receipt not found");
  // Extraction pre-fills a check request's form; a spending card has no such
  // form, so a card receipt has nothing to be extracted into.
  if (!receipt.requestId) {
    throw new Error("That receipt belongs to a spending card request");
  }

  // The same gate as editing: only the submitter, only while the request is
  // still theirs to change. Extraction costs money and reads a private image.
  await loadEditableRequest(receipt.requestId);

  try {
    const extracted = await extractReceipt({
      url: receipt.blobUrl,
      contentType: receipt.contentType,
    });

    if (extracted.paymentMethodHint) {
      await db
        .update(reimbursementReceipts)
        .set({ paymentMethodHint: extracted.paymentMethodHint })
        .where(eq(reimbursementReceipts.id, receiptId));
    }

    return extracted;
  } catch (error) {
    if (error instanceof AiStructuredError) {
      console.error("Receipt extraction failed:", error);
      return null;
    }
    throw error;
  }
}

/**
 * Remove a receipt from a request still being edited.
 *
 * The blob itself is left in place: it is content-addressed, unreachable
 * without the URL, and deleting it would make an accidental removal
 * unrecoverable while the request is still in front of the person who took the
 * photo. The row going away is what removes it from the request.
 */
export async function deleteReimbursementReceipt(
  receiptId: string
): Promise<void> {
  const user = await assertAuthenticated();

  const receipt = await db.query.reimbursementReceipts.findFirst({
    where: eq(reimbursementReceipts.id, receiptId),
    columns: { id: true, requestId: true },
  });
  if (!receipt) throw new Error("Receipt not found");
  // A card's receipts are removed from the card, not from here.
  if (!receipt.requestId) {
    throw new Error("That receipt belongs to a spending card request");
  }

  const { request } = await loadEditableRequest(receipt.requestId);

  await db
    .delete(reimbursementReceipts)
    .where(eq(reimbursementReceipts.id, receiptId));

  if (request.status === "changes_requested") {
    await writeActivity({
      requestId: request.id,
      actorId: user.id!,
      action: "receipt_removed",
    });
  }

  revalidateRequest(request.id, request.eventPlanId);
}

/**
 * Write the request's receipts to match what the form sent, and return their
 * ids in that order.
 *
 * Rows are matched by id, and **an id that isn't already one of this request's
 * receipts is treated as a new receipt rather than trusted** — the id came from
 * the client, and adopting an arbitrary one would move another request's
 * receipt (and its images) onto this one. A receipt the form no longer lists is
 * deleted, taking its items and images with it.
 *
 * The single writer of `reimbursement_items.expense_id`, which is why that
 * column and `request_id` can never disagree.
 */
async function replaceExpenses(
  requestId: string,
  expenses: ReimbursementExpenseInput[],
  timeZone: string
): Promise<string[]> {
  const existing = await db
    .select({
      id: reimbursementExpenses.id,
      purchaseDate: reimbursementExpenses.purchaseDate,
    })
    .from(reimbursementExpenses)
    .where(eq(reimbursementExpenses.requestId, requestId));
  const known = new Map(existing.map((row) => [row.id, row]));

  const ids: string[] = [];
  const kept = new Set<string>();

  for (const [index, input] of expenses.entries()) {
    const match = input.id ? known.get(input.id) : undefined;
    const values = {
      vendor: input.vendor?.trim() ?? "",
      purchaseDate:
        toDateOnly(input.purchaseDate) ||
        match?.purchaseDate ||
        todayDateOnly(timeZone),
      subtotalAmount: toMoneyString(input.subtotalAmount),
      salesTaxAmount: toMoneyString(input.salesTaxAmount),
      totalAmount: toMoneyString(input.totalAmount),
      sortOrder: index,
    };

    let id: string;
    if (match) {
      await db
        .update(reimbursementExpenses)
        .set(values)
        .where(eq(reimbursementExpenses.id, match.id));
      id = match.id;
    } else {
      const [created] = await db
        .insert(reimbursementExpenses)
        .values({ requestId, ...values })
        .returning({ id: reimbursementExpenses.id });
      id = created.id;
    }

    kept.add(id);
    ids.push(id);
    await replaceItems(requestId, id, input.items ?? []);
  }

  /**
   * Leftovers are cleaned up, but **only the ones carrying no images**.
   *
   * A photograph creates its receipt row before the form has heard back, so a
   * save that overlaps an upload can send a list that doesn't mention it yet.
   * Deleting on that basis would cascade away the picture the person just took.
   * Removing a receipt on purpose goes through `deleteReimbursementExpense`,
   * which is explicit about it — so nothing here needs to delete a row that has
   * anything in it, and an empty leftover is a blank card, not a receipt.
   */
  const leftovers = existing
    .filter((row) => !kept.has(row.id))
    .map((row) => row.id);
  if (leftovers.length > 0) {
    const withImages = await db
      .selectDistinct({ expenseId: reimbursementReceipts.expenseId })
      .from(reimbursementReceipts)
      .where(inArray(reimbursementReceipts.expenseId, leftovers));
    const keepAnyway = new Set(withImages.map((row) => row.expenseId));
    const removable = leftovers.filter((id) => !keepAnyway.has(id));
    if (removable.length > 0) {
      await db
        .delete(reimbursementExpenses)
        .where(inArray(reimbursementExpenses.id, removable));
    }
  }

  return ids;
}

async function replaceItems(
  requestId: string,
  expenseId: string,
  items: ReimbursementItemInput[]
): Promise<void> {
  await db
    .delete(reimbursementItems)
    .where(eq(reimbursementItems.expenseId, expenseId));

  const rows = items
    .filter((item) => item.description.trim())
    .map((item, index) => ({
      requestId,
      expenseId,
      description: item.description.trim(),
      quantity: Number.isFinite(item.quantity) ? Math.max(1, item.quantity) : 1,
      amount: toMoneyString(item.amount),
      sortOrder: index,
    }));

  if (rows.length > 0) await db.insert(reimbursementItems).values(rows);
}

/**
 * Rewrite the request's own vendor, date and money from its receipts.
 *
 * The request is the check, so its total is the sum of the paper behind it —
 * stored rather than derived because every list, report, export and budget
 * total in the app reads it, and because the number the check is written from
 * should not depend on a join going right.
 *
 * The date is the **earliest** purchase: it is what the IRS 60-day clock runs
 * from, and the oldest receipt in the envelope is the one at risk. The vendor
 * is `summarizeVendors`, which is a label rather than data — the data is one
 * row down.
 */
async function recalcRequestFromExpenses(requestId: string): Promise<void> {
  const rows = await db
    .select({
      vendor: reimbursementExpenses.vendor,
      purchaseDate: reimbursementExpenses.purchaseDate,
      subtotalAmount: reimbursementExpenses.subtotalAmount,
      salesTaxAmount: reimbursementExpenses.salesTaxAmount,
      totalAmount: reimbursementExpenses.totalAmount,
    })
    .from(reimbursementExpenses)
    .where(eq(reimbursementExpenses.requestId, requestId))
    .orderBy(
      asc(reimbursementExpenses.sortOrder),
      asc(reimbursementExpenses.createdAt)
    );

  // No receipts left: the request describes nothing, and must not keep the
  // totals of the receipts it used to have — submission is checked against
  // these numbers.
  if (rows.length === 0) {
    await db
      .update(reimbursementRequests)
      .set({
        vendor: "",
        subtotalAmount: "0.00",
        salesTaxAmount: "0.00",
        totalAmount: "0.00",
        updatedAt: new Date(),
      })
      .where(eq(reimbursementRequests.id, requestId));
    return;
  }

  const sum = (pick: (row: (typeof rows)[number]) => string) =>
    rows.reduce((total, row) => total + parseMoney(pick(row)), 0).toFixed(2);

  const earliest = rows
    .map((row) => toDateOnly(row.purchaseDate))
    .filter(Boolean)
    .sort(compareDateOnly)[0];

  await db
    .update(reimbursementRequests)
    .set({
      vendor: summarizeVendors(rows.map((row) => row.vendor)),
      ...(earliest ? { purchaseDate: earliest } : {}),
      subtotalAmount: sum((row) => row.subtotalAmount),
      salesTaxAmount: sum((row) => row.salesTaxAmount),
      totalAmount: sum((row) => row.totalAmount),
      updatedAt: new Date(),
    })
    .where(eq(reimbursementRequests.id, requestId));
}

/**
 * A budget category the caller named has to be one of this school's, for this
 * school year. It arrives as an id from a select, and an id from a select is
 * still a value the client chose.
 */
async function assertBudgetCategoryBelongsToSchool(
  categoryId: string | null | undefined,
  schoolId: string
): Promise<void> {
  if (!categoryId) return;
  const category = await db.query.budgetCategories.findFirst({
    where: eq(budgetCategories.id, categoryId),
    columns: { schoolId: true },
  });
  if (!category || category.schoolId !== schoolId) {
    throw new Error("That budget category is not one of this school's");
  }
}

// ─── Submission ─────────────────────────────────────────────────────────────

/**
 * Hand the request to the officers.
 *
 * The policy's approver roles are **snapshotted onto the request** here. A
 * school that changes its policy next term must not invalidate an approval
 * already given, nor silently re-open a request that had been fully signed
 * under the old rule.
 */
export async function submitReimbursement(id: string): Promise<void> {
  const { user, schoolId, request } = await loadEditableRequest(id);
  const policy = await getReimbursementPolicy(schoolId);

  // Every receipt on the request, with how many images it carries. The counts
  // are per receipt rather than per request because "one of the three has no
  // photo" is exactly the case a request-wide count would hide.
  //
  // Counted by a second query rather than a correlated subquery: a `sql`
  // template interpolating a column into a single-table select renders it
  // *unqualified*, so `where expense_id = id` bound both names to
  // `reimbursement_receipts` and every count came back zero — which read as
  // "none of your receipts have a photo" on a request where all of them did.
  const expenseRows = await db
    .select({
      id: reimbursementExpenses.id,
      vendor: reimbursementExpenses.vendor,
      totalAmount: reimbursementExpenses.totalAmount,
      sortOrder: reimbursementExpenses.sortOrder,
    })
    .from(reimbursementExpenses)
    .where(eq(reimbursementExpenses.requestId, id))
    .orderBy(asc(reimbursementExpenses.sortOrder));

  const imageCounts = expenseRows.length
    ? await db
        .select({
          expenseId: reimbursementReceipts.expenseId,
          count: sql<number>`count(*)::int`,
        })
        .from(reimbursementReceipts)
        .where(
          inArray(
            reimbursementReceipts.expenseId,
            expenseRows.map((row) => row.id)
          )
        )
        .groupBy(reimbursementReceipts.expenseId)
    : [];
  const imagesByExpense = new Map(
    imageCounts
      .filter((row): row is { expenseId: string; count: number } => !!row.expenseId)
      .map((row) => [row.expenseId, row.count])
  );

  const expenses = expenseRows.map((row) => ({
    ...row,
    receiptCount: imagesByExpense.get(row.id) ?? 0,
  }));

  const isBoard = await isPtaBoardMember(user.id!, schoolId);

  if (!request.purpose.trim()) {
    throw new Error("Say what this money was spent on before submitting.");
  }
  if (!request.payeeName.trim()) {
    throw new Error("Add the name the check should be made out to.");
  }
  if (expenses.length === 0) {
    throw new Error(
      "Add the receipt you're claiming for before submitting this request."
    );
  }
  // Named by position, because with several receipts on one request "add the
  // vendor" leaves the submitter hunting for which one.
  const label = (index: number) =>
    expenses.length === 1 ? "the receipt" : `receipt ${index + 1}`;

  for (const [index, expense] of expenses.entries()) {
    if (!expense.vendor.trim()) {
      throw new Error(
        `Add the vendor for ${label(index)} — where the purchase was made.`
      );
    }
    if (parseMoney(expense.totalAmount) <= 0) {
      throw new Error(`Add the total for ${label(index)} before submitting.`);
    }
    if (expense.receiptCount === 0 && !request.missingReceipt) {
      throw new Error(
        `Attach a photo of ${label(index)}, or say you don't have one so the board can decide how to handle it.`
      );
    }
  }
  if (parseMoney(request.totalAmount) <= 0) {
    throw new Error("Add the total from the receipt before submitting.");
  }
  if (!request.attestedPersonalFunds) {
    throw new Error(
      "Confirm you paid with personal funds — a PTA cannot reimburse a purchase made with government-assistance or other non-personal funds."
    );
  }
  if (!request.eventPlanId) {
    if (!isBoard) {
      throw new Error(
        "Pick the event plan this spending was for — reimbursable spending is expected to line up with an approved plan."
      );
    }
    if (!request.eventLabel?.trim()) {
      throw new Error("Say what this general (non-event) expense was for.");
    }
  }

  await db
    .update(reimbursementRequests)
    .set({
      status: "submitted",
      submittedAt: new Date(),
      requiredApproverRoles: policy.approverRoles,
      updatedAt: new Date(),
    })
    .where(eq(reimbursementRequests.id, id));

  await writeActivity({
    requestId: id,
    actorId: user.id!,
    action: "submitted",
  });

  after(async () => {
    await notify({
      type: "reimbursement_submitted",
      schoolId,
      recipients: await officerRecipients(schoolId, policy.approverRoles),
      actorId: user.id!,
      title: "Check request waiting for review",
      body:
        expenses.length > 1
          ? `${request.payeeName} — $${request.totalAmount} across ${expenses.length} receipts.`
          : `${request.payeeName} — $${request.totalAmount} at ${request.vendor}.`,
      url: `/reimbursements/${id}`,
      groupKey: `reimbursement:${id}`,
    });
  });

  revalidateRequest(id, request.eventPlanId);
}

// ─── Officer review ─────────────────────────────────────────────────────────

/** Send a request back to its submitter with a note saying what to fix. */
export async function requestReimbursementChanges(
  id: string,
  note: string
): Promise<void> {
  const { user, schoolId, request } = await loadRequestAsOfficer(id);
  const body = note.trim();
  if (!body) {
    throw new Error("Say what needs changing — the note is what they'll act on.");
  }
  if (request.status !== "submitted") {
    throw new Error("Only a submitted request can be sent back.");
  }

  await db
    .update(reimbursementRequests)
    .set({ status: "changes_requested", updatedAt: new Date() })
    .where(eq(reimbursementRequests.id, id));

  await writeActivity({
    requestId: id,
    actorId: user.id!,
    action: "changes_requested",
    note: body,
  });

  after(async () => {
    await notify({
      type: "reimbursement_update",
      schoolId,
      recipients: [request.submittedBy],
      actorId: user.id!,
      title: "Your check request needs a change",
      body,
      url: `/reimbursements/${id}`,
      groupKey: `reimbursement:${id}`,
    });
  });

  revalidateRequest(id, request.eventPlanId);
}

/**
 * Record the board/association authorization a request needs.
 *
 * Budget approval is not spending authority — the expenditure itself has to
 * have been authorized, and in a PTA that means a vote recorded in the minutes.
 * This is the reference to that record, and it is what unblocks approval of an
 * over-budget request (or of any request, where the state policy demands it).
 */
export async function recordAuthorization(
  id: string,
  note: string,
  minutesDate?: string
): Promise<void> {
  const { user, request } = await loadRequestAsOfficer(id);
  const body = note.trim();
  if (!body) {
    throw new Error("Add the authorization reference — which meeting approved this.");
  }
  if (request.status === "paid" || request.status === "rejected") {
    throw new Error("This request is closed.");
  }

  await db
    .update(reimbursementRequests)
    .set({
      authorizationNote: body,
      authorizationMinutesDate: toDateOnly(minutesDate) || null,
      updatedAt: new Date(),
    })
    .where(eq(reimbursementRequests.id, id));

  await writeActivity({
    requestId: id,
    actorId: user.id!,
    action: "authorization_recorded",
    note: minutesDate ? `${body} (minutes ${toDateOnly(minutesDate)})` : body,
  });

  revalidateRequest(id, request.eventPlanId);
}

/**
 * Sign the request as the role you hold.
 *
 * Two things are load-bearing here. **Self-approval is blocked** — the paper
 * form has two officer signatures precisely so that the person being paid is not
 * one of them, and if the submitter happens to be an officer, a co-officer or
 * the remaining officer signs instead. And an over-budget request (or any
 * request under a policy that demands minutes approval) cannot be signed until
 * `recordAuthorization` has been called: the board's authority to spend has to
 * exist before an officer attests to it.
 */
export async function approveReimbursement(id: string): Promise<void> {
  const { user, schoolId, request } = await loadRequestAsOfficer(id);
  const policy = await getReimbursementPolicy(schoolId);

  if (request.status !== "submitted") {
    throw new Error(
      request.status === "approved"
        ? "This request is already fully approved."
        : "Only a submitted request can be approved."
    );
  }
  if (request.submittedBy === user.id) {
    throw new Error(
      "You can't approve your own request. Another officer holding one of the required positions has to sign it."
    );
  }

  const required = request.requiredApproverRoles?.length
    ? request.requiredApproverRoles
    : policy.approverRoles;

  const role = await heldBoardPosition(user.id!, schoolId, required);
  if (!role) {
    const labels = await getBoardPositionLabels(schoolId);
    throw new Error(
      `This request needs approval from the ${required
        .map((slug) => positionLabel(labels, slug))
        .join(" and ")}.`
    );
  }

  const context = await buildFlagContext(schoolId, request.schoolYear);
  const flags = computeFlags(request, policy, context);
  if (flags.needsAuthorization) {
    throw new Error(
      flags.overBudget
        ? "This request is over its budget line. Record the board authorization (the minutes reference) before approving it."
        : "Record the association's authorization (the minutes reference) before approving this request."
    );
  }

  const inserted = await db
    .insert(reimbursementApprovals)
    .values({ requestId: id, role, approvedBy: user.id! })
    .onConflictDoNothing()
    .returning({ id: reimbursementApprovals.id });

  if (inserted.length === 0) {
    throw new Error("That position has already signed this request.");
  }

  await writeActivity({
    requestId: id,
    actorId: user.id!,
    action: `approved:${role}`,
  });

  const signed = await db
    .select({ role: reimbursementApprovals.role })
    .from(reimbursementApprovals)
    .where(eq(reimbursementApprovals.requestId, id));
  const signedRoles = new Set(signed.map((s) => s.role));
  const complete = required.every((slug) => signedRoles.has(slug));

  if (complete) {
    await db
      .update(reimbursementRequests)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(reimbursementRequests.id, id));
    await writeActivity({
      requestId: id,
      actorId: user.id!,
      action: "approved",
    });
  }

  after(async () => {
    const treasurers = await officerRecipients(schoolId, ["treasurer"]);
    await notify({
      type: "reimbursement_update",
      schoolId,
      recipients: complete
        ? [request.submittedBy, ...treasurers]
        : [request.submittedBy],
      actorId: user.id!,
      title: complete
        ? "Your check request is approved"
        : "Your check request was signed",
      body: complete
        ? `$${request.totalAmount} to ${request.payeeName} — waiting on the treasurer to write the check.`
        : `$${request.totalAmount} to ${request.payeeName} — one signature down.`,
      url: `/reimbursements/${id}`,
      groupKey: `reimbursement:${id}`,
    });
  });

  revalidateRequest(id, request.eventPlanId);
}

/** Terminal. A rejected request stays visible, with the reason on it. */
export async function rejectReimbursement(
  id: string,
  reason: string
): Promise<void> {
  const { user, schoolId, request } = await loadRequestAsOfficer(id);
  const body = reason.trim();
  if (!body) throw new Error("Give a reason — this is the last thing they'll read.");
  if (request.status !== "submitted" && request.status !== "changes_requested") {
    throw new Error("Only a request still under review can be rejected.");
  }

  await db
    .update(reimbursementRequests)
    .set({ status: "rejected", rejectionReason: body, updatedAt: new Date() })
    .where(eq(reimbursementRequests.id, id));

  await writeActivity({
    requestId: id,
    actorId: user.id!,
    action: "rejected",
    note: body,
  });

  after(async () => {
    await notify({
      type: "reimbursement_update",
      schoolId,
      recipients: [request.submittedBy],
      actorId: user.id!,
      title: "Your check request was not approved",
      body,
      url: `/reimbursements/${id}`,
      groupKey: `reimbursement:${id}`,
    });
  });

  revalidateRequest(id, request.eventPlanId);
}

/**
 * The check is written. The number is required because it is what orders the
 * physical disbursement file and keys the sales tax refund report — a paid
 * request without one is a hole in both.
 */
export async function markReimbursementPaid(
  id: string,
  checkNumber: string
): Promise<void> {
  const { user, schoolId, request } = await loadRequest(id);
  await assertTreasurer(user.id!, schoolId);

  const number = checkNumber.trim();
  if (!number) throw new Error("Record the check number.");
  if (request.status !== "approved") {
    throw new Error("Only an approved request can be marked paid.");
  }

  await db
    .update(reimbursementRequests)
    .set({
      status: "paid",
      checkNumber: number,
      paidAt: new Date(),
      paidBy: user.id!,
      updatedAt: new Date(),
    })
    .where(eq(reimbursementRequests.id, id));

  await writeActivity({
    requestId: id,
    actorId: user.id!,
    action: "paid",
    note: `Check ${number}`,
  });

  after(async () => {
    await notify({
      type: "reimbursement_update",
      schoolId,
      recipients: [request.submittedBy],
      actorId: user.id!,
      title: "Your reimbursement check is written",
      body: `Check ${number} for $${request.totalAmount}.`,
      url: `/reimbursements/${id}`,
      groupKey: `reimbursement:${id}`,
    });
  });

  revalidateRequest(id, request.eventPlanId);
}

/**
 * What the board decided about a request with no receipt.
 *
 * The lost-receipt path is explicit rather than silent: the tool never lets a
 * receipt-less request through unnoticed, it routes it to the board and records
 * the answer here, which is what an auditor asks to see.
 */
export async function recordBoardDecision(
  id: string,
  note: string
): Promise<void> {
  const { user, schoolId, request } = await loadRequest(id);
  await assertTreasurer(user.id!, schoolId);

  const body = note.trim();
  if (!body) throw new Error("Record what the board decided.");
  if (!request.missingReceipt) {
    throw new Error("This request has a receipt — there's nothing for the board to decide.");
  }

  await db
    .update(reimbursementRequests)
    .set({ boardDecisionNote: body, updatedAt: new Date() })
    .where(eq(reimbursementRequests.id, id));

  await writeActivity({
    requestId: id,
    actorId: user.id!,
    action: "board_decision",
    note: body,
  });

  revalidateRequest(id, request.eventPlanId);
}

/**
 * Assign or correct the budget line at review time.
 *
 * Submitters pick a category from a list they may not know well, and the
 * treasurer is the one who knows which line this actually comes off. Closed
 * requests are left alone: re-filing a paid check would silently move money in
 * the register the physical file is checked against.
 */
export async function setReimbursementBudgetCategory(
  id: string,
  budgetCategoryId: string | null
): Promise<void> {
  const { user, schoolId, request } = await loadRequestAsOfficer(id);
  if (request.status === "paid" || request.status === "rejected") {
    throw new Error("This request is closed.");
  }
  await assertBudgetCategoryBelongsToSchool(budgetCategoryId, schoolId);

  await db
    .update(reimbursementRequests)
    .set({ budgetCategoryId, updatedAt: new Date() })
    .where(eq(reimbursementRequests.id, id));

  const category = budgetCategoryId
    ? await db.query.budgetCategories.findFirst({
        where: eq(budgetCategories.id, budgetCategoryId),
        columns: { name: true },
      })
    : null;

  await writeActivity({
    requestId: id,
    actorId: user.id!,
    action: "budget_category_set",
    note: category?.name ?? "Cleared",
  });

  revalidateRequest(id, request.eventPlanId);
}

/**
 * The principal's acknowledgment happens on paper — this only records that it
 * did, so the binder and the app agree.
 */
export async function setPrincipalAcknowledged(
  id: string,
  acknowledged: boolean
): Promise<void> {
  const { user, request } = await loadRequestAsOfficer(id);

  await db
    .update(reimbursementRequests)
    .set({ principalAcknowledged: acknowledged, updatedAt: new Date() })
    .where(eq(reimbursementRequests.id, id));

  await writeActivity({
    requestId: id,
    actorId: user.id!,
    action: acknowledged
      ? "principal_acknowledged"
      : "principal_acknowledgment_cleared",
  });

  revalidateRequest(id, request.eventPlanId);
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/** The columns every list view needs, joined to the names it renders. */
function listSelection() {
  return {
    request: reimbursementRequests,
    eventPlanTitle: eventPlans.title,
    budgetCategoryName: budgetCategories.name,
    submitterName: users.name,
    submitterEmail: users.email,
  };
}

function listQuery() {
  return db
    .select(listSelection())
    .from(reimbursementRequests)
    .leftJoin(eventPlans, eq(reimbursementRequests.eventPlanId, eventPlans.id))
    .leftJoin(
      budgetCategories,
      eq(reimbursementRequests.budgetCategoryId, budgetCategories.id)
    )
    // Left, not inner: `submitted_by` is ON DELETE RESTRICT and survives
    // account deletion by being repointed at a placeholder, so the join always
    // matches — but a left join means a missing row costs a name, not a request.
    .leftJoin(users, eq(reimbursementRequests.submittedBy, users.id));
}

type ListRow = {
  request: typeof reimbursementRequests.$inferSelect;
  eventPlanTitle: string | null;
  budgetCategoryName: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
};

/**
 * Turn joined rows into list items, loading the per-request extras (receipt
 * counts, approvals) in two batched queries rather than two per row.
 */
async function toListItems(
  rows: ListRow[],
  schoolId: string,
  policy: ReimbursementPolicy,
  schoolYear: string
): Promise<ReimbursementListItem[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.request.id);

  const [receiptCounts, expenseCounts, approvals, labels, context] =
    await Promise.all([
    db
      .select({
        requestId: reimbursementReceipts.requestId,
        count: sql<number>`count(*)::int`,
      })
      .from(reimbursementReceipts)
      .where(inArray(reimbursementReceipts.requestId, ids))
      .groupBy(reimbursementReceipts.requestId),
    db
      .select({
        requestId: reimbursementExpenses.requestId,
        count: sql<number>`count(*)::int`,
      })
      .from(reimbursementExpenses)
      .where(inArray(reimbursementExpenses.requestId, ids))
      .groupBy(reimbursementExpenses.requestId),
    db
      .select({
        requestId: reimbursementApprovals.requestId,
        role: reimbursementApprovals.role,
        approvedBy: reimbursementApprovals.approvedBy,
        approverName: users.name,
        approverEmail: users.email,
        createdAt: reimbursementApprovals.createdAt,
      })
      .from(reimbursementApprovals)
      .leftJoin(users, eq(reimbursementApprovals.approvedBy, users.id))
      .where(inArray(reimbursementApprovals.requestId, ids)),
    getBoardPositionLabels(schoolId),
    buildFlagContext(schoolId, schoolYear),
    ]);

  // `request_id` is nullable since spending cards started sharing this table.
  // The `inArray` above already excludes card receipts, so this narrows rather
  // than filters.
  const countByRequest = new Map(
    receiptCounts
      .filter((r): r is { requestId: string; count: number } => !!r.requestId)
      .map((r) => [r.requestId, r.count])
  );
  const expenseCountByRequest = new Map(
    expenseCounts.map((r) => [r.requestId, r.count])
  );
  const approvalsByRequest = new Map<string, ReimbursementApprovalView[]>();
  for (const approval of approvals) {
    const list = approvalsByRequest.get(approval.requestId) ?? [];
    list.push({
      role: approval.role,
      roleLabel: positionLabel(labels, approval.role) ?? approval.role,
      approvedBy: approval.approvedBy,
      approverName: approval.approverName || approval.approverEmail || "Unknown",
      createdAt: approval.createdAt?.toISOString() ?? "",
    });
    approvalsByRequest.set(approval.requestId, list);
  }

  return rows.map((row) => {
    const r = row.request;
    return {
      id: r.id,
      status: r.status as ReimbursementStatus,
      payeeName: r.payeeName,
      vendor: r.vendor,
      purpose: r.purpose,
      purchaseDate: toDateOnly(r.purchaseDate),
      subtotalAmount: r.subtotalAmount,
      salesTaxAmount: r.salesTaxAmount,
      totalAmount: r.totalAmount,
      eventPlanId: r.eventPlanId,
      eventLabel: r.eventLabel,
      eventPlanTitle: row.eventPlanTitle,
      budgetCategoryId: r.budgetCategoryId,
      budgetCategoryName: row.budgetCategoryName,
      submittedBy: r.submittedBy,
      submitterName: row.submitterName || row.submitterEmail || "Unknown",
      submittedAt: r.submittedAt?.toISOString() ?? null,
      checkNumber: r.checkNumber,
      paidAt: r.paidAt?.toISOString() ?? null,
      missingReceipt: r.missingReceipt,
      receiptCount: countByRequest.get(r.id) ?? 0,
      expenseCount: expenseCountByRequest.get(r.id) ?? 0,
      requiredApproverRoles: r.requiredApproverRoles ?? policy.approverRoles,
      approvals: approvalsByRequest.get(r.id) ?? [],
      flags: computeFlags(r, policy, context),
    };
  });
}

/** Every request this user has filed at their current school. */
export async function getMyReimbursements(): Promise<ReimbursementListItem[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];
  const [policy, schoolYear] = await Promise.all([
    getReimbursementPolicy(schoolId),
    getSchoolCurrentYear(schoolId),
  ]);

  const rows = await listQuery()
    .where(
      and(
        eq(reimbursementRequests.schoolId, schoolId),
        eq(reimbursementRequests.submittedBy, user.id!)
      )
    )
    .orderBy(desc(reimbursementRequests.createdAt));

  return toListItems(rows, schoolId, policy, schoolYear);
}

/**
 * A plan's expenses.
 *
 * Plain members see their own — a room parent's receipt is their business, and
 * a plan roster is not an audience for it. Plan leads and policy officers see
 * every request against the plan, because "what has this event actually cost?"
 * is their question to answer.
 *
 * Nobody, however, sees somebody else's **draft**. A draft exists from the
 * moment the wizard takes the first receipt photo, and until it is submitted
 * nobody has asked for anything — same rule the officers' queue enforces.
 */
export async function getEventPlanReimbursements(
  eventPlanId: string
): Promise<ReimbursementListItem[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];

  // Verifies the plan belongs to this school and that the caller is on it.
  const access = await assertEventPlanAccess(user.id!, eventPlanId);
  const isOfficer = await isReimbursementOfficer(user.id!, schoolId);
  const seesAll = isOfficer || access.role === "lead" || access.isBoardMember;

  const [policy, schoolYear] = await Promise.all([
    getReimbursementPolicy(schoolId),
    getSchoolCurrentYear(schoolId),
  ]);

  const rows = await listQuery()
    .where(
      and(
        eq(reimbursementRequests.schoolId, schoolId),
        eq(reimbursementRequests.eventPlanId, eventPlanId),
        ...(seesAll
          ? [
              or(
                ne(reimbursementRequests.status, "draft"),
                eq(reimbursementRequests.submittedBy, user.id!)
              )!,
            ]
          : [eq(reimbursementRequests.submittedBy, user.id!)])
      )
    )
    .orderBy(desc(reimbursementRequests.createdAt));

  return toListItems(rows, schoolId, policy, schoolYear);
}

export type ReimbursementQueueFilter =
  | "open"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "paid"
  | "rejected"
  | "all";

/**
 * The review queue. Drafts never appear — nobody has asked yet.
 *
 * Open to the whole board to read; only the policy's officers can act on
 * anything in it.
 */
export async function getReimbursementQueue(
  filter: ReimbursementQueueFilter = "open"
): Promise<ReimbursementListItem[]> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];
  await assertReimbursementViewer(user.id!, schoolId);

  const [policy, schoolYear] = await Promise.all([
    getReimbursementPolicy(schoolId),
    getSchoolCurrentYear(schoolId),
  ]);

  const statuses: ReimbursementStatus[] =
    filter === "open"
      ? ["submitted", "changes_requested"]
      : filter === "all"
        ? ["submitted", "changes_requested", "approved", "rejected", "paid"]
        : [filter];

  const rows = await listQuery()
    .where(
      and(
        eq(reimbursementRequests.schoolId, schoolId),
        inArray(reimbursementRequests.status, statuses)
      )
    )
    .orderBy(
      desc(reimbursementRequests.submittedAt),
      desc(reimbursementRequests.createdAt)
    );

  return toListItems(rows, schoolId, policy, schoolYear);
}

/** How many requests are sitting in the review queue right now. */
export async function getReimbursementQueueCount(): Promise<number> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return 0;
  if (!(await isReimbursementViewer(user.id!, schoolId))) return 0;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reimbursementRequests)
    .where(
      and(
        eq(reimbursementRequests.schoolId, schoolId),
        eq(reimbursementRequests.status, "submitted")
      )
    );
  return row?.count ?? 0;
}

/** One request in full, for the detail page and the officer review panel. */
export async function getReimbursement(
  id: string
): Promise<ReimbursementDetail | null> {
  const loaded = await loadRequest(id).catch(() => null);
  if (!loaded) return null;
  const { user, schoolId, request, isOwner, isOfficer, isViewer } = loaded;

  const [policy, schoolYear] = await Promise.all([
    getReimbursementPolicy(schoolId),
    getSchoolCurrentYear(schoolId),
  ]);

  const rows = await listQuery().where(eq(reimbursementRequests.id, id));
  const [summary] = await toListItems(rows, schoolId, policy, schoolYear);
  if (!summary) return null;

  const [expenses, items, receipts, activity, labels, payer] = await Promise.all([
    db
      .select()
      .from(reimbursementExpenses)
      .where(eq(reimbursementExpenses.requestId, id))
      .orderBy(
        asc(reimbursementExpenses.sortOrder),
        asc(reimbursementExpenses.createdAt)
      ),
    db
      .select()
      .from(reimbursementItems)
      .where(eq(reimbursementItems.requestId, id))
      .orderBy(asc(reimbursementItems.sortOrder)),
    db
      .select()
      .from(reimbursementReceipts)
      .where(eq(reimbursementReceipts.requestId, id))
      .orderBy(asc(reimbursementReceipts.createdAt)),
    db
      .select({
        id: reimbursementActivity.id,
        action: reimbursementActivity.action,
        note: reimbursementActivity.note,
        createdAt: reimbursementActivity.createdAt,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(reimbursementActivity)
      .leftJoin(users, eq(reimbursementActivity.actorId, users.id))
      .where(eq(reimbursementActivity.requestId, id))
      .orderBy(asc(reimbursementActivity.createdAt)),
    getBoardPositionLabels(schoolId),
    request.paidBy
      ? db.query.users.findFirst({
          where: eq(users.id, request.paidBy),
          columns: { name: true, email: true },
        })
      : Promise.resolve(null),
  ]);

  const isTreasurer =
    isOfficer &&
    !!(await heldBoardPosition(user.id!, schoolId, ["treasurer"]));

  const approvableAs = isOfficer
    ? await heldBoardPosition(user.id!, schoolId, summary.requiredApproverRoles)
    : null;

  const alreadySigned = summary.approvals.some((a) => a.role === approvableAs);
  const approvalBlockedReason = !isOfficer
    ? null
    : request.submittedBy === user.id
      ? "You can't approve your own request — another officer has to sign it."
      : !approvableAs
        ? `Only the ${summary.requiredApproverRoles
            .map((slug) => positionLabel(labels, slug))
            .join(" and ")} can approve this request.`
        : alreadySigned
          ? "You've already signed this request."
          : request.status !== "submitted"
            ? null
            : summary.flags.needsAuthorization
              ? "Record the board authorization (the minutes reference) first."
              : null;

  const budget = await loadBudgetLine(request.budgetCategoryId, schoolId, schoolYear);

  return {
    ...summary,
    schoolYear: request.schoolYear,
    attestedPersonalFunds: request.attestedPersonalFunds,
    boardDecisionNote: request.boardDecisionNote,
    authorizationNote: request.authorizationNote,
    authorizationMinutesDate: toDateOnly(request.authorizationMinutesDate) || null,
    principalAcknowledged: request.principalAcknowledged,
    rejectionReason: request.rejectionReason,
    paidByName: payer?.name || payer?.email || null,
    expenses: expenses.map((expense) => ({
      id: expense.id,
      vendor: expense.vendor,
      purchaseDate: toDateOnly(expense.purchaseDate),
      subtotalAmount: expense.subtotalAmount,
      salesTaxAmount: expense.salesTaxAmount,
      totalAmount: expense.totalAmount,
      sortOrder: expense.sortOrder,
      items: items
        .filter((item) => item.expenseId === expense.id)
        .map(toItemView),
      receipts: receipts
        .filter((receipt) => receipt.expenseId === expense.id)
        .map(toReceiptView),
    })),
    receipts: receipts.map(toReceiptView),
    activity: activity.map((row) => ({
      id: row.id,
      action: row.action,
      note: row.note,
      actorName: row.actorName || row.actorEmail || null,
      createdAt: row.createdAt?.toISOString() ?? null,
    })),
    viewer: {
      isOwner,
      isOfficer,
      isViewer,
      isTreasurer,
      approvableAs,
      approvableAsLabel: approvableAs
        ? (positionLabel(labels, approvableAs) ?? approvableAs)
        : null,
      approvalBlockedReason,
    },
    budget,
  };
}

function toItemView(
  item: typeof reimbursementItems.$inferSelect
): ReimbursementItemView {
  return {
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    amount: item.amount,
    sortOrder: item.sortOrder,
  };
}

function toReceiptView(
  receipt: typeof reimbursementReceipts.$inferSelect
): ReimbursementReceiptView {
  return {
    id: receipt.id,
    expenseId: receipt.expenseId,
    blobUrl: receipt.blobUrl,
    fileName: receipt.fileName,
    contentType: receipt.contentType,
    paymentMethodHint: receipt.paymentMethodHint,
    createdAt: receipt.createdAt?.toISOString() ?? null,
  };
}

/**
 * How much of a budget line is already spoken for by reimbursements.
 *
 * Deliberately not the same number as the Budget page's: that one comes from
 * the Sheets sync and is the book of record. This is "what have I already
 * approved against this line in DragonHub", which is the question an officer
 * about to approve one more is actually asking.
 */
async function loadBudgetLine(
  categoryId: string | null,
  schoolId: string,
  schoolYear: string
): Promise<ReimbursementDetail["budget"]> {
  if (!categoryId) return null;

  const category = await db.query.budgetCategories.findFirst({
    where: eq(budgetCategories.id, categoryId),
    columns: { allocatedAmount: true, schoolId: true },
  });
  if (!category || category.schoolId !== schoolId || !category.allocatedAmount) {
    return null;
  }

  const [committed] = await db
    .select({ total: sql<string>`coalesce(sum(${reimbursementRequests.totalAmount}), 0)` })
    .from(reimbursementRequests)
    .where(
      and(
        eq(reimbursementRequests.schoolId, schoolId),
        eq(reimbursementRequests.schoolYear, schoolYear),
        eq(reimbursementRequests.budgetCategoryId, categoryId),
        inArray(reimbursementRequests.status, ["approved", "paid"])
      )
    );

  const allocated = parseMoney(category.allocatedAmount);
  const used = parseMoney(committed?.total);
  return {
    allocatedAmount: allocated.toFixed(2),
    committedAmount: used.toFixed(2),
    remainingAmount: (allocated - used).toFixed(2),
  };
}

/**
 * The event plans someone may file a request against: this school, this year,
 * and either theirs or — for leadership — all of them.
 *
 * Reuses `invitedEventPlansFilter`, the same predicate the Event Plans list and
 * the sidebar gate are built on, so the picker can't offer a plan the submit
 * action would then refuse.
 */
export async function getReimbursementEventPlanOptions(): Promise<
  { id: string; title: string }[]
> {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return [];
  const schoolYear = await getSchoolCurrentYear(schoolId);

  const yearFilter = and(
    eq(eventPlans.schoolId, schoolId),
    eq(eventPlans.schoolYear, schoolYear)
  );

  return db
    .select({ id: eventPlans.id, title: eventPlans.title })
    .from(eventPlans)
    .where(
      (await isSchoolLeadership(user.id!, schoolId))
        ? yearFilter
        : and(yearFilter, invitedEventPlansFilter(user.id!, schoolId))
    )
    .orderBy(asc(eventPlans.title));
}
