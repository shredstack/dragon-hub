import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QueueTable } from "@/components/reimbursements/queue-table";
import { SpendingCardList } from "@/components/reimbursements/spending-card-list";
import { CreditCard, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { parseMoney } from "@/lib/reimbursements-shared";
import type { ReimbursementListItem } from "@/actions/reimbursements";
import type { SpendingCardView } from "@/actions/spending-cards";

interface EventPlanExpensesProps {
  eventPlanId: string;
  requests: ReimbursementListItem[];
  /** Empty unless the state policy runs pre-funded cards. */
  spendingCards: SpendingCardView[];
  spendingCardsEnabled: boolean;
  /** Leads, board and officers see the whole plan's spending, not just theirs. */
  seesAll: boolean;
  /** False once the plan is completed and locked to its leads. */
  canSubmit: boolean;
}

/**
 * What this event has cost, on the plan itself.
 *
 * The event plan is the primary entry point for a reimbursement, not
 * `/reimbursements` — someone who bought paper plates for the Fall Carnival
 * thinks about the Fall Carnival, not about the finance section. So the button
 * lives here and carries the plan with it.
 *
 * The totals count approved and paid requests only. A submitted request is a
 * claim, not a cost, and a lead reading "we've spent $900" wants the number
 * the treasurer would recognise.
 */
export function EventPlanExpenses({
  eventPlanId,
  requests,
  spendingCards,
  spendingCardsEnabled,
  seesAll,
  canSubmit,
}: EventPlanExpensesProps) {
  const settled = requests.filter(
    (r) => r.status === "approved" || r.status === "paid"
  );
  const settledTotal = settled.reduce(
    (sum, r) => sum + parseMoney(r.totalAmount),
    0
  );
  const pending = requests.filter(
    (r) => r.status === "submitted" || r.status === "changes_requested"
  );
  const pendingTotal = pending.reduce(
    (sum, r) => sum + parseMoney(r.totalAmount),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-medium">
            {seesAll ? "Expenses" : "Your expenses"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(settledTotal)} approved or paid
            {pending.length > 0 &&
              ` · ${formatCurrency(pendingTotal)} still under review`}
          </p>
        </div>
        {canSubmit && (
          <div className="flex flex-wrap gap-2">
            {spendingCardsEnabled && (
              <Link
                href={`/reimbursements/cards/new?eventPlanId=${eventPlanId}`}
              >
                <Button variant="outline">
                  <CreditCard className="h-4 w-4" />
                  Request a card
                </Button>
              </Link>
            )}
            <Link href={`/reimbursements/new?eventPlanId=${eventPlanId}`}>
              <Button>
                <Plus className="h-4 w-4" />
                Submit a reimbursement
              </Button>
            </Link>
          </div>
        )}
      </div>

      <QueueTable
        requests={requests}
        showSubmitter={seesAll}
        emptyTitle="Nothing claimed yet"
        emptyDescription={
          canSubmit
            ? "Bought something for this event with your own money? Photograph the receipt and the treasurer writes you a check."
            : "No reimbursement requests have been filed against this event."
        }
      />

      {/* Only where the state policy runs cards, and only once there is one —
          an empty second table on every event plan is noise. */}
      {spendingCardsEnabled && spendingCards.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="font-medium">Pre-funded cards</h3>
          <SpendingCardList
            cards={spendingCards}
            showRequester={seesAll}
            emptyTitle="No cards"
            emptyDescription=""
          />
        </div>
      )}
    </div>
  );
}
