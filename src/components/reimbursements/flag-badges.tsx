import { Badge } from "@/components/ui/badge";
import type { ReimbursementFlags } from "@/lib/reimbursements-shared";

/**
 * Guardrails, not roadblocks.
 *
 * Each badge is a thing a human should look at, phrased as the observation
 * rather than the verdict — "60+ days old", not "too late". None of them stops
 * anything: the point of a flag is that the officer looks at the receipt, and
 * an app that decided for them would just teach everyone to work around it.
 *
 * `needsAuthorization` deliberately has no badge here. It is not a warning about
 * the request, it is the state of the board's spending authority, and the review
 * panel says so in a sentence with the fix attached.
 */
const FLAG_LABELS: {
  key: keyof ReimbursementFlags;
  label: string;
  title: string;
  variant: "warning" | "destructive" | "secondary";
}[] = [
  {
    key: "missingReceipt",
    label: "No receipt",
    title: "Submitted without a receipt — the board decides how to handle it.",
    variant: "warning",
  },
  {
    key: "totalsMismatch",
    label: "Totals don't add up",
    title: "Subtotal plus sales tax doesn't equal the claimed total.",
    variant: "warning",
  },
  {
    key: "possibleDuplicate",
    label: "Possible duplicate",
    title:
      "Another request has the same vendor and total within a week of this one.",
    variant: "warning",
  },
  {
    key: "staleExpense",
    label: "Old expense",
    title:
      "Submitted outside the IRS substantiation window for this state's policy.",
    variant: "secondary",
  },
  {
    key: "overBudget",
    label: "Over budget",
    title:
      "This takes its budget line past its allocation — approval needs a board authorization on the record.",
    variant: "destructive",
  },
];

export function FlagBadges({
  flags,
  className,
}: {
  flags: ReimbursementFlags;
  className?: string;
}) {
  const active = FLAG_LABELS.filter((flag) => flags[flag.key]);
  if (active.length === 0) return null;

  return (
    <div className={className ?? "flex flex-wrap gap-1.5"}>
      {active.map((flag) => (
        <Badge key={flag.key} variant={flag.variant} title={flag.title}>
          {flag.label}
        </Badge>
      ))}
    </div>
  );
}
