"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  deleteReimbursementDraft,
  getReimbursementDraftCounts,
} from "@/actions/reimbursements";
import { actionErrorMessage } from "@/lib/action-error";

interface DiscardDraftButtonProps {
  requestId: string;
  /**
   * How many receipts hung off the draft when the page was rendered. A
   * starting point only — the real count is read back when the button is
   * pressed, and this stands in only if that read fails.
   */
  initialExpenseCount: number;
  /** How many uploaded images went with them, on the same terms. */
  initialPhotoCount: number;
}

/**
 * Throw away a draft nobody meant to start.
 *
 * A draft request is created by the *first photograph*, not by a Save, so an
 * abandoned one is easy to make and — until this existed — impossible to get
 * rid of: it sat in the submitter's list looking like an unfinished job.
 *
 * Offered only for `draft`, which is the same line the server action draws. A
 * request that has been in front of an officer is a record, and the way to end
 * one of those is for an officer to reject it, which says who ended it and why.
 *
 * The confirmation is not ceremony. The photos are the part that cannot be
 * recreated — the receipt is in a bin in the Costco parking lot — so the dialog
 * counts them rather than asking a bare "are you sure?".
 *
 * The counts are read back from the server at the moment of the press, because
 * the wizard beside this button keeps adding receipts and photos to the same
 * draft without reloading the page: the numbers this component was rendered
 * with go stale in the hands of the person with the most to lose.
 */
export function DiscardDraftButton({
  requestId,
  initialExpenseCount,
  initialPhotoCount,
}: DiscardDraftButtonProps) {
  const router = useRouter();
  const { confirm, confirmDialog, closeConfirm } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDiscard() {
    setError(null);
    setBusy(true);
    // A failed read must not be the reason a draft can't be discarded: fall
    // back to what the page was rendered with, which is never an overstatement.
    let expenseCount = initialExpenseCount;
    let photoCount = initialPhotoCount;
    try {
      const counts = await getReimbursementDraftCounts(requestId);
      expenseCount = counts.expenses;
      photoCount = counts.photos;
    } catch {
      // Keep the rendered counts.
    } finally {
      setBusy(false);
    }

    const consequences: string[] = [];
    if (photoCount > 0) {
      consequences.push(
        `${photoCount} uploaded receipt photo${photoCount === 1 ? "" : "s"} will be deleted`
      );
    }
    if (expenseCount > 0) {
      consequences.push(
        `${expenseCount} receipt${expenseCount === 1 ? "" : "s"} and any line items you typed will go with it`
      );
    }

    const ok = await confirm({
      title: "Discard this draft?",
      description:
        "Nothing has been sent to the officers, so there is no record to keep. This can't be undone.",
      consequences,
      confirmLabel: "Discard draft",
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      await deleteReimbursementDraft(requestId);
      router.push("/reimbursements");
      router.refresh();
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't discard that draft."));
      setBusy(false);
    } finally {
      closeConfirm();
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleDiscard}
        disabled={busy}
        className="text-muted-foreground hover:text-destructive"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Discard draft
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {confirmDialog}
    </div>
  );
}
