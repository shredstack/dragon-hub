"use client";

import { useState } from "react";
import Link from "next/link";
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
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  AlertTriangle,
  Check,
  Gavel,
  Loader2,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { FlagBadges } from "@/components/reimbursements/flag-badges";
import {
  approveReimbursement,
  clearReimbursementApprovals,
  markReimbursementPaid,
  unmarkReimbursementPaid,
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
import {
  isClosedReimbursementStatus,
  parseMoney,
} from "@/lib/reimbursements-shared";

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
 *
 * The two undo controls sit apart from the rest, under their own rule: both
 * take back something the submitter has already been told about, so both ask
 * first and spell out what goes with them.
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
  const { confirm, confirmDialog, closeConfirm } = useConfirm();

  const isOpenForReview =
    request.status === "submitted" || request.status === "changes_requested";
  const canUndoPayment = request.status === "paid" && request.viewer.isTreasurer;
  const canClearApprovals =
    request.viewer.isTreasurer &&
    request.approvals.length > 0 &&
    (request.status === "submitted" || request.status === "approved");

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

  async function undoPayment() {
    const ok = await confirm({
      title: "Undo the check record?",
      description:
        "The request goes back to approved and waits on a check again. Nothing about the receipts or the money changes.",
      consequences: [
        request.checkNumber
          ? `Check number ${request.checkNumber} is erased from the record.`
          : "The recorded check number is erased.",
        "The date paid and who marked it paid are cleared.",
        "It drops off the sales tax refund and disbursement reports until a check is recorded again.",
        "The person who submitted it is told the payment record was undone.",
      ],
      confirmLabel: "Undo it",
      cancelLabel: "Leave it paid",
    });
    if (!ok) return;
    await run(() => unmarkReimbursementPaid(request.id));
    closeConfirm();
  }

  async function clearApprovals() {
    const ok = await confirm({
      title:
        request.approvals.length > 1
          ? "Clear both signatures?"
          : "Clear the signature?",
      description:
        "The request goes back into the review queue as if it had just been submitted, and has to be signed again before a check can be recorded.",
      consequences: [
        ...request.approvals.map(
          (approval) =>
            `${approval.roleLabel}'s signature (${approval.approverName}) is removed.`
        ),
        "The board authorization and the principal's acknowledgment are left as they are.",
        "The submitter and the officers are told it's back for review.",
      ],
      confirmLabel: "Clear approvals",
      cancelLabel: "Leave them",
    });
    if (!ok) return;
    await run(() => clearReimbursementApprovals(request.id));
    closeConfirm();
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

      {/* Withdrawn has no buttons at all, so say why rather than leaving an
          officer looking at an empty panel wondering what they've lost. */}
      {request.status === "withdrawn" && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {request.submitterName} withdrew this request, so there is nothing to
          review. It stays here as a record — see the history below for when,
          and for anything they said about it.
        </p>
      )}

      {/* Budget line: the treasurer's to set, because the submitter picked from
          a list of names they may not know the meaning of. */}
      {!isClosedReimbursementStatus(request.status) && (
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

          {/* An empty dropdown with no explanation is where a treasurer stops,
              and a full one she didn't set up is no clearer. The field is
              optional — approving and paying work without it — so this says
              what it buys and leaves the choice with her. Folded away, because
              it is a question you ask once. */}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none underline decoration-dotted underline-offset-2">
              {budgetCategoryOptions.length === 0
                ? "No budget lines yet — what is this field for?"
                : "What is the budget line for?"}
            </summary>
            <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
              <p>
                It&apos;s optional. You can approve a request and record its
                check without ever setting it — nothing here is blocked by
                leaving it as &ldquo;Not assigned.&rdquo;
              </p>
              <p>Setting it does two things:</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  The line&apos;s <strong>name</strong> fills the Category column
                  of the MyPTEZ export on the Reports tab, so the CSV imports
                  already categorized instead of you sorting it afterwards.
                </li>
                <li>
                  If the line has an amount budgeted, this panel shows what&apos;s
                  already committed against it before you approve one more.
                </li>
              </ul>
              <p>
                To use it, add your lines under{" "}
                <Link href="/admin/budget" className="underline">
                  Manage Budget
                </Link>{" "}
                — <strong>name them exactly as they read in MyPTEZ</strong>,
                since matching names are what make the import land. If MyPTEZ is
                where you keep the budget, leave the allocated amount blank; the
                name on its own is all the export needs.
              </p>
            </div>
          </details>
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

      {/* Still offered on a paid request — the board sometimes minutes its
          lost-receipt decision after the check. Not on a withdrawn one:
          there is no longer a claim for the board to decide about. */}
      {request.missingReceipt &&
        request.viewer.isTreasurer &&
        request.status !== "rejected" &&
        request.status !== "withdrawn" && (
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

      {/* Undoing a signature or a check is a correction, not a step in the
          review — kept below the line and named for what it takes back, so it
          isn't reached for by someone looking for the next thing to do. */}
      {(canUndoPayment || canClearApprovals) && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-sm font-medium">Corrections</p>
          <div className="flex flex-wrap gap-2">
            {canUndoPayment && (
              <Button variant="outline" onClick={undoPayment} disabled={busy}>
                <RotateCcw className="h-4 w-4" />
                Undo the check record
              </Button>
            )}
            {canClearApprovals && (
              <Button variant="outline" onClick={clearApprovals} disabled={busy}>
                <RotateCcw className="h-4 w-4" />
                Clear approvals
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {canUndoPayment
              ? "Wrong request, or a voided check? This erases the check number and puts it back to approved."
              : "Signed in error? This removes the signatures and sends it back to the review queue."}
          </p>
        </div>
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

      {confirmDialog}
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
