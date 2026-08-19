"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Check, CreditCard, Loader2, X } from "lucide-react";
import {
  ReceiptUploader,
  type UploadedReceipt,
} from "@/components/reimbursements/receipt-uploader";
import {
  approveSpendingCard,
  cancelSpendingCard,
  deleteSpendingCardReceipt,
  denySpendingCard,
  issueSpendingCard,
  reconcileSpendingCard,
  type SpendingCardDetail,
} from "@/actions/spending-cards";
import { actionErrorMessage } from "@/lib/action-error";
import { formatCurrency } from "@/lib/utils";
import { parseMoney } from "@/lib/reimbursements-shared";
import { UNSPENT_RETURN_WINDOW_DAYS } from "@/lib/spending-cards-shared";

interface SpendingCardPanelProps {
  card: SpendingCardDetail;
}

type OpenForm = null | "deny" | "issue" | "reconcile";

/**
 * The card's own actions, for both sides of it.
 *
 * The cardholder gets the receipt uploader — the *same* uploader, posting to
 * the same route into the same table, because a card's substantiation is a
 * receipt like any other. The treasurer gets approve, issue and reconcile, and
 * the reconciliation is where the unspent balance is accounted for: the whole
 * reason a pre-funded card is allowed at all is that the money is followed to
 * the end.
 */
export function SpendingCardPanel({ card }: SpendingCardPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState<OpenForm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [cardLabel, setCardLabel] = useState(card.cardLabel ?? "");
  const [issuedAmount, setIssuedAmount] = useState(
    card.issuedAmount ?? card.requestedAmount
  );
  const [spentAmount, setSpentAmount] = useState(card.spentAmount ?? "");
  const [receipts, setReceipts] = useState<UploadedReceipt[]>(card.receipts);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOpen(null);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't record that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-medium">
        <CreditCard className="h-4 w-4" />
        Card
      </h2>

      {error && (
        <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {/* Cardholder: receipts, while the card is out. */}
      {card.viewer.canAddReceipts && (
        <div className="space-y-2">
          <Label>Receipts</Label>
          <p className="text-sm text-muted-foreground">
            Every purchase on this card needs one. The treasurer can&apos;t
            close the card until they&apos;re here.
          </p>
          <ReceiptUploader
            receipts={receipts}
            onChange={setReceipts}
            ensureRequestId={async () => card.id}
            ownerField="spendingCardRequestId"
            onDeleteReceipt={deleteSpendingCardReceipt}
          />
        </div>
      )}

      {card.viewer.isRequester &&
        (card.status === "requested" || card.status === "approved") && (
          <Button
            variant="outline"
            onClick={() => run(() => cancelSpendingCard(card.id))}
            disabled={busy}
          >
            Cancel my request
          </Button>
        )}

      {card.viewer.isTreasurer && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2">
            {card.status === "requested" && (
              <>
                <Button
                  onClick={() => run(() => approveSpendingCard(card.id))}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setOpen(open === "deny" ? null : "deny")}
                  disabled={busy}
                >
                  <X className="h-4 w-4" />
                  Decline
                </Button>
              </>
            )}
            {card.status === "approved" && (
              <Button
                onClick={() => setOpen(open === "issue" ? null : "issue")}
                disabled={busy}
              >
                <CreditCard className="h-4 w-4" />
                Record the card
              </Button>
            )}
            {card.status === "issued" && (
              <Button
                onClick={() => setOpen(open === "reconcile" ? null : "reconcile")}
                disabled={busy}
              >
                Reconcile
              </Button>
            )}
          </div>

          {open === "deny" && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="space-y-2">
                <Label htmlFor="deny-reason">Why?</Label>
                <Textarea
                  id="deny-reason"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="This is over what's left on the carnival line — file a reimbursement instead."
                />
              </div>
              <Button
                variant="destructive"
                onClick={() => run(() => denySpendingCard(card.id, note))}
                disabled={busy || !note.trim()}
              >
                Decline the request
              </Button>
            </div>
          )}

          {open === "issue" && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="card-label">Which card</Label>
                  <Input
                    id="card-label"
                    value={cardLabel}
                    onChange={(e) => setCardLabel(e.target.value)}
                    placeholder="Card #3 · ****4417"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="issued-amount">Amount loaded</Label>
                  <Input
                    id="issued-amount"
                    inputMode="decimal"
                    value={issuedAmount}
                    onChange={(e) => setIssuedAmount(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Requested: {formatCurrency(parseMoney(card.requestedAmount))}.
                Load whatever is right — this figure is what the reconciliation
                has to account for.
              </p>
              <Button
                onClick={() =>
                  run(() =>
                    issueSpendingCard(card.id, { cardLabel, issuedAmount })
                  )
                }
                disabled={busy || !cardLabel.trim()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Mark issued
              </Button>
            </div>
          )}

          {open === "reconcile" && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="space-y-2">
                <Label htmlFor="spent-amount">Spent, per the receipts</Label>
                <Input
                  id="spent-amount"
                  inputMode="decimal"
                  value={spentAmount}
                  onChange={(e) => setSpentAmount(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Loaded {formatCurrency(parseMoney(card.issuedAmount))} ·{" "}
                  {card.receipts.length} receipt
                  {card.receipts.length === 1 ? "" : "s"} attached · unspent{" "}
                  {formatCurrency(
                    parseMoney(card.issuedAmount) - parseMoney(spentAmount)
                  )}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reconcile-note">
                  What happened to the unspent balance?
                </Label>
                <Textarea
                  id="reconcile-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Returned $42.13 to the PTA account on 14 March."
                />
                <p className="text-xs text-muted-foreground">
                  Money advanced and not spent has to go back within{" "}
                  {UNSPENT_RETURN_WINDOW_DAYS} days under the IRS
                  accountable-plan rule. This note is the record that it did.
                </p>
              </div>
              <Button
                onClick={() =>
                  run(() =>
                    reconcileSpendingCard(card.id, { spentAmount, note })
                  )
                }
                disabled={busy || !note.trim()}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Close the card
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
