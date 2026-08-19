/**
 * Client-safe vocabulary for pre-funded spending cards.
 *
 * Same split as `reimbursements-shared.ts`: the labels and the small rules a
 * form and a server action both have to agree on, with no database behind them.
 */

export type SpendingCardStatus =
  | "requested"
  | "approved"
  | "issued"
  | "reconciled"
  | "denied"
  | "cancelled";

export const SPENDING_CARD_STATUSES: Record<
  SpendingCardStatus,
  {
    label: string;
    variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
  }
> = {
  requested: { label: "Requested", variant: "warning" },
  approved: { label: "Approved", variant: "default" },
  issued: { label: "Card issued", variant: "default" },
  reconciled: { label: "Reconciled", variant: "success" },
  denied: { label: "Declined", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "secondary" },
};

export function spendingCardStatusLabel(status: string): string {
  return SPENDING_CARD_STATUSES[status as SpendingCardStatus]?.label ?? status;
}

/**
 * The IRS accountable-plan window for returning money that was advanced and
 * not spent. Quoted in the reconciliation prompt so the treasurer knows what
 * the deadline actually is rather than guessing at "soon".
 */
export const UNSPENT_RETURN_WINDOW_DAYS = 120;
