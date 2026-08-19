import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { parseMoney } from "@/lib/reimbursements-shared";
import {
  SPENDING_CARD_STATUSES,
  type SpendingCardStatus,
} from "@/lib/spending-cards-shared";
import type { SpendingCardView } from "@/actions/spending-cards";

interface SpendingCardListProps {
  cards: SpendingCardView[];
  showRequester?: boolean;
  emptyTitle: string;
  emptyDescription: string;
}

/**
 * Cards, in the card-on-mobile / table-on-desktop shape the rest of this area
 * uses. The amount column shows what was *issued* once there is one, because
 * from that point on the requested figure is history and the issued figure is
 * what has to be accounted for.
 */
export function SpendingCardList({
  cards,
  showRequester = false,
  emptyTitle,
  emptyDescription,
}: SpendingCardListProps) {
  if (cards.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={`/reimbursements/cards/${card.id}`}
            className="block rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate font-medium">{card.purpose}</p>
              <span className="shrink-0 font-medium">
                {formatCurrency(
                  parseMoney(card.issuedAmount ?? card.requestedAmount)
                )}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <CardStatusBadge status={card.status} />
              {showRequester && (
                <span className="text-xs text-muted-foreground">
                  {card.requesterName}
                </span>
              )}
              {card.cardLabel && (
                <span className="text-xs text-muted-foreground">
                  · {card.cardLabel}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <div className="hidden rounded-lg border border-border bg-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Purpose</th>
                {showRequester && (
                  <th className="px-4 py-3 font-medium">Requested by</th>
                )}
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Card</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">Receipts</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr
                  key={card.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/reimbursements/cards/${card.id}`}
                      className="font-medium hover:underline"
                    >
                      {card.purpose}
                    </Link>
                  </td>
                  {showRequester && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {card.requesterName}
                    </td>
                  )}
                  <td className="px-4 py-3 text-muted-foreground">
                    {card.eventPlanTitle ?? card.eventLabel ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {card.cardLabel ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(
                      parseMoney(card.issuedAmount ?? card.requestedAmount)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {card.receiptCount}
                  </td>
                  <td className="px-4 py-3">
                    <CardStatusBadge status={card.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export function CardStatusBadge({ status }: { status: SpendingCardStatus }) {
  const spec = SPENDING_CARD_STATUSES[status];
  return (
    <Badge variant={spec?.variant ?? "secondary"}>{spec?.label ?? status}</Badge>
  );
}
