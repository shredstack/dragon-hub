"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Check, Gavel, Loader2, Undo2, X } from "lucide-react";
import { FlagBadges } from "@/components/reimbursements/flag-badges";
import {
  approveReimbursement,
  markReimbursementPaid,
  recordAuthorization,
  recordBoardDecision,
  rejectReimbursement,
  requestReimbursementChanges,
  setPrincipalAcknowledged,
  setReimbursementBudgetCategory,
  type ReimbursementDetail,
} from "@/actions/reimbursements";
import { actionErrorMessage } from "@/lib/action-error";
import { formatCurrency } from "@/lib/utils";
import { parseMoney } from "@/lib/reimbursements-shared";

interface ReviewPanelProps {
  request: ReimbursementDetail;
  budgetCategoryOptions: { id: string; name: string }[];
}

type OpenForm =
  | null
  | "changes"
  | "reject"
  | "authorize"
  | "pay"
  | "board_decision";

/**
 * The officer's action bar.
 *
 * Everything the paper form asks an officer to do, in the order they do it:
 * check the budget line, record the board's authorization if the spending
 * needed one, sign, and — for the treasurer — write the check. The approve
 * button explains itself when it is disabled, because "why can't I click this?"
 * with no answer is what sends someone back to email.
 */
export function ReviewPanel({ request, budgetCategoryOptions }: ReviewPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState<OpenForm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [minutesDate, setMinutesDate] = useState(
    request.authorizationMinutesDate ?? ""
  );
  const [checkNumber, setCheckNumber] = useState("");

  const isOpenForReview =
    request.status === "submitted" || request.status === "changes_requested";

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
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium">Officer review</h2>
        {request.viewer.approvableAsLabel && (
          <span className="text-xs text-muted-foreground">
            You sign as {request.viewer.approvableAsLabel}
          </span>
        )}
      </div>

      {/* Flags first: what to look at before deciding anything. */}
      <FlagBadges flags={request.flags} />

      {error && (
        <p className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {/* Budget line: the treasurer's to set, because the submitter picked from
          a list of names they may not know the meaning of. */}
      {request.status !== "paid" && request.status !== "rejected" && (
        <div className="space-y-2">
          <Label htmlFor="review-category">Budget line</Label>
          <Select
            value={request.budgetCategoryId ?? ""}
            onValueChange={(value) =>
              run(() => setReimbursementBudgetCategory(request.id, value || null))
            }
          >
            <SelectTrigger id="review-category">
              <SelectValue placeholder="Not assigned" />
            </SelectTrigger>
            <SelectContent>
              {budgetCategoryOptions.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {request.budget && (
            <p className="text-xs text-muted-foreground">
              {formatCurrency(parseMoney(request.budget.committedAmount))} of{" "}
              {formatCurrency(parseMoney(request.budget.allocatedAmount))}{" "}
              already approved against this line —{" "}
              {formatCurrency(parseMoney(request.budget.remainingAmount))}{" "}
              remaining.
            </p>
          )}
        </div>
      )}

      {request.flags.needsAuthorization && isOpenForReview && (
        <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <Gavel className="mt-0.5 h-4 w-4 shrink-0" />
          {request.flags.overBudget
            ? "This request takes its budget line over its allocation. Approving a check needs the board's authorization on the record — budget approval alone isn't spending authority."
            : "Your state's rules require an association authorization (a minutes reference) on every request before it can be approved."}
        </p>
      )}

      {isOpenForReview && (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => run(() => approveReimbursement(request.id))}
            disabled={
              busy ||
              request.status !== "submitted" ||
              !!request.viewer.approvalBlockedReason ||
              !request.viewer.approvableAs
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => setOpen(open === "changes" ? null : "changes")}
            disabled={busy || request.status !== "submitted"}
          >
            <Undo2 className="h-4 w-4" />
            Request changes
          </Button>
          <Button
            variant="outline"
            onClick={() => setOpen(open === "authorize" ? null : "authorize")}
            disabled={busy}
          >
            <Gavel className="h-4 w-4" />
            {request.authorizationNote ? "Edit authorization" : "Record authorization"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => setOpen(open === "reject" ? null : "reject")}
            disabled={busy}
          >
            <X className="h-4 w-4" />
            Reject
          </Button>
        </div>
      )}

      {request.viewer.approvalBlockedReason && isOpenForReview && (
        <p className="text-sm text-muted-foreground">
          {request.viewer.approvalBlockedReason}
        </p>
      )}

      {request.status === "approved" && request.viewer.isTreasurer && (
        <Button onClick={() => setOpen(open === "pay" ? null : "pay")} disabled={busy}>
          Record the check
        </Button>
      )}

      {request.missingReceipt &&
        request.viewer.isTreasurer &&
        request.status !== "rejected" && (
          <Button
            variant="outline"
            onClick={() =>
              setOpen(open === "board_decision" ? null : "board_decision")
            }
            disabled={busy}
          >
            <Gavel className="h-4 w-4" />
            {request.boardDecisionNote
              ? "Edit the board's decision"
              : "Record the board's decision"}
          </Button>
        )}

      {open === "changes" && (
        <NoteForm
          label="What needs changing?"
          placeholder="The receipt photo cuts off the total — can you retake it?"
          value={note}
          onChange={setNote}
          busy={busy}
          submitLabel="Send it back"
          onSubmit={() =>
            run(() => requestReimbursementChanges(request.id, note))
          }
        />
      )}

      {open === "reject" && (
        <NoteForm
          label="Why is this being rejected?"
          placeholder="This was paid from the classroom fund, not personal funds."
          value={note}
          onChange={setNote}
          busy={busy}
          submitLabel="Reject the request"
          destructive
          onSubmit={() => run(() => rejectReimbursement(request.id, note))}
        />
      )}

      {open === "authorize" && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-2">
            <Label htmlFor="authorization-note">
              Which meeting authorized this spending?
            </Label>
            <Textarea
              id="authorization-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Approved by the board at the March meeting, item 4."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minutes-date">Minutes date (optional)</Label>
            <Input
              id="minutes-date"
              type="date"
              value={minutesDate}
              onChange={(e) => setMinutesDate(e.target.value)}
            />
          </div>
          <Button
            onClick={() =>
              run(() =>
                recordAuthorization(request.id, note, minutesDate || undefined)
              )
            }
            disabled={busy || !note.trim()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record it
          </Button>
        </div>
      )}

      {open === "pay" && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="space-y-2">
            <Label htmlFor="check-number">Check number</Label>
            <Input
              id="check-number"
              value={checkNumber}
              onChange={(e) => setCheckNumber(e.target.value)}
              placeholder="1042"
            />
            <p className="text-xs text-muted-foreground">
              This is what orders the physical disbursement file, and what the
              sales tax refund report is built from.
            </p>
          </div>
          <Button
            onClick={() =>
              run(() => markReimbursementPaid(request.id, checkNumber))
            }
            disabled={busy || !checkNumber.trim()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Mark paid
          </Button>
        </div>
      )}

      {open === "board_decision" && (
        <NoteForm
          label="What did the board decide about the missing receipt?"
          placeholder="Board voted to reimburse on the strength of the bank statement, March meeting."
          value={note}
          onChange={setNote}
          busy={busy}
          submitLabel="Record the decision"
          onSubmit={() => run(() => recordBoardDecision(request.id, note))}
        />
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <div>
          <p className="text-sm font-medium">Principal acknowledged</p>
          <p className="text-xs text-muted-foreground">
            Signed on paper — this only records that it happened.
          </p>
        </div>
        <Switch
          checked={request.principalAcknowledged}
          onCheckedChange={(value) =>
            run(() => setPrincipalAcknowledged(request.id, value))
          }
          disabled={busy}
        />
      </div>
    </div>
  );
}

function NoteForm({
  label,
  placeholder,
  value,
  onChange,
  onSubmit,
  submitLabel,
  busy,
  destructive = false,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
  destructive?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="space-y-2">
        <Label>{label}</Label>
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      <Button
        variant={destructive ? "destructive" : "default"}
        onClick={onSubmit}
        disabled={busy || !value.trim()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}
