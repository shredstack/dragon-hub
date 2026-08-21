import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FlagBadges } from "@/components/reimbursements/flag-badges";
import { RequestRowActions } from "@/components/reimbursements/request-row-actions";
import { Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatDateOnly } from "@/lib/date-only";
import {
  REIMBURSEMENT_STATUSES,
  isWithdrawableReimbursementStatus,
  parseMoney,
  type ReimbursementStatus,
} from "@/lib/reimbursements-shared";
import type { ReimbursementListItem } from "@/actions/reimbursements";

interface QueueTableProps {
  requests: ReimbursementListItem[];
  /**
   * The officer queue names who filed each request; a member's own list would
   * only ever say their own name back to them.
   */
  showSubmitter?: boolean;
  /**
   * Offer the submitter's own controls per row — set on "My requests" only.
   *
   * Not a user id passed in and compared, because the two lists that use this
   * table are already built from different queries: `getMyReimbursements`
   * returns nothing but the caller's own, and the officer queue is somebody
   * else's business to read, not to withdraw.
   */
  showOwnerActions?: boolean;
  emptyTitle: string;
  emptyDescription: string;
}

/**
 * The list of requests, in the card-on-mobile / table-on-desktop shape.
 *
 * Presentational and server-rendered: filtering happens in the URL, so this
 * component holds no state and the page it sits on stays a server component.
 */
export function QueueTable({
  requests,
  showSubmitter = false,
  showOwnerActions = false,
  emptyTitle,
  emptyDescription,
}: QueueTableProps) {
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <>
      {/* Mobile card view */}
      <div className="space-y-3 md:hidden">
        {requests.map((request) => (
          // The card is a link and the action is a button, so the button sits
          // in its own strip *outside* the anchor: a button nested in one is
          // invalid markup, and the tap would navigate instead of opening the
          // dialog.
          <div
            key={request.id}
            className="rounded-lg border border-border bg-card"
          >
            <Link
              href={`/reimbursements/${request.id}`}
              className="block p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{request.vendor || "—"}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {request.purpose}
                  </p>
                </div>
                <span className="shrink-0 font-medium">
                  {formatCurrency(parseMoney(request.totalAmount))}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={request.status} />
                <FlagBadges flags={request.flags} className="contents" />
                {showSubmitter && (
                  <span className="text-xs text-muted-foreground">
                    {request.submitterName}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDateOnly(request.purchaseDate)}
                </span>
                {request.expenseCount > 1 && (
                  <span className="text-xs text-muted-foreground">
                    · {request.expenseCount} receipts
                  </span>
                )}
                {request.eventPlanTitle && (
                  <span className="text-xs text-muted-foreground">
                    · {request.eventPlanTitle}
                  </span>
                )}
              </div>
            </Link>
            {/* The predicate is asked here too, so a row with no action keeps
                a plain card rather than an empty bordered strip. */}
            {showOwnerActions &&
              isWithdrawableReimbursementStatus(request.status) && (
                <div className="flex justify-end border-t border-border px-2 py-1.5">
                  <RequestRowActions
                    requestId={request.id}
                    status={request.status}
                  />
                </div>
              )}
          </div>
        ))}
      </div>

      {/* Desktop table view */}
      <div className="hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Vendor</th>
                {showSubmitter && (
                  <th className="px-4 py-3 font-medium">Submitted by</th>
                )}
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Budget line</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {showOwnerActions && (
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr
                  key={request.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/reimbursements/${request.id}`}
                      className="font-medium hover:underline"
                    >
                      {request.vendor || "Untitled request"}
                    </Link>
                    {/* One check can cover several receipts, and the treasurer
                        scanning this column needs to know before opening it. */}
                    {request.expenseCount > 1 && (
                      <span className="block text-xs text-muted-foreground">
                        {request.expenseCount} receipts
                      </span>
                    )}
                  </td>
                  {showSubmitter && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {request.submitterName}
                    </td>
                  )}
                  <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                    {request.purpose}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateOnly(request.purchaseDate)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {request.budgetCategoryName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(parseMoney(request.totalAmount))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={request.status} />
                      <FlagBadges flags={request.flags} className="contents" />
                    </div>
                  </td>
                  {showOwnerActions && (
                    <td className="px-4 py-3 text-right">
                      <RequestRowActions
                        requestId={request.id}
                        status={request.status}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function StatusBadge({ status }: { status: ReimbursementStatus }) {
  const spec = REIMBURSEMENT_STATUSES[status];
  return <Badge variant={spec?.variant ?? "secondary"}>{spec?.label ?? status}</Badge>;
}
