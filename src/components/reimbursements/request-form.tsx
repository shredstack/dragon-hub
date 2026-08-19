"use client";

import { useState } from "react";
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
  extractReceiptDetails,
  submitReimbursement,
  updateReimbursementDraft,
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

export interface RequestFormInitialValues {
  eventPlanId: string | null;
  eventLabel: string | null;
  payeeName: string;
  vendor: string;
  purchaseDate: string;
  purpose: string;
  budgetCategoryId: string | null;
  subtotalAmount: string;
  salesTaxAmount: string;
  totalAmount: string;
  missingReceipt: boolean;
  attestedPersonalFunds: boolean;
  items: ReimbursementItemInput[];
}

interface RequestFormProps {
  /** Set when resuming a draft or answering a request for changes. */
  requestId?: string | null;
  initial?: Partial<RequestFormInitialValues>;
  initialReceipts?: UploadedReceipt[];
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
 * The submission wizard: receipt → details → attest.
 *
 * Mobile-first because that is where it is used — someone standing beside their
 * car with a bag of paper plates and a phone. The three steps exist so that the
 * one thing that must not be put off (photographing the receipt) happens before
 * anything that can be typed later.
 *
 * The draft is created on the server as soon as there is something to attach to
 * it, and updated as each step is left, so a form abandoned at a traffic light
 * is still there afterwards.
 */
export function RequestForm({
  requestId: initialRequestId = null,
  initial,
  initialReceipts = [],
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

  const [receipts, setReceipts] = useState<UploadedReceipt[]>(initialReceipts);
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
  const [vendor, setVendor] = useState(initial?.vendor ?? "");
  const [purchaseDate, setPurchaseDate] = useState(
    initial?.purchaseDate || today
  );
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const [budgetCategoryId, setBudgetCategoryId] = useState<string | null>(
    initial?.budgetCategoryId ?? null
  );
  const [subtotal, setSubtotal] = useState(initial?.subtotalAmount ?? "");
  const [salesTax, setSalesTax] = useState(initial?.salesTaxAmount ?? "");
  const [total, setTotal] = useState(initial?.totalAmount ?? "");
  const [items, setItems] = useState<ReimbursementItemInput[]>(
    initial?.items ?? []
  );
  const [attested, setAttested] = useState(
    initial?.attestedPersonalFunds ?? false
  );

  // Extraction state. `uncertain` is what the model told us it wasn't sure of;
  // those fields get marked so the eye goes to them first. Nothing here changes
  // what is saved — every value is in an editable input either way.
  const [extracting, setExtracting] = useState(false);
  const [extractionFailed, setExtractionFailed] = useState(false);
  const [extracted, setExtracted] = useState(false);
  const [uncertain, setUncertain] = useState<Set<ExtractableField>>(new Set());

  const isGeneral = !eventPlanId;
  const totalsDisagree =
    !!total &&
    !!subtotal &&
    !moneyEquals(parseMoney(subtotal) + parseMoney(salesTax), parseMoney(total));

  function currentValues() {
    return {
      eventPlanId,
      eventLabel: isGeneral ? eventLabel : null,
      payeeName,
      vendor,
      purchaseDate,
      purpose,
      budgetCategoryId,
      subtotalAmount: subtotal,
      salesTaxAmount: salesTax,
      totalAmount: total,
      missingReceipt,
      attestedPersonalFunds: attested,
      items,
    };
  }

  /**
   * The request id, creating the draft if this is the first thing that needs
   * one. Everything downstream — the receipt upload route, every save — is
   * keyed on it.
   */
  async function ensureRequestId(): Promise<string> {
    if (requestId) return requestId;
    if (!eventPlanId && !canSubmitGeneral) {
      throw new Error(
        "Pick the event this spending was for before adding a receipt."
      );
    }
    const created = await createReimbursementDraft(currentValues());
    setRequestId(created.id);
    return created.id;
  }

  /**
   * A receipt arrived (or went away). The first one to arrive on an empty form
   * gets read by the AI and its values pre-filled.
   *
   * The emptiness test is the guard that matters: someone answering a request
   * for changes has already typed the truth into these fields, and an
   * extraction pass overwriting their corrections with a fresh guess is the
   * exact failure this feature must not have. Extraction pre-fills a blank
   * form; it never edits a filled one.
   */
  async function handleReceiptsChange(next: UploadedReceipt[]) {
    const added = next.find(
      (candidate) => !receipts.some((existing) => existing.id === candidate.id)
    );
    setReceipts(next);

    const formIsEmpty = !vendor.trim() && parseMoney(total) === 0;
    if (!added || extracted || !formIsEmpty) return;

    setExtracted(true);
    setExtracting(true);
    setExtractionFailed(false);
    try {
      const result = await extractReceiptDetails(added.id);
      // Null is the deliberate "we couldn't read it" answer, not an error: the
      // form simply stays blank, which is what it was a moment ago.
      if (!result) {
        setExtractionFailed(true);
        return;
      }
      if (result.vendor) setVendor(result.vendor);
      if (result.purchaseDate) setPurchaseDate(result.purchaseDate);
      if (result.subtotal) setSubtotal(result.subtotal);
      if (result.salesTax) setSalesTax(result.salesTax);
      if (result.total) setTotal(result.total);
      if (result.items.length > 0) setItems(result.items);
      setUncertain(new Set(result.uncertain as ExtractableField[]));
    } catch {
      setExtractionFailed(true);
    } finally {
      setExtracting(false);
    }
  }

  async function save(): Promise<string> {
    const id = await ensureRequestId();
    await updateReimbursementDraft(id, currentValues());
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
        if (receipts.length === 0 && !missingReceipt) {
          throw new Error(
            "Add the receipt, or tick \"I don't have a receipt\" so the board can decide."
          );
        }
      }
      if (next === 3) {
        if (!vendor.trim()) throw new Error("Where was the purchase made?");
        if (!purpose.trim()) throw new Error("Say what this was spent on.");
        if (parseMoney(total) <= 0) throw new Error("Add the receipt total.");
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

          <div className="space-y-2">
            <Label>Receipt</Label>
            <p className="text-sm text-muted-foreground">
              Photograph the whole receipt. If it is long, take it in parts —
              you can add as many as you need.
            </p>
            <ReceiptUploader
              receipts={receipts}
              onChange={handleReceiptsChange}
              ensureRequestId={ensureRequestId}
              disabled={missingReceipt}
            />
            {extracting && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading the receipt — you&apos;ll get to check everything on the
                next step.
              </p>
            )}
            {extractionFailed && (
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t read that one automatically — no problem, just
                type the details on the next step.
              </p>
            )}
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

          {uncertain.size > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              The marked fields were hard to read off the receipt. Check them
              against the paper before you continue.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor</Label>
              <Input
                id="vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Where you bought it"
                className={uncertainClass(uncertain, "vendor")}
              />
              <UncertainNote uncertain={uncertain} field="vendor" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-date">Purchase date</Label>
              <Input
                id="purchase-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className={uncertainClass(uncertain, "purchaseDate")}
              />
              <UncertainNote uncertain={uncertain} field="purchaseDate" />
            </div>
          </div>

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

          <ItemsEditor items={items} onChange={setItems} />

          <div className="grid gap-4 sm:grid-cols-3">
            <MoneyField
              id="subtotal"
              label="Subtotal (before tax)"
              value={subtotal}
              onChange={setSubtotal}
              uncertain={uncertain.has("subtotal")}
            />
            <MoneyField
              id="sales-tax"
              label="Sales tax"
              value={salesTax}
              onChange={setSalesTax}
              uncertain={uncertain.has("salesTax")}
            />
            <MoneyField
              id="total"
              label="Total paid"
              value={total}
              onChange={setTotal}
              uncertain={uncertain.has("total")}
            />
          </div>

          {totalsDisagree && (
            <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Subtotal plus tax doesn&apos;t equal the total. Enter what the
              receipt says — an officer will look at it either way.
            </p>
          )}

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
              <SummaryRow label="Vendor" value={vendor} />
              <SummaryRow label="Purchased" value={purchaseDate} />
              <SummaryRow label="For" value={purpose} />
              <SummaryRow
                label="Sales tax"
                value={formatCurrency(parseMoney(salesTax))}
              />
              <SummaryRow
                label="Total"
                value={formatCurrency(parseMoney(total))}
              />
              <SummaryRow
                label="Receipts"
                value={
                  missingReceipt
                    ? "None — going to the board"
                    : `${receipts.length} attached`
                }
              />
            </dl>
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

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Receipt", "Details", "Submit"];
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
 * Line items. Optional in v1 — the totals are what the check is written from —
 * but the IRS wants itemized substantiation, so anyone who has the patience to
 * type them gets somewhere to put them.
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
