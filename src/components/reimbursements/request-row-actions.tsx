"use client";

import { WithdrawRequestButton } from "@/components/reimbursements/withdraw-request-button";
import {
  isWithdrawableReimbursementStatus,
  type ReimbursementStatus,
} from "@/lib/reimbursements-shared";

interface RequestRowActionsProps {
  requestId: string;
  status: ReimbursementStatus;
}

/**
 * The one control a submitter wants from the list rather than from the request:
 * getting rid of it.
 *
 * A **draft** falls out of this on its own — it isn't withdrawable, it's
 * discardable — and that is the right answer here for a second reason.
 * Discarding a draft destroys receipt photos that cannot be retaken, so its
 * dialog counts them first; that count is a per-row server call this list has
 * no business making. The draft's own page is where that decision belongs.
 *
 * Renders nothing past approval, so the actions column stays empty rather than
 * disabled: a button that is never pressable is worse than no button.
 */
export function RequestRowActions({
  requestId,
  status,
}: RequestRowActionsProps) {
  if (!isWithdrawableReimbursementStatus(status)) return null;

  return (
    <WithdrawRequestButton
      requestId={requestId}
      status={status}
      variant="ghost"
    />
  );
}
