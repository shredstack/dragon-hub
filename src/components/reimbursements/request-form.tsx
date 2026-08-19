"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Info,
  Loader2,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import {
  ReceiptUploader,
  type UploadedReceipt,
} from "@/components/reimbursements/receipt-uploader";
import {
  createReimbursementDraft,
  createReimbursementExpense,
  deleteReimbursementExpense,
  extractReceiptDetails,
  submitReimbursement,
  updateReimbursementDraft,
  type ReimbursementExpenseInput,
  type ReimbursementItemInput,
} from "@/actions/reimbursements";
import type { ExtractableField } from "@/lib/ai/receipt-extraction";
import { actionErrorMessage } from "@/lib/action-error";
import { formatCurrency } from "@/lib/utils";
import {
  MISSING_RECEIPT_EXPLANATION,
  PERSONAL_FUNDS_ATTESTATION,
  moneyEquals,
  parseMoney,
  type ReimbursementPolicy,
} from "@/lib/reimbursements-shared";

/** The sentinel for "this isn't for an event" in the plan picker. */
const GENERAL_OPTION = "__general__";

/** One receipt as the page hands it to the form. */
export interface RequestFormExpense {
  id: string;
  vendor: string;
  purchaseDate: string;
  subtotalAmount: string;
  salesTaxAmount: string;
  totalAmount: string;
  items: ReimbursementItemInput[];
  receipts: UploadedReceipt[];
}

export interface RequestFormInitialValues {
  eventPlanId: string | null;
  eventLabel: string | null;
  payeeName: string;
  purpose: string;
  budgetCategoryId: string | null;
  missingReceipt: boolean;
  attestedPersonalFunds: boolean;
  expenses: RequestFormExpense[];
}

interface RequestFormProps {
  /** Set when resuming a draft or answering a request for changes. */
  requestId?: string | null;
  initial?: Partial<RequestFormInitialValues>;
  eventPlanOptions: { id: string; title: string }[];
  budgetCategoryOptions: { id: string; name: string }[];
  policy: ReimbursementPolicy;
  /** PTA board members may file operating expenses with no event plan. */
  canSubmitGeneral: boolean;
  defaultPayeeName: string;
  /** Locked when the wizard was opened from inside a plan. */
  lockedEventPlanId?: string | null;
  /** Today in the school's time zone — the default purchase date. */
  today: string;
}

type Step = 1 | 2 | 3;

/**
 * One receipt, as the form holds it.
 *
 * `key` is what React and every handler address it by, because a receipt exists
 * on screen before it exists in the database: the row is created by the act of
 * photographing (or by the first save), and `id` is null until then.
 */
interface ReceiptDraft {
  key: string;
  id: string | null;
  vendor: string;
  purchaseDate: string;
  subtotal: string;
  salesTax: string;
  total: string;
  items: ReimbursementItemInput[];
  receipts: UploadedReceipt[];
  /** What extraction said it wasn't sure it read correctly, per receipt. */
  uncertain: Set<ExtractableField>;
  extracted: boolean;
  extracting: boolean;
  extractionFailed: boolean;
}

/**
 * The submission wizard: receipts → details → attest.
 *
 * Mobile-first because that is where it is used — someone standing beside their
 * car with a bag of paper plates and a phone. The three steps exist so that the
 * one thing that must not be put off (photographing the receipts) happens before
 * anything that can be typed later.
 *
 * **One request, one event, one check, as many receipts as the errand
 * produced.** The Costco run and the party-shop run for the same class party
 * are two receipts on one request, each keeping its own vendor, date and
 * money — which is what the treasurer needs to match a line to a slip — and one
 * form in the binder instead of three. Filing for a *different* event is a
 * different request, and always was: the event lives on the request.
 *
 * The draft is created on the server as soon as there is something to attach to
 * it, and updated as each step is left, so a form abandoned at a traffic light
 * is still there afterwards.
 */
export function RequestForm({
  requestId: initialRequestId = null,
  initial,
  eventPlanOptions,
  budgetCategoryOptions,
  policy,
  canSubmitGeneral,
  defaultPayeeName,
  lockedEventPlanId = null,
  today,
}: RequestFormProps) {
  const router = useRouter();
  const [requestId, setRequestId] = useState<string | null>(initialRequestId);
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [missingReceipt, setMissingReceipt] = useState(
    initial?.missingReceipt ?? false
  );
  const [eventPlanId, setEventPlanId] = useState<string | null>(
    lockedEventPlanId ?? initial?.eventPlanId ?? null
  );
  const [eventLabel, setEventLabel] = useState(initial?.eventLabel ?? "");
  const [payeeName, setPayeeName] = useState(
    initial?.payeeName || defaultPayeeName
  );
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [budgetCategoryId, setBudgetCategoryId] = useState<string | null>(
    initial?.budgetCategoryId ?? null
  );
  const [attested, setAttested] = useState(
    initial?.attestedPersonalFunds ?? false
  );

  // Keys are counted rather than random so that server and client render the
  // same markup on the first pass.
  const nextKey = useRef(0);
  function makeKey(): string {
    nextKey.current += 1;
    return `receipt-${nextKey.current}`;
  }

  const [drafts, setDrafts] = useState<ReceiptDraft[]>(() =>
    initial?.expenses?.length
      ? initial.expenses.map((expense) => ({
          key: makeKey(),
          id: expense.id,
          vendor: expense.vendor,
          purchaseDate: expense.purchaseDate || today,
          subtotal: expense.subtotalAmount,
          salesTax: expense.salesTaxAmount,
          total: expense.totalAmount,
          items: expense.items,
          receipts: expense.receipts,
          uncertain: new Set<ExtractableField>(),
          // A receipt that already exists has been through a human once;
          // extraction must never come back and overwrite that.
          extracted: true,
          extracting: false,
          extractionFailed: false,
        }))
      : [blankDraft(makeKey(), today)]
  );

  /**
   * The drafts as they are *now*, for the async handlers.
   *
   * `ensureExpenseId` and the extraction pass both run across an await and then
   * write back; reading `drafts` from the closure would give them the array as
   * it was when the handler was created, which on a fast second photo is the
   * one without the first receipt's id in it.
   */
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  /** In-flight receipt-row creations, so two quick photos can't create two. */
  const creating = useRef(new Map<string, Promise<string>>());

  const isGeneral = !eventPlanId;
  const requestTotal = drafts.reduce(
    (sum, draft) => sum + parseMoney(draft.total),
    0
  );

  function patchDraft(key: string, patch: Partial<ReceiptDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft))
    );
  }

  /**
   * The receipts worth sending: everything the server already knows about,
   * plus anything the person has actually put something into. A blank card
   * they added and left alone is not a receipt.
   */
  function payload(): { keys: string[]; expenses: ReimbursementExpenseInput[] } {
    const filled = draftsRef.current.filter(
      (draft) => draft.id || hasContent(draft)
    );
    return {
      keys: filled.map((draft) => draft.key),
      expenses: filled.map((draft) => ({
        id: draft.id,
        vendor: draft.vendor,
        purchaseDate: draft.purchaseDate,
        subtotalAmount: draft.subtotal,
        salesTaxAmount: draft.salesTax,
        totalAmount: draft.total,
        items: draft.items,
      })),
    };
  }

  function currentValues() {
    return {
      eventPlanId,
      eventLabel: isGeneral ? eventLabel : null,
      payeeName,
      purpose,
      budgetCategoryId,
      missingReceipt,
      attestedPersonalFunds: attested,
    };
  }

  /**
   * The request id, creating the draft if this is the first thing that needs
   * one. Everything downstream — the receipt rows, the upload route, every
   * save — is keyed on it.
   */
  async function ensureRequestId(): Promise<string> {
    if (requestId) return requestId;
    if (!eventPlanId && !canSubmitGeneral) {
      throw new Error(
        "Pick the event this spending was for before adding a receipt."
      );
    }
    // Deliberately without the receipts: they are created by the calls below
    // and by `save`, which are the two paths that learn their ids back.
    const created = await createReimbursementDraft(currentValues());
    setRequestId(created.id);
    return created.id;
  }

  /** The receipt row this card's photos belong to, creating it on first use. */
  async function ensureExpenseId(key: string): Promise<string> {
    const existing = draftsRef.current.find((draft) => draft.key === key);
    if (existing?.id) return existing.id;

    const inFlight = creating.current.get(key);
    if (inFlight) return inFlight;

    const pending = (async () => {
      const owner = await ensureRequestId();
      const created = await createReimbursementExpense(owner);
      patchDraft(key, { id: created.id });
      return created.id;
    })();

    creating.current.set(key, pending);
    try {
      return await pending;
    } finally {
      creating.current.delete(key);
    }
  }

  /**
   * A photo arrived (or went away) on one receipt. The first one to land on an
   * empty card gets read by the AI and its values pre-filled.
   *
   * The emptiness test is the guard that matters: someone answering a request
   * for changes has already typed the truth into these fields, and an
   * extraction pass overwriting their corrections with a fresh guess is the
   * exact failure this feature must not have. Extraction pre-fills a blank
   * card; it never edits a filled one — and it is scoped to the card the photo
   * landed on, so a second receipt can never rewrite the first.
   */
  async function handleReceiptsChange(key: string, next: UploadedReceipt[]) {
    const draft = draftsRef.current.find((entry) => entry.key === key);
    if (!draft) return;

    const added = next.find(
      (candidate) => !draft.receipts.some((existing) => existing.id === candidate.id)
    );
    patchDraft(key, { receipts: next });

    const cardIsEmpty = !draft.vendor.trim() && parseMoney(draft.total) === 0;
    if (!added || draft.extracted || !cardIsEmpty) return;

    patchDraft(key, {
      extracted: true,
      extracting: true,
      extractionFailed: false,
    });
    try {
      const result = await extractReceiptDetails(added.id);
      // Null is the deliberate "we couldn't read it" answer, not an error: the
      // card simply stays blank, which is what it was a moment ago.
      if (!result) {
        patchDraft(key, { extracting: false, extractionFailed: true });
        return;
      }
      patchDraft(key, {
        extracting: false,
        ...(result.vendor ? { vendor: result.vendor } : {}),
        ...(result.purchaseDate ? { purchaseDate: result.purchaseDate } : {}),
        ...(result.subtotal ? { subtotal: result.subtotal } : {}),
        ...(result.salesTax ? { salesTax: result.salesTax } : {}),
        ...(result.total ? { total: result.total } : {}),
        ...(result.items.length > 0 ? { items: result.items } : {}),
        uncertain: new Set(result.uncertain as ExtractableField[]),
      });
    } catch {
      patchDraft(key, { extracting: false, extractionFailed: true });
    }
  }

  function addDraft() {
    setDrafts((current) => [...current, blankDraft(makeKey(), today)]);
  }

  /**
   * Remove a receipt, and with it its photos and line items.
   *
   * The last one leaves a blank card behind rather than nothing: a request with
   * no receipt at all is a state the form should never sit in silently, and
   * there has to be somewhere to put the next photo.
   */
  async function removeDraft(key: string) {
    setError(null);
    const draft = draftsRef.current.find((entry) => entry.key === key);
    if (!draft) return;
    try {
      if (draft.id) await deleteReimbursementExpense(draft.id);
      setDrafts((current) => {
        const rest = current.filter((entry) => entry.key !== key);
        return rest.length > 0 ? rest : [blankDraft(makeKey(), today)];
      });
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't remove that receipt."));
    }
  }

  async function save(): Promise<string> {
    const id = await ensureRequestId();
    const { keys, expenses } = payload();
    const saved = await updateReimbursementDraft(id, {
      ...currentValues(),
      expenses,
    });
    // Adopt the ids of any receipt the server has just created, so the next
    // save updates it instead of filing a second copy.
    setDrafts((current) =>
      current.map((draft) => {
        const index = keys.indexOf(draft.key);
        const assigned = index >= 0 ? saved.expenseIds[index] : undefined;
        return assigned && assigned !== draft.id ? { ...draft, id: assigned } : draft;
      })
    );
    return id;
  }

  async function goToStep(next: Step) {
    setError(null);
    // Going back never saves — it would turn "let me check what I typed" into a
    // write, and a validation error on the way back is a dead end.
    if (next < step) {
      setStep(next);
      return;
    }
    setBusy(true);
    try {
      if (next === 2) {
        if (!eventPlanId && !canSubmitGeneral) {
          throw new Error("Pick the event this spending was for.");
        }
        if (!missingReceipt && !drafts.some((draft) => draft.receipts.length > 0)) {
          throw new Error(
            "Add a receipt, or tick \"I don't have a receipt\" so the board can decide."
          );
        }
      }
      if (next === 3) {
        const filled = drafts.filter(hasContent);
        if (filled.length === 0) throw new Error("Add the receipt details.");
        filled.forEach((draft, index) => {
          const which = filled.length === 1 ? "the receipt" : `receipt ${index + 1}`;
          if (!draft.vendor.trim()) {
            throw new Error(`Where was ${which} from?`);
          }
          if (parseMoney(draft.total) <= 0) {
            throw new Error(`Add the total for ${which}.`);
          }
          // Asked here rather than only at submit: the photo is added two steps
          // back, and finding out on the review screen means hunting for which
          // card is the one missing it.
          if (!missingReceipt && draft.receipts.length === 0) {
            throw new Error(
              `Add a photo of ${which}, or tick "I don't have a receipt" so the board can decide.`
            );
          }
        });
        if (!purpose.trim()) throw new Error("Say what this was spent on.");
        if (isGeneral && !eventLabel.trim()) {
          throw new Error("Say what this general expense was for.");
        }
      }
      await save();
      setStep(next);
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't save your request."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    setBusy(true);
    try {
      const id = await save();
      await submitReimbursement(id);
      router.push(`/reimbursements/${id}`);
      router.refresh();
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't submit your request."));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <StepIndicator step={step} />

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          {!lockedEventPlanId && (
            <div className="space-y-2">
              <Label htmlFor="event-plan">What was this for?</Label>
              <Select
                value={eventPlanId ?? (canSubmitGeneral ? GENERAL_OPTION : "")}
                onValueChange={(value) =>
                  setEventPlanId(value === GENERAL_OPTION ? null : value)
                }
              >
                <SelectTrigger id="event-plan">
                  <SelectValue placeholder="Pick the event" />
                </SelectTrigger>
                <SelectContent>
                  {eventPlanOptions.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.title}
                    </SelectItem>
                  ))}
                  {canSubmitGeneral && (
                    <SelectItem value={GENERAL_OPTION}>
                      General (non-event) expense
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {isGeneral && canSubmitGeneral && (
                <Input
                  value={eventLabel}
                  onChange={(e) => setEventLabel(e.target.value)}
                  placeholder="What it was for — e.g. annual insurance premium"
                />
              )}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label>Receipts</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Add every receipt for this one event — they&apos;re paid on a
                single check, so the treasurer files one form instead of three.
                Spending for a different event goes on its own request.
              </p>
            </div>

            {drafts.map((draft, index) => (
              <div
                key={draft.key}
                className="space-y-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">
                    {draft.vendor.trim() || `Receipt ${index + 1}`}
                  </p>
                  {(drafts.length > 1 || draft.receipts.length > 0) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDraft(draft.key)}
                      disabled={busy}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Photograph the whole receipt. If it is long, take it in parts —
                  every photo here is the same receipt.
                </p>
                <ReceiptUploader
                  receipts={draft.receipts}
                  onChange={(next) => handleReceiptsChange(draft.key, next)}
                  ensureRequestId={ensureRequestId}
                  ensureExpenseId={() => ensureExpenseId(draft.key)}
                  disabled={missingReceipt}
                />
                {draft.extracting && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading the receipt — you&apos;ll get to check everything on
                    the next step.
                  </p>
                )}
                {draft.extractionFailed && (
                  <p className="text-sm text-muted-foreground">
                    Couldn&apos;t read that one automatically — no problem, just
                    type the details on the next step.
                  </p>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={addDraft}
              disabled={busy || missingReceipt}
              className="w-full"
            >
              <Plus className="h-4 w-4" />
              Add another receipt
            </Button>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3">
            <input
              type="checkbox"
              checked={missingReceipt}
              onChange={(e) => setMissingReceipt(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">
              <span className="font-medium">I don&apos;t have a receipt</span>
              <span className="mt-1 block text-muted-foreground">
                {MISSING_RECEIPT_EXPLANATION}
              </span>
            </span>
          </label>

          <div className="flex justify-end">
            <Button onClick={() => goToStep(2)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          {policy.taxGuidanceNote && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{policy.taxGuidanceNote}</span>
            </div>
          )}

          {drafts.some((draft) => draft.uncertain.size > 0) && (
            <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The marked fields were hard to read off the receipt. Check them
              against the paper before you continue.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="purpose">What it was for</Label>
            <Textarea
              id="purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={2}
              placeholder="Paper goods and drinks for the 3rd grade party"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payee">Make the check out to</Label>
              <Input
                id="payee"
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-category">Budget line (optional)</Label>
              <Select
                value={budgetCategoryId ?? ""}
                onValueChange={(value) => setBudgetCategoryId(value || null)}
              >
                <SelectTrigger id="budget-category">
                  <SelectValue placeholder="The treasurer can set this" />
                </SelectTrigger>
                <SelectContent>
                  {budgetCategoryOptions.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {drafts.map((draft, index) => (
            <ReceiptFields
              key={draft.key}
              draft={draft}
              index={index}
              count={drafts.length}
              onChange={(patch) => patchDraft(draft.key, patch)}
              onRemove={drafts.length > 1 ? () => removeDraft(draft.key) : undefined}
            />
          ))}

          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={addDraft} disabled={busy}>
              <Plus className="h-4 w-4" />
              Add another receipt
            </Button>
            {drafts.length > 1 && (
              <p className="text-sm">
                <span className="text-muted-foreground">Total requested </span>
                <span className="font-medium">{formatCurrency(requestTotal)}</span>
              </p>
            )}
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => goToStep(1)} disabled={busy}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={() => goToStep(3)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="flex items-center gap-2 font-medium">
              <Receipt className="h-4 w-4" />
              What you&apos;re submitting
            </h3>
            <dl className="mt-3 space-y-1.5 text-sm">
              <SummaryRow label="Payee" value={payeeName} />
              <SummaryRow label="For" value={purpose} />
            </dl>

            <ul className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
              {drafts.filter(hasContent).map((draft, index) => (
                <li key={draft.key} className="flex justify-between gap-4">
                  <span>
                    <span className="font-medium">
                      {draft.vendor.trim() || `Receipt ${index + 1}`}
                    </span>
                    <span className="block text-muted-foreground">
                      {draft.purchaseDate} ·{" "}
                      {draft.receipts.length === 0
                        ? "no photo"
                        : `${draft.receipts.length} photo${draft.receipts.length === 1 ? "" : "s"}`}
                      {parseMoney(draft.salesTax) > 0 &&
                        ` · ${formatCurrency(parseMoney(draft.salesTax))} tax`}
                    </span>
                  </span>
                  <span className="font-medium">
                    {formatCurrency(parseMoney(draft.total))}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex justify-between gap-4 border-t border-border pt-3 text-sm font-medium">
              <span>One check for</span>
              <span>{formatCurrency(requestTotal)}</span>
            </div>

            {missingReceipt && (
              <p className="mt-3 text-sm text-muted-foreground">
                No receipt — this one goes to the board to decide.
              </p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3">
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="text-sm">{PERSONAL_FUNDS_ATTESTATION}</span>
          </label>

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => goToStep(2)} disabled={busy}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={busy || !attested}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit for approval
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function blankDraft(key: string, today: string): ReceiptDraft {
  return {
    key,
    id: null,
    vendor: "",
    purchaseDate: today,
    subtotal: "",
    salesTax: "",
    total: "",
    items: [],
    receipts: [],
    uncertain: new Set(),
    extracted: false,
    extracting: false,
    extractionFailed: false,
  };
}

/** Has anyone put anything into this card, or is it just an empty slot? */
function hasContent(draft: ReceiptDraft): boolean {
  return (
    draft.receipts.length > 0 ||
    !!draft.vendor.trim() ||
    parseMoney(draft.total) > 0 ||
    draft.items.some((item) => item.description.trim())
  );
}

/** What one receipt says: the fields, its itemization, and its own totals. */
function ReceiptFields({
  draft,
  index,
  count,
  onChange,
  onRemove,
}: {
  draft: ReceiptDraft;
  index: number;
  count: number;
  onChange: (patch: Partial<ReceiptDraft>) => void;
  onRemove?: () => void;
}) {
  const totalsDisagree =
    !!draft.total &&
    !!draft.subtotal &&
    !moneyEquals(
      parseMoney(draft.subtotal) + parseMoney(draft.salesTax),
      parseMoney(draft.total)
    );

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      {count > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">Receipt {index + 1}</p>
          {onRemove && (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`vendor-${draft.key}`}>Vendor</Label>
          <Input
            id={`vendor-${draft.key}`}
            value={draft.vendor}
            onChange={(e) => onChange({ vendor: e.target.value })}
            placeholder="Where you bought it"
            className={uncertainClass(draft.uncertain, "vendor")}
          />
          <UncertainNote uncertain={draft.uncertain} field="vendor" />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`purchase-date-${draft.key}`}>Purchase date</Label>
          <Input
            id={`purchase-date-${draft.key}`}
            type="date"
            value={draft.purchaseDate}
            onChange={(e) => onChange({ purchaseDate: e.target.value })}
            className={uncertainClass(draft.uncertain, "purchaseDate")}
          />
          <UncertainNote uncertain={draft.uncertain} field="purchaseDate" />
        </div>
      </div>

      <ItemsEditor
        items={draft.items}
        onChange={(items) => onChange({ items })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MoneyField
          id={`subtotal-${draft.key}`}
          label="Subtotal (before tax)"
          value={draft.subtotal}
          onChange={(subtotal) => onChange({ subtotal })}
          uncertain={draft.uncertain.has("subtotal")}
        />
        <MoneyField
          id={`sales-tax-${draft.key}`}
          label="Sales tax"
          value={draft.salesTax}
          onChange={(salesTax) => onChange({ salesTax })}
          uncertain={draft.uncertain.has("salesTax")}
        />
        <MoneyField
          id={`total-${draft.key}`}
          label="Total paid"
          value={draft.total}
          onChange={(total) => onChange({ total })}
          uncertain={draft.uncertain.has("total")}
        />
      </div>

      {totalsDisagree && (
        <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Subtotal plus tax doesn&apos;t equal the total. Enter what the receipt
          says — an officer will look at it either way.
        </p>
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Receipts", "Details", "Submit"];
  return (
    <ol className="flex items-center gap-2 text-sm">
      {labels.map((label, index) => {
        const number = (index + 1) as Step;
        const done = number < step;
        const active = number === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                active
                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
                  : done
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-success text-xs font-medium text-success-foreground"
                    : "flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
              }
            >
              {number}
            </span>
            <span
              className={
                active ? "font-medium" : "hidden text-muted-foreground sm:inline"
              }
            >
              {label}
            </span>
            {number < 3 && <span className="text-muted-foreground">/</span>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A field the AI wasn't sure it read correctly, marked so the eye goes there
 * first. Deliberately a ring and a line of text rather than a block on
 * continuing — the submitter is holding the receipt, and they are the authority.
 */
const UNCERTAIN_RING =
  "border-amber-500 focus:ring-amber-500 dark:border-amber-400";

function uncertainClass(
  uncertain: Set<ExtractableField>,
  field: ExtractableField
): string | undefined {
  return uncertain.has(field) ? UNCERTAIN_RING : undefined;
}

function UncertainNote({
  uncertain,
  field,
}: {
  uncertain: Set<ExtractableField>;
  field: ExtractableField;
}) {
  if (!uncertain.has(field)) return null;
  return (
    <p className="text-xs text-amber-700 dark:text-amber-300">
      Hard to read — please check.
    </p>
  );
}

function MoneyField({
  id,
  label,
  value,
  onChange,
  uncertain = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  uncertain?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        // `inputMode` rather than `type="number"`: a numeric keypad without the
        // scroll-wheel and spinner behaviour that makes an amount easy to
        // change by accident on a phone.
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className={uncertain ? UNCERTAIN_RING : undefined}
      />
      {uncertain && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Hard to read — please check.
        </p>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value || "—"}</dd>
    </div>
  );
}

/**
 * Line items on one receipt. Optional — the receipt total is what the check is
 * written from — but the IRS wants itemized substantiation, so anyone who has
 * the patience to type them gets somewhere to put them, filed under the receipt
 * they were read off rather than in one undifferentiated list.
 */
function ItemsEditor({
  items,
  onChange,
}: {
  items: ReimbursementItemInput[];
  onChange: (items: ReimbursementItemInput[]) => void;
}) {
  function update(index: number, patch: Partial<ReimbursementItemInput>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="space-y-2">
      <Label>Line items (optional)</Label>
      {items.map((item, index) => (
        <div key={index} className="flex gap-2">
          <Input
            value={item.description}
            onChange={(e) => update(index, { description: e.target.value })}
            placeholder="What it was"
            className="flex-1"
          />
          <Input
            inputMode="numeric"
            value={String(item.quantity)}
            onChange={(e) =>
              update(index, {
                quantity: Math.max(1, Number.parseInt(e.target.value, 10) || 1),
              })
            }
            className="w-16"
            aria-label="Quantity"
          />
          <Input
            inputMode="decimal"
            value={item.amount}
            onChange={(e) => update(index, { amount: e.target.value })}
            placeholder="0.00"
            className="w-24"
            aria-label="Amount"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            aria-label="Remove line"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...items, { description: "", quantity: 1, amount: "" }])
        }
      >
        <Plus className="h-4 w-4" />
        Add a line
      </Button>
    </div>
  );
}
