import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentSchoolId } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { schools } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getBoardPositionLabels } from "@/lib/board-positions";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { getReimbursement } from "@/actions/reimbursements";
import { positionLabel } from "@/lib/board-positions-shared";
import {
  PERSONAL_FUNDS_ATTESTATION,
  parseMoney,
} from "@/lib/reimbursements-shared";
import { formatCurrency } from "@/lib/utils";
import { formatDateOnly } from "@/lib/date-only";
import { formatDateInTimeZone } from "@/lib/time-zone";
import { privateMetadata } from "@/lib/page-metadata";
import { isNativeShell } from "@/lib/native-shell";
import { PrintButton } from "@/components/ui/print-button";
import { PrintFit } from "@/components/ui/print-fit";
import { buildReceiptSheets } from "@/lib/reimbursement-receipt-sheets";
import {
  ReceiptPrintFootnote,
  ReceiptPrintProvider,
  ReceiptPrintSheets,
  ReceiptPrintToggle,
} from "@/components/reimbursements/receipt-print-sheets";
import { ArrowLeft } from "lucide-react";

export const metadata = privateMetadata("Check request form");

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * The paper the binder still needs.
 *
 * DragonHub is the system of record for the request, the review and the data,
 * but auditors and banks live in paper, so this is the traditional form filled
 * in from what the app already knows. The digital approvals print as stamps —
 * naming who signed, as what, and when — and the physical signature lines print
 * underneath them, because a stamp is evidence of the decision and a signature
 * is what the bank's own rules ask for. Neither replaces the other.
 *
 * Print CSS only, no PDF library: the page is a page, and the browser's own
 * print dialog produces the PDF. Role labels come from the school's
 * `board_positions`, so a school that renamed "Treasurer" prints its own word.
 *
 * **The form is one sheet.** It is laid out tightly enough that the ordinary
 * request fits, and wrapped in `PrintFit` for the ones that don't — a form
 * whose signature block is stranded on a second sheet is the form half of
 * which goes missing between the binder and the bank. The receipt pages behind
 * it are the exception and stay one to a page, because they are photographs.
 *
 * **The receipts print behind it by default**, one page each, in the order the
 * form's table numbers them — the substantiation is the other half of what the
 * binder needs, and a printout that stops at the form leaves the treasurer to
 * fetch it a second way. They print in black and white; see
 * `ReceiptPrintSheets`.
 */
export default async function ReimbursementPrintPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const request = await getReimbursement(id);
  if (!request) notFound();

  const [labels, timeZone, school, nativeShell] = await Promise.all([
    getBoardPositionLabels(schoolId),
    getSchoolTimeZone(schoolId),
    db.query.schools.findFirst({
      where: eq(schools.id, schoolId),
      columns: { name: true },
    }),
    isNativeShell(),
  ]);

  const sheets = buildReceiptSheets(request.expenses, request.receipts);

  return (
    <ReceiptPrintProvider>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href={`/reimbursements/${id}`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to the request
          </Link>
          {/* The button and the WebView's silence — see `PrintButton`. In the
            store builds there is no print dialog to open and no ⌘P to press,
            so say where the form can be printed instead of offering a control
            that would do nothing. */}
          {nativeShell ? (
            <p className="text-muted-foreground text-sm">
              Open DragonHub in a web browser to print this form.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-muted-foreground hidden text-sm sm:block">
                Choose &ldquo;Save as PDF&rdquo; in the dialog to keep a copy.
              </p>
              <ReceiptPrintToggle count={sheets.length} />
              <PrintButton />
            </div>
          )}
        </div>

        {/* The card is the screen's frame around the paper and nothing more, so
          it steps out of the way entirely when printing (`print:contents`) —
          leaving `PrintFit` measuring, and scaling, exactly the form. */}
        <div className="border-border bg-card rounded-lg border p-4 sm:p-6 print:contents">
          <PrintFit>
            <article className="text-sm print:text-black">
              <header className="border-b-2 border-current pb-2">
                <h1 className="text-xl font-bold">Request for Reimbursement</h1>
                <p>
                  {school?.name} PTA · {request.schoolYear}
                </p>
              </header>

              <section className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2.5">
                <PrintField label="Payable to" value={request.payeeName} />
                <PrintField
                  label="Submitted by"
                  value={request.submitterName}
                />
                <PrintField
                  label="Event / purpose of expense"
                  value={
                    request.eventPlanTitle ||
                    request.eventLabel ||
                    "General (non-event)"
                  }
                />
                <PrintField
                  label="Budget line"
                  value={
                    request.budgetCategoryName ?? "________________________"
                  }
                />
                <PrintField
                  label={request.expenses.length > 1 ? "Vendors" : "Vendor"}
                  value={request.vendor}
                />
                <PrintField
                  label={
                    request.expenses.length > 1
                      ? "Earliest purchase"
                      : "Date of purchase"
                  }
                  value={formatDateOnly(request.purchaseDate)}
                />
                <div className="col-span-2">
                  <PrintField label="What it was for" value={request.purpose} />
                </div>
              </section>

              {/*
                One check, one form, one page per request — with the receipts
                listed on it. This is the whole point of letting several
                receipts ride on one request: the binder gets a single sheet
                with the slips stapled behind it in the order they are listed,
                instead of three near-identical forms for one afternoon's
                errands.
              */}
              {request.expenses.length > 0 && (
                <section className="mt-4">
                  <h2 className="font-semibold">
                    {request.expenses.length > 1
                      ? `Receipts (${request.expenses.length})`
                      : "Receipt"}
                  </h2>
                  <table className="mt-1.5 w-full">
                    <thead>
                      <tr className="border-b border-current text-left">
                        <th className="py-0.5 font-medium">#</th>
                        <th className="py-0.5 font-medium">Vendor</th>
                        <th className="py-0.5 font-medium">Date</th>
                        <th className="py-0.5 text-right font-medium">
                          Subtotal
                        </th>
                        <th className="py-0.5 text-right font-medium">Tax</th>
                        <th className="py-0.5 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {request.expenses.map((expense, index) => (
                        <tr key={expense.id} className="align-top">
                          <td className="py-0.5">{index + 1}</td>
                          <td className="py-0.5">
                            {expense.vendor || "—"}
                            {expense.items.length > 0 && (
                              <ul className="text-xs">
                                {expense.items.map((item) => (
                                  <li key={item.id}>
                                    {item.quantity > 1 && `${item.quantity}× `}
                                    {item.description} —{" "}
                                    {formatCurrency(parseMoney(item.amount))}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td className="py-0.5">
                            {formatDateOnly(expense.purchaseDate)}
                          </td>
                          <td className="py-0.5 text-right">
                            {formatCurrency(parseMoney(expense.subtotalAmount))}
                          </td>
                          <td className="py-0.5 text-right">
                            {formatCurrency(parseMoney(expense.salesTaxAmount))}
                          </td>
                          <td className="py-0.5 text-right">
                            {formatCurrency(parseMoney(expense.totalAmount))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}

              <section className="mt-4 ml-auto w-64 space-y-0.5">
                <PrintTotal
                  label="Subtotal"
                  value={formatCurrency(parseMoney(request.subtotalAmount))}
                />
                <PrintTotal
                  label="Sales tax"
                  value={formatCurrency(parseMoney(request.salesTaxAmount))}
                />
                <PrintTotal
                  label="Total requested"
                  value={formatCurrency(parseMoney(request.totalAmount))}
                  bold
                />
              </section>

              <section className="mt-4 border-t border-current pt-2">
                <p>
                  <span className="font-semibold">Attestation: </span>
                  {request.attestedPersonalFunds ? "✓ " : "☐ "}
                  {PERSONAL_FUNDS_ATTESTATION}
                </p>
                {request.missingReceipt && (
                  <p className="mt-1.5">
                    <span className="font-semibold">No receipt. </span>
                    {request.boardDecisionNote ||
                      "Awaiting the board's decision on how to handle this."}
                  </p>
                )}
                {request.authorizationNote && (
                  <p className="mt-1.5">
                    <span className="font-semibold">Board authorization: </span>
                    {request.authorizationNote}
                    {request.authorizationMinutesDate &&
                      ` — minutes of ${formatDateOnly(request.authorizationMinutesDate)}`}
                  </p>
                )}
              </section>

              {/* Digital stamps above, physical lines below — see the note at
                the top of this file for why both.

                The stamp is printed only when there *is* one. A line reading
                "not approved as of today" above an empty rule tells the reader
                nothing the empty rule doesn't, and on a form that exists to be
                signed it reads as an instruction not to sign. The blank line is
                held open so the two blocks in a row keep their rules level.

                The stamps name the person, the position and the date and stop
                there: the form is a paper record for a binder and a bank, and
                which software recorded the approval is DragonHub's business,
                not the auditor's.

                The signature blocks sit two to a row the way a paper form lays
                them out, rather than stacked down the page: a school with a
                treasurer, a president and a principal to sign spent a third of
                the sheet on three half-empty rows, and half of that was what
                pushed the form onto a second page. A half-width rule is still
                three inches of pen. */}
              <section className="mt-5 break-inside-avoid border-t-2 border-current pt-3">
                <h2 className="font-semibold">Officer authorization</h2>
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-6">
                  {request.requiredApproverRoles.map((slug) => {
                    const signed = request.approvals.find(
                      (a) => a.role === slug
                    );
                    return (
                      <div key={slug}>
                        <p className="min-h-4 text-xs">
                          {signed
                            ? `✓ Approved online by ${signed.approverName}, ${positionLabel(labels, slug)} — ${formatDateInTimeZone(signed.createdAt, timeZone)}`
                            : ""}
                        </p>
                        <div className="mt-5 flex items-end gap-4">
                          <span className="flex-1 border-b border-current" />
                          <span className="w-24 border-b border-current" />
                        </div>
                        <div className="flex gap-4 text-xs">
                          <span className="flex-1">
                            {positionLabel(labels, slug)} signature
                          </span>
                          <span className="w-24">Date</span>
                        </div>
                      </div>
                    );
                  })}

                  {/* The principal acknowledges; they don't approve. That
                    belongs under the rule with the label, where it is read as
                    part of what is being signed, rather than above it as a
                    caption competing for the same space. */}
                  <div>
                    <p className="min-h-4 text-xs">
                      {request.principalAcknowledged
                        ? "✓ Acknowledged online."
                        : ""}
                    </p>
                    <div className="mt-5 flex items-end gap-4">
                      <span className="flex-1 border-b border-current" />
                      <span className="w-24 border-b border-current" />
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="flex-1">
                        Principal signature — acknowledgment only, not an
                        approval
                      </span>
                      <span className="w-24">Date</span>
                    </div>
                  </div>
                </div>
              </section>

              {/*
                The treasurer's box, filled in with a pen after the check is
                written. The amounts are deliberately blank lines rather than
                the requested totals reprinted: what was *paid* is not always
                what was asked for — a line disallowed at review, tax the PTA
                doesn't reimburse, a rounded check — and a pre-printed number is
                one the treasurer would have to strike through. Check number and
                date paid print what DragonHub knows if it already knows it,
                because those two are recorded in the app when a request is
                marked paid; the amounts have no such columns and never print a
                value.
              */}
              <section className="mt-5 break-inside-avoid border border-current p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-current pb-1.5">
                  <h2 className="font-semibold">Treasurer use only</h2>
                  <p className="text-xs">Complete after writing the check.</p>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-x-6 gap-y-4">
                  <PrintWriteLine
                    label="Check number"
                    value={request.checkNumber}
                  />
                  <PrintWriteLine
                    label="Date paid"
                    value={
                      request.paidAt
                        ? formatDateInTimeZone(request.paidAt, timeZone)
                        : null
                    }
                  />
                  <PrintWriteLine label="Pre-tax amount" prefix="$" />
                  <PrintWriteLine label="Sales tax" prefix="$" />
                  <div className="col-span-4">
                    <PrintWriteLine label="Total of check" prefix="$" bold />
                  </div>
                </div>
              </section>

              <footer className="mt-4 border-t border-current pt-2 text-xs">
                Attach{" "}
                {request.expenses.length > 1
                  ? `all ${request.expenses.length} original receipts, in the order listed above,`
                  : "the original receipt"}{" "}
                to this form and file it with the disbursements in check-number
                order.
                <ReceiptPrintFootnote count={sheets.length} /> Request{" "}
                {request.id.slice(0, 8)}.
              </footer>
            </article>
          </PrintFit>
        </div>

        <ReceiptPrintSheets
          sheets={sheets}
          requestLabel={`Request ${request.id.slice(0, 8)} · ${request.payeeName}`}
        />
      </div>
    </ReceiptPrintProvider>
  );
}

function PrintField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs tracking-wide uppercase">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}

/**
 * A ruled line to write on, with the label underneath it the way a paper form
 * puts it — the pen needs the space above the label, not below it. A `value`
 * is printed on the line when the app already knows it; otherwise the line
 * stays empty and tall enough for handwriting.
 */
function PrintWriteLine({
  label,
  value = null,
  prefix,
  bold = false,
}: {
  label: string;
  value?: string | null;
  prefix?: string;
  bold?: boolean;
}) {
  return (
    <div>
      <div className="flex items-end gap-1 border-b border-current pb-1">
        {prefix && <span className="text-sm">{prefix}</span>}
        <span
          className={
            bold ? "min-h-6 flex-1 font-bold" : "min-h-6 flex-1 font-medium"
          }
        >
          {value}
        </span>
      </div>
      <p className="mt-1 text-xs tracking-wide uppercase">{label}</p>
    </div>
  );
}

function PrintTotal({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={
        bold
          ? "flex justify-between border-t border-current pt-1 font-bold"
          : "flex justify-between"
      }
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
