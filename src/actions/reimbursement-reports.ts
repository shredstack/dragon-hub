"use server";

import {
  assertAuthenticated,
  assertReimbursementOfficer,
  getCurrentSchoolId,
} from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  budgetCategories,
  reimbursementReceipts,
  reimbursementRequests,
  users,
} from "@/lib/db/schema";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { toCsv } from "@/lib/csv";
import { getReimbursementPolicy } from "@/lib/reimbursement-policy";
import { getSchoolCurrentYear, schoolYearDateRange } from "@/lib/school-year";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { formatDateOnly, toDateOnly } from "@/lib/date-only";
import { formatDateInTimeZone } from "@/lib/time-zone";
import { parseMoney } from "@/lib/reimbursements-shared";

/**
 * The treasurer's payoff.
 *
 * Three reports, all built from paid requests, all officer-gated, and all CSV
 * through the shared `toCsv` helper so an exported cell can never be read as a
 * spreadsheet formula. Between them they answer the three questions a PTA's
 * year-end actually consists of: what do we reclaim from the state, what does
 * the physical disbursement file have to contain, and what goes into the books.
 *
 * None of them invents a number. Every figure is one an officer already
 * approved on a specific request, which is why each row carries the check
 * number that finds the paper behind it.
 */

export interface ReportRange {
  /** `YYYY-MM-DD`. Defaults to the school year's start. */
  from?: string;
  /** `YYYY-MM-DD`. Defaults to the school year's end. */
  to?: string;
}

export interface ReportFile {
  filename: string;
  csv: string;
}

export interface DisbursementRow {
  id: string;
  checkNumber: string;
  paidAt: string | null;
  payeeName: string;
  vendor: string;
  purpose: string;
  budgetCategoryName: string | null;
  subtotalAmount: string;
  salesTaxAmount: string;
  totalAmount: string;
  purchaseDate: string;
  eventLabel: string | null;
  receiptUrls: string[];
}

/** Officer gate plus the school and the window every report shares. */
async function reportContext(range: ReportRange) {
  const user = await assertAuthenticated();
  const schoolId = await getCurrentSchoolId();
  if (!schoolId) throw new Error("No school selected");
  await assertReimbursementOfficer(user.id!, schoolId);

  const schoolYear = await getSchoolCurrentYear(schoolId);
  const yearRange = schoolYearDateRange(schoolYear);

  return {
    schoolId,
    schoolYear,
    from: toDateOnly(range.from) || yearRange.start,
    to: toDateOnly(range.to) || yearRange.end,
  };
}

/**
 * Every paid request in the window, with the joins all three reports want.
 *
 * Filtered on `purchase_date` rather than `paid_at`, because that is what a
 * `date` column can be compared against without dragging a time zone into it,
 * and because both the sales tax refund and the books are organized by when the
 * money was spent.
 */
async function paidRequests(context: {
  schoolId: string;
  from: string;
  to: string;
}) {
  const rows = await db
    .select({
      request: reimbursementRequests,
      budgetCategoryName: budgetCategories.name,
      payerName: users.name,
    })
    .from(reimbursementRequests)
    .leftJoin(
      budgetCategories,
      eq(reimbursementRequests.budgetCategoryId, budgetCategories.id)
    )
    .leftJoin(users, eq(reimbursementRequests.paidBy, users.id))
    .where(
      and(
        eq(reimbursementRequests.schoolId, context.schoolId),
        eq(reimbursementRequests.status, "paid"),
        gte(reimbursementRequests.purchaseDate, context.from),
        lte(reimbursementRequests.purchaseDate, context.to)
      )
    );

  const ids = rows.map((row) => row.request.id);
  const receipts = ids.length
    ? await db
        .select({
          requestId: reimbursementReceipts.requestId,
          blobUrl: reimbursementReceipts.blobUrl,
        })
        .from(reimbursementReceipts)
        .where(inArray(reimbursementReceipts.requestId, ids))
        .orderBy(asc(reimbursementReceipts.createdAt))
    : [];

  const receiptsByRequest = new Map<string, string[]>();
  for (const receipt of receipts) {
    // `request_id` is nullable since spending cards started sharing this table;
    // the `inArray` above already excludes card receipts, so this is a type
    // narrowing rather than a filter.
    if (!receipt.requestId) continue;
    const list = receiptsByRequest.get(receipt.requestId) ?? [];
    list.push(receipt.blobUrl);
    receiptsByRequest.set(receipt.requestId, list);
  }

  return rows.map((row) => ({ ...row, receiptUrls: receiptsByRequest.get(row.request.id) ?? [] }));
}

/**
 * Check numbers sort as *numbers* where they look like numbers.
 *
 * A physical check file runs 998, 999, 1000 — string ordering puts 1000 in the
 * middle of the nine hundreds, and the whole point of this register is that it
 * matches the drawer. Anything non-numeric (a void marker, "EFT") sorts after
 * the numbers, by text.
 */
function compareCheckNumbers(a: string, b: string): number {
  const left = Number.parseInt(a.replace(/\D/g, ""), 10);
  const right = Number.parseInt(b.replace(/\D/g, ""), 10);
  const leftNumeric = /^\d+$/.test(a.trim());
  const rightNumeric = /^\d+$/.test(b.trim());

  if (leftNumeric && rightNumeric) return left - right;
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return a.localeCompare(b);
}

// ─── 1. Sales tax refund report ─────────────────────────────────────────────

/**
 * The list a Utah PTA sends the state to reclaim the sales tax it paid.
 *
 * Ordered by the date the check was written, with the check number, the purpose
 * and the tax amount — exactly the columns the state asks for. Only paid
 * requests appear, because the refund covers expenses paid by PTA check.
 *
 * Gated on `policy.salesTaxRefundTracking`: a California PTA has no equivalent
 * mechanism, and offering the download there would be offering a form that goes
 * nowhere. The tax itself is captured everywhere regardless — it is part of the
 * IRS itemization and harmless to record.
 */
export async function getSalesTaxRefundReport(
  range: ReportRange = {}
): Promise<ReportFile> {
  const context = await reportContext(range);
  const policy = await getReimbursementPolicy(context.schoolId);
  if (!policy.salesTaxRefundTracking) {
    throw new Error(
      "Your state PTA doesn't run a sales tax refund, so there's no report to build."
    );
  }

  const timeZone = await getSchoolTimeZone(context.schoolId);
  const rows = (await paidRequests(context)).sort((a, b) => {
    const left = a.request.paidAt?.getTime() ?? 0;
    const right = b.request.paidAt?.getTime() ?? 0;
    return left - right;
  });

  const csv = toCsv(
    [
      { key: "checkNumber", label: "Check number" },
      { key: "datePaid", label: "Date paid" },
      { key: "payee", label: "Payee" },
      { key: "purpose", label: "Purpose" },
      { key: "total", label: "Total paid" },
      { key: "salesTax", label: "Sales tax" },
    ],
    rows.map((row) => ({
      checkNumber: row.request.checkNumber ?? "",
      datePaid: row.request.paidAt
        ? formatDateInTimeZone(row.request.paidAt, timeZone)
        : "",
      payee: row.request.payeeName,
      purpose: row.request.purpose,
      total: parseMoney(row.request.totalAmount).toFixed(2),
      salesTax: parseMoney(row.request.salesTaxAmount).toFixed(2),
    })),
    {
      notes: [
        `Sales tax paid on reimbursed purchases, ${formatDateOnly(context.from)} to ${formatDateOnly(context.to)}.`,
        `Total sales tax: ${rows
          .reduce((sum, row) => sum + parseMoney(row.request.salesTaxAmount), 0)
          .toFixed(2)}`,
        "Covers expenses paid by PTA check only. Keep the supporting receipts for at least three years.",
      ],
    }
  );

  return { filename: `sales-tax-refund-${context.from}-to-${context.to}.csv`, csv };
}

// ─── 2. Disbursement register ───────────────────────────────────────────────

/**
 * Every check written, in check-number order — the order the physical file has
 * to be kept in, so the two can be checked against each other line by line.
 */
export async function getDisbursementRegister(
  range: ReportRange = {}
): Promise<DisbursementRow[]> {
  const context = await reportContext(range);
  const rows = await paidRequests(context);

  return rows
    .sort((a, b) =>
      compareCheckNumbers(
        a.request.checkNumber ?? "",
        b.request.checkNumber ?? ""
      )
    )
    .map((row) => ({
      id: row.request.id,
      checkNumber: row.request.checkNumber ?? "",
      paidAt: row.request.paidAt?.toISOString() ?? null,
      payeeName: row.request.payeeName,
      vendor: row.request.vendor,
      purpose: row.request.purpose,
      budgetCategoryName: row.budgetCategoryName,
      subtotalAmount: row.request.subtotalAmount,
      salesTaxAmount: row.request.salesTaxAmount,
      totalAmount: row.request.totalAmount,
      purchaseDate: toDateOnly(row.request.purchaseDate),
      eventLabel: row.request.eventLabel,
      receiptUrls: row.receiptUrls,
    }));
}

export async function getDisbursementRegisterCsv(
  range: ReportRange = {}
): Promise<ReportFile> {
  const rows = await getDisbursementRegister(range);
  const context = await reportContext(range);
  const timeZone = await getSchoolTimeZone(context.schoolId);

  const csv = toCsv(
    [
      { key: "checkNumber", label: "Check number" },
      { key: "datePaid", label: "Date paid" },
      { key: "payee", label: "Payee" },
      { key: "vendor", label: "Vendor" },
      { key: "purpose", label: "Purpose" },
      { key: "category", label: "Budget line" },
      { key: "subtotal", label: "Subtotal" },
      { key: "salesTax", label: "Sales tax" },
      { key: "total", label: "Total" },
      { key: "receipts", label: "Receipts" },
    ],
    rows.map((row) => ({
      checkNumber: row.checkNumber,
      datePaid: row.paidAt ? formatDateInTimeZone(row.paidAt, timeZone) : "",
      payee: row.payeeName,
      vendor: row.vendor,
      purpose: row.purpose,
      category: row.budgetCategoryName ?? "",
      subtotal: parseMoney(row.subtotalAmount).toFixed(2),
      salesTax: parseMoney(row.salesTaxAmount).toFixed(2),
      total: parseMoney(row.totalAmount).toFixed(2),
      receipts: row.receiptUrls.join(" "),
    })),
    {
      notes: [
        `Disbursements ${formatDateOnly(context.from)} to ${formatDateOnly(context.to)}, in check-number order.`,
        `Total disbursed: ${rows
          .reduce((sum, row) => sum + parseMoney(row.totalAmount), 0)
          .toFixed(2)}`,
      ],
    }
  );

  return {
    filename: `disbursement-register-${context.from}-to-${context.to}.csv`,
    csv,
  };
}

// ─── 3. MyPTEZ export ───────────────────────────────────────────────────────

/**
 * Paid requests in the column shape MyPTEZ's transaction import expects.
 *
 * The columns mirror the transaction mapping in the MyPTEZ CSV import spec —
 * date, description, amount, category, check number, type — so a treasurer maps
 * them once and pastes them through. Deliberately not a second format of our
 * own invention: the budget category *name* is the join key between DragonHub
 * and MyPTEZ, which is why it travels as text rather than as our id.
 *
 * Amounts are negative, matching that spec's `amountIsNegativeForExpenses` and
 * how `budget_transactions` already records an expense. Dates are `MM/DD/YYYY`,
 * which is what MyPTEZ prints and what the mapping's `dateFormat` names first.
 */
export async function getMyPtezExport(
  range: ReportRange = {}
): Promise<ReportFile> {
  const context = await reportContext(range);
  const rows = (await paidRequests(context)).sort((a, b) =>
    toDateOnly(a.request.purchaseDate).localeCompare(
      toDateOnly(b.request.purchaseDate)
    )
  );

  const csv = toCsv(
    [
      { key: "date", label: "Date" },
      { key: "description", label: "Description" },
      { key: "payee", label: "Payee" },
      { key: "amount", label: "Amount" },
      { key: "category", label: "Category" },
      { key: "checkNumber", label: "Check Number" },
      { key: "type", label: "Type" },
    ],
    rows.map((row) => ({
      date: usDate(toDateOnly(row.request.purchaseDate)),
      description: row.request.purpose,
      payee: row.request.payeeName,
      amount: (-parseMoney(row.request.totalAmount)).toFixed(2),
      category: row.budgetCategoryName ?? "",
      checkNumber: row.request.checkNumber ?? "",
      type: "Expense",
    })),
    {
      notes: [
        "Reimbursement checks from DragonHub. Amounts are negative because they are expenses.",
        "Category names must match your MyPTEZ categories — rename either side until they do.",
      ],
    }
  );

  return { filename: `myptez-reimbursements-${context.from}-to-${context.to}.csv`, csv };
}

/** `YYYY-MM-DD` → `MM/DD/YYYY`, without going near a `Date`. */
function usDate(day: string): string {
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : day;
}
