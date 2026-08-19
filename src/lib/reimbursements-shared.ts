/**
 * The rules a reimbursement form and the server action behind it must agree on.
 *
 * Client-safe: no database, no `server-only`, so the wizard, the officer review
 * panel and the actions in `src/actions/reimbursements.ts` share one set of
 * definitions. The resolved policy travels from a server component into a client
 * component as a prop, which is why its *type* lives here and its *resolution*
 * lives in `src/lib/reimbursement-policy.ts`.
 */

export type ReimbursementStatus =
  | "draft"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "paid";

/** Badge variants come from `src/components/ui/badge.tsx`. */
export const REIMBURSEMENT_STATUSES: Record<
  ReimbursementStatus,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }
> = {
  draft: { label: "Draft", variant: "secondary" },
  submitted: { label: "Awaiting review", variant: "warning" },
  changes_requested: { label: "Changes requested", variant: "warning" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  paid: { label: "Paid", variant: "success" },
};

export function reimbursementStatusLabel(status: string): string {
  return REIMBURSEMENT_STATUSES[status as ReimbursementStatus]?.label ?? status;
}

/**
 * The only two statuses in which the submitter may still change a request.
 * Everything else is a record: once it has been in front of an officer, an edit
 * would rewrite what they reviewed.
 */
export const EDITABLE_REIMBURSEMENT_STATUSES: ReimbursementStatus[] = [
  "draft",
  "changes_requested",
];

export function isEditableReimbursementStatus(status: string): boolean {
  return EDITABLE_REIMBURSEMENT_STATUSES.includes(
    status as ReimbursementStatus
  );
}

/** A school's resolved reimbursement rules. See `getReimbursementPolicy`. */
export interface ReimbursementPolicy {
  /** Board-position slugs whose approval a request needs, in signing order. */
  approverRoles: string[];
  /** Approval always needs an association/minutes reference, not just when over budget. */
  requiresMinutesApproval: boolean;
  /** Whether the Sales Tax Refund Report exists for this school. */
  salesTaxRefundTracking: boolean;
  /** Wording shown in the wizard, e.g. the state's tax exemption number. */
  taxGuidanceNote: string | null;
  /** IRS safe harbour: warn once an expense is older than this many days. */
  submissionWindowDays: number;
  /** Whether pre-funded spending cards are offered. */
  spendingCardsEnabled: boolean;
  /** Which row answered — for the super-admin screen and for debugging. */
  source: "district" | "state" | "default";
}

/**
 * Guardrails, not roadblocks. Every one of these is computed at read time and
 * shown to a human who decides; none of them blocks a submission, and only
 * `needsAuthorization` gates anything (approval, per §7 of the spec).
 */
export interface ReimbursementFlags {
  /** `subtotal + salesTax ≠ total` — the receipt and the claim disagree. */
  totalsMismatch: boolean;
  /** Purchased longer ago than `policy.submissionWindowDays`. */
  staleExpense: boolean;
  /** Same vendor and total as another request within 7 days. */
  possibleDuplicate: boolean;
  /** This request pushes its budget category past its allocation. */
  overBudget: boolean;
  /** Over budget or policy-required minutes approval, with no note recorded. */
  needsAuthorization: boolean;
  /** Submitted with no receipt — the board has to decide how to handle it. */
  missingReceipt: boolean;
}

export const NO_REIMBURSEMENT_FLAGS: ReimbursementFlags = {
  totalsMismatch: false,
  staleExpense: false,
  possibleDuplicate: false,
  overBudget: false,
  needsAuthorization: false,
  missingReceipt: false,
};

export function hasAnyFlag(flags: ReimbursementFlags): boolean {
  return Object.values(flags).some(Boolean);
}

/**
 * A money string from a form or a `decimal` column, as a number.
 *
 * Returns 0 rather than NaN for anything unreadable so a total never renders as
 * "$NaN"; callers that care whether a value was *given* check the raw string.
 */
export function parseMoney(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number.parseFloat(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The `"0.00"` form a `decimal(10,2)` column wants.
 *
 * Rounded to cents on the way in, because a receipt total typed as "12.005"
 * would otherwise be truncated by Postgres and stop matching the paper.
 */
export function toMoneyString(value: string | number | null | undefined): string {
  return parseMoney(value).toFixed(2);
}

/** Cent-level equality, so floating point can't invent a totals mismatch. */
export function moneyEquals(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/**
 * What a money box accepts *while it is being typed*.
 *
 * Deliberately permissive about half-finished values — `""`, `"12."`, `"."` all
 * survive, because a field that refuses the keystroke between "12" and "12.4"
 * cannot be typed into at all. What it does refuse is anything a
 * `decimal(10,2)` could not hold: letters, a second decimal point, a third
 * decimal place. `toMoneyString` is still what normalizes on the way to the
 * database; this only stops the box from holding something that would silently
 * become a different number there.
 *
 * Typed rather than spun, because these are phone keypads: `inputMode="decimal"`
 * on iOS offers a keyboard with no restraint of its own, so the restraint is
 * here.
 */
export function sanitizeMoneyInput(raw: string): string {
  let text = raw.replace(/[^0-9.]/g, "");
  const point = text.indexOf(".");
  if (point !== -1) {
    // Only the first point is a decimal point; the rest were mistakes.
    text = `${text.slice(0, point + 1)}${text.slice(point + 1).replace(/\./g, "")}`;
  }
  const [whole, decimals] = text.split(".");
  const trimmed = whole.length > 8 ? whole.slice(0, 8) : whole;
  return decimals === undefined ? trimmed : `${trimmed}.${decimals.slice(0, 2)}`;
}

/**
 * The same value once the person has moved on: cents shown, or empty left
 * empty. An amount displayed as "12.4" beside one displayed as "12.40" reads as
 * two different kinds of number on a receipt form, and the blur is the moment
 * it can be tidied without fighting the caret.
 */
export function formatMoneyInput(raw: string): string {
  const text = raw.trim();
  if (!text || text === ".") return "";
  return toMoneyString(text);
}

/** A count, as typed. Empty survives so the box can be cleared and retyped. */
export function sanitizeQuantityInput(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 5);
}

/**
 * What a request calls itself when it carries several receipts.
 *
 * A request is one check for one event, and its `vendor` is a rollup of the
 * receipts behind it — so a Costco run plus a party-shop run reads "Costco and
 * Party City" in the queue, the register and the check memo. Kept short on
 * purpose: past two names the list stops being a label and starts being data,
 * and the data is on the request itself.
 *
 * Duplicate names collapse case-insensitively, keeping the first spelling —
 * two till receipts from the same store on the same afternoon are one vendor.
 */
export function summarizeVendors(vendors: string[]): string {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const vendor of vendors) {
    const name = vendor.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique[0]}, ${unique[1]} and ${unique.length - 2} more`;
}

/** Whole days between two `YYYY-MM-DD` days, `to` minus `from`. */
export function daysBetweenDateOnly(from: string, to: string): number {
  const start = Date.parse(`${from}T12:00:00.000Z`);
  const end = Date.parse(`${to}T12:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

/**
 * The attestation the submitter ticks, and the officers verify against the
 * receipt image. Stated once here because it appears verbatim in the wizard, on
 * the request detail, and on the printable form for the binder.
 */
export const PERSONAL_FUNDS_ATTESTATION =
  "I paid with personal funds (not school, government-assistance, or other non-personal funds).";

/** What "I don't have a receipt" actually means, said the same way everywhere. */
export const MISSING_RECEIPT_EXPLANATION =
  "Without a receipt the board has to decide whether it can reimburse this, and record that decision. Expect it to take longer, and add as much detail as you can about what was bought and why.";
