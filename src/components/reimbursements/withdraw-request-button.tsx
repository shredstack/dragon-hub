"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { withdrawReimbursement } from "@/actions/reimbursements";
import { actionErrorMessage } from "@/lib/action-error";
import type { ReimbursementStatus } from "@/lib/reimbursements-shared";

interface WithdrawRequestButtonProps {
  requestId: string;
  /** Decides the wording; the server re-checks that it is withdrawable. */
  status: ReimbursementStatus;
  /** Ghost beside the wizard, outline in the standalone card. */
  variant?: "ghost" | "outline";
}

/**
 * Take back your own request.
 *
 * Deliberately *not* the draft's Discard button with a different label. A draft
 * is deleted and there is nothing to say about it; this one leaves a row the
 * officers can still open, so it asks for a reason and it warns that the
 * request stays visible. Conflating the two would mean one of the two lies.
 *
 * The reason is optional and free text — it is a courtesy to whoever was
 * halfway through reviewing it, not a field anything reads back. It goes onto
 * the activity entry, and into the notification when the request was live.
 *
 * A plain confirm dialog would do for the yes/no, but not for the note, so this
 * uses a Dialog rather than `useConfirm`.
 */
export function WithdrawRequestButton({
  requestId,
  status,
  variant = "outline",
}: WithdrawRequestButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the officers currently see, which is what withdrawing changes.
  const wasLive = status === "submitted" || status === "changes_requested";

  async function handleWithdraw() {
    setBusy(true);
    setError(null);
    try {
      await withdrawReimbursement(requestId, reason);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't withdraw that request."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Undo2 className="h-4 w-4" />
        Withdraw request
      </Button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw this request?</DialogTitle>
            <DialogDescription>
              {wasLive
                ? "It comes out of the officers' review queue and nobody will act on it."
                : "It moves out of your open requests. The officer's decision stays on the record."}
            </DialogDescription>
          </DialogHeader>

          {/* Said plainly, because "withdraw" sounds like "delete" and this is
              not one. The receipts are the part people assume goes away. */}
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              The request, its receipts and its photos stay where they are — the
              board can still open it.
            </li>
            <li>The history records that you withdrew it, and when.</li>
            <li>
              You can&apos;t re-submit it afterwards. If you still need the
              money, file a fresh request.
            </li>
            {wasLive && (
              <li>The officers are told it no longer needs review.</li>
            )}
          </ul>

          <div className="space-y-2">
            <Label htmlFor="withdraw-reason">
              Why? <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="withdraw-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="The PTA paid the vendor directly — I don't need a check."
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleWithdraw}
              disabled={busy}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Withdraw request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
