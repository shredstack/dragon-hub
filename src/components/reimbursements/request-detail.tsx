import Link from "next/link";
import { StatusBadge } from "@/components/reimbursements/queue-table";
import { FlagBadges } from "@/components/reimbursements/flag-badges";
import { FileText, Gavel, Receipt as ReceiptIcon } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatDateOnly } from "@/lib/date-only";
import { formatDateTimeInTimeZone } from "@/lib/time-zone";
import { positionLabel, type BoardPositionLabels } from "@/lib/board-positions-shared";
import {
  PERSONAL_FUNDS_ATTESTATION,
  parseMoney,
} from "@/lib/reimbursements-shared";
import type { ReimbursementDetail } from "@/actions/reimbursements";

interface RequestDetailProps {
  request: ReimbursementDetail;
  positionLabels: BoardPositionLabels;
  timeZone: string;
}

/**
 * Everything about one request, laid out the way the paper form is read:
 * the money first, the receipt beside it, then who has signed and what
 * happened when.
 *
 * Presentational and server-rendered — the actions live in `review-panel.tsx`,
 * because "what does this request say" and "what may I do about it" are
 * different questions and only the second one needs the client.
 */
export function RequestDetail({
  request,
  positionLabels,
  timeZone,
}: RequestDetailProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={request.status} />
              <FlagBadges flags={request.flags} className="contents" />
            </div>
            <h2 className="mt-2 text-xl font-bold">
              {formatCurrency(parseMoney(request.totalAmount))}
            </h2>
            <p className="text-muted-foreground">
              {request.vendor} · {formatDateOnly(request.purchaseDate)}
              {request.expenseCount > 1 && ` · ${request.expenseCount} receipts`}
            </p>
          </div>
          <dl className="text-sm sm:text-right">
            <dt className="text-muted-foreground">Payable to</dt>
            <dd className="font-medium">{request.payeeName}</dd>
            {request.checkNumber && (
              <>
                <dt className="mt-2 text-muted-foreground">Check</dt>
                <dd className="font-medium">{request.checkNumber}</dd>
              </>
            )}
          </dl>
        </div>

        <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <Field label="What it was for" value={request.purpose} />
          <Field
            label="Event"
            value={
              request.eventPlanId && request.eventPlanTitle ? (
                <Link
                  href={`/events/${request.eventPlanId}`}
                  className="text-dragon-blue-600 hover:underline dark:text-dragon-blue-400"
                >
                  {request.eventPlanTitle}
                </Link>
              ) : (
                request.eventLabel || "General (non-event)"
              )
            }
          />
          <Field label="Submitted by" value={request.submitterName} />
          <Field
            label="Budget line"
            value={request.budgetCategoryName ?? "Not assigned"}
          />
          <Field
            label="Subtotal"
            value={formatCurrency(parseMoney(request.subtotalAmount))}
          />
          <Field
            label="Sales tax"
            value={formatCurrency(parseMoney(request.salesTaxAmount))}
          />
        </dl>

        <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
          {request.attestedPersonalFunds ? "✓ " : "⚠ "}
          {PERSONAL_FUNDS_ATTESTATION}
        </p>
      </div>

      {(request.authorizationNote || request.boardDecisionNote) && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          {request.authorizationNote && (
            <div className="flex items-start gap-2">
              <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">Board authorization</p>
                <p className="text-muted-foreground">
                  {request.authorizationNote}
                  {request.authorizationMinutesDate &&
                    ` — minutes of ${formatDateOnly(request.authorizationMinutesDate)}`}
                </p>
              </div>
            </div>
          )}
          {request.boardDecisionNote && (
            <div className="flex items-start gap-2">
              <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">Board decision on the missing receipt</p>
                <p className="text-muted-foreground">
                  {request.boardDecisionNote}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {request.rejectionReason && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Not approved</p>
          <p>{request.rejectionReason}</p>
        </div>
      )}

      {/*
        The receipts, each with its own money, its own itemization and its own
        pictures. Laid out one block per receipt rather than as three flat
        lists, because the officer's question is "does this slip say what this
        line says", and answering it means having both in one place.
      */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 font-medium">
          <ReceiptIcon className="h-4 w-4" />
          {request.expenses.length > 1
            ? `Receipts (${request.expenses.length})`
            : "Receipt"}
        </h3>

        {request.expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {request.missingReceipt
              ? "None — this one goes to the board to decide."
              : "Nothing entered yet."}
          </p>
        ) : (
          request.expenses.map((expense, index) => (
            <div
              key={expense.id}
              className="border-t border-border pt-4 first:border-0 first:pt-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {expense.vendor || `Receipt ${index + 1}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateOnly(expense.purchaseDate)} ·{" "}
                    {formatCurrency(parseMoney(expense.subtotalAmount))} +{" "}
                    {formatCurrency(parseMoney(expense.salesTaxAmount))} tax
                  </p>
                </div>
                <p className="font-medium">
                  {formatCurrency(parseMoney(expense.totalAmount))}
                </p>
              </div>

              {expense.items.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {expense.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-4">
                      <span>
                        {item.quantity > 1 && (
                          <span className="text-muted-foreground">
                            {item.quantity}×{" "}
                          </span>
                        )}
                        {item.description}
                      </span>
                      <span className="text-muted-foreground">
                        {formatCurrency(parseMoney(item.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {expense.receipts.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No photo attached.
                </p>
              ) : (
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {expense.receipts.map((receipt) => (
                    <li key={receipt.id} className="space-y-1">
                      <a
                        href={receipt.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block overflow-hidden rounded-lg border border-border"
                      >
                        {receipt.contentType === "application/pdf" ? (
                          <span className="flex h-32 flex-col items-center justify-center gap-1 p-2 text-center">
                            <FileText className="h-6 w-6 text-muted-foreground" />
                            <span className="line-clamp-2 text-xs text-muted-foreground">
                              {receipt.fileName}
                            </span>
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={receipt.blobUrl}
                            alt={receipt.fileName}
                            className="h-32 w-full object-cover"
                          />
                        )}
                      </a>
                      {/* Beside the image, because that is where the officer's
                          government-funds check actually happens. */}
                      {receipt.paymentMethodHint && (
                        <p
                          className={
                            isNonPersonalFundsHint(receipt.paymentMethodHint)
                              ? "text-xs font-medium text-destructive"
                              : "text-xs text-muted-foreground"
                          }
                        >
                          Paid with {receipt.paymentMethodHint}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}

        {request.expenses.length > 1 && (
          <div className="flex justify-between gap-4 border-t border-border pt-3 text-sm font-medium">
            <span>One check for</span>
            <span>{formatCurrency(parseMoney(request.totalAmount))}</span>
          </div>
        )}

        {request.receipts.some((r) =>
          isNonPersonalFundsHint(r.paymentMethodHint)
        ) && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            One of these receipts looks like it was paid with
            government-assistance funds. A PTA cannot reimburse those. Check the
            receipt before approving — the reading is automatic and can be wrong.
          </p>
        )}
      </div>

      {/* Signatures — the digital half of the form's signature lines. */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-medium">Approvals</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {request.requiredApproverRoles.map((slug) => {
            const signed = request.approvals.find((a) => a.role === slug);
            return (
              <li key={slug} className="flex items-center justify-between gap-3">
                <span>{positionLabel(positionLabels, slug)}</span>
                {signed ? (
                  <span className="text-muted-foreground">
                    {signed.approverName}
                    {signed.createdAt &&
                      ` · ${formatDateTimeInTimeZone(signed.createdAt, timeZone)}`}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not yet signed</span>
                )}
              </li>
            );
          })}
        </ul>
        {request.principalAcknowledged && (
          <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
            Principal acknowledged on paper.
          </p>
        )}
      </div>

      {/* Activity — the audit trail. */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-medium">History</h3>
        <ol className="mt-3 space-y-3">
          {request.activity.map((entry) => (
            <li key={entry.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
              <div>
                <p>
                  <span className="font-medium">
                    {activityLabel(entry.action, positionLabels)}
                  </span>
                  {entry.actorName && (
                    <span className="text-muted-foreground">
                      {" "}
                      by {entry.actorName}
                    </span>
                  )}
                </p>
                {entry.note && (
                  <p className="text-muted-foreground">{entry.note}</p>
                )}
                {entry.createdAt && (
                  <p className="text-xs text-muted-foreground">
                    {formatDateTimeInTimeZone(entry.createdAt, timeZone)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * Does the payment method the receipt printed look like non-personal funds?
 *
 * A hint, rendered as a hint. It never blocks anything and never rejects
 * anything: the model read a line of thermal-printer text, and the officers'
 * inspection of the receipt is the legal control. What this buys is that the
 * officer *looks*, which is the step that used to get skipped.
 */
function isNonPersonalFundsHint(hint: string | null): boolean {
  if (!hint) return false;
  return /\b(ebt|snap|wic|p-?ebt|food\s?stamp)\b/i.test(hint);
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

/**
 * Activity actions are stored as machine slugs so the trail keeps its meaning
 * when a position is renamed. `approved:treasurer` resolves its role half
 * through the school's own labels, exactly as everything else that stores a
 * board-position slug does.
 */
function activityLabel(action: string, labels: BoardPositionLabels): string {
  if (action.startsWith("approved:")) {
    const slug = action.slice("approved:".length);
    return `Signed as ${positionLabel(labels, slug)}`;
  }
  const known: Record<string, string> = {
    submitted: "Submitted for approval",
    edited: "Edited after review",
    receipt_removed: "Receipt removed",
    changes_requested: "Sent back for changes",
    authorization_recorded: "Board authorization recorded",
    approved: "Fully approved",
    rejected: "Rejected",
    paid: "Check written",
    board_decision: "Board decision recorded",
    budget_category_set: "Budget line set",
    principal_acknowledged: "Principal acknowledgment recorded",
    principal_acknowledgment_cleared: "Principal acknowledgment cleared",
  };
  return known[action] ?? action;
}
