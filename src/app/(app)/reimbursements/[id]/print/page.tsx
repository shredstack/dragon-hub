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
import { PERSONAL_FUNDS_ATTESTATION, parseMoney } from "@/lib/reimbursements-shared";
import { formatCurrency } from "@/lib/utils";
import { formatDateOnly } from "@/lib/date-only";
import { formatDateInTimeZone } from "@/lib/time-zone";
import { privateMetadata } from "@/lib/page-metadata";
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
 */
export default async function ReimbursementPrintPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const schoolId = await getCurrentSchoolId();
  if (!schoolId) return null;

  const request = await getReimbursement(id);
  if (!request) notFound();

  const [labels, timeZone, school] = await Promise.all([
    getBoardPositionLabels(schoolId),
    getSchoolTimeZone(schoolId),
    db.query.schools.findFirst({
      where: eq(schools.id, schoolId),
      columns: { name: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/reimbursements/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to the request
        </Link>
        <p className="text-sm text-muted-foreground">
          Use your browser&apos;s Print (⌘P) to print or save as PDF.
        </p>
      </div>

      <article className="rounded-lg border border-border bg-card p-8 text-sm print:rounded-none print:border-0 print:bg-transparent print:p-0 print:text-black">
        <header className="border-b-2 border-current pb-3">
          <h1 className="text-xl font-bold">Request for Reimbursement</h1>
          <p>
            {school?.name} PTA · {request.schoolYear}
          </p>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-3">
          <PrintField label="Payable to" value={request.payeeName} />
          <PrintField label="Submitted by" value={request.submitterName} />
          <PrintField
            label="Event / purpose of expense"
            value={request.eventPlanTitle || request.eventLabel || "General (non-event)"}
          />
          <PrintField
            label="Budget line"
            value={request.budgetCategoryName ?? "________________________"}
          />
          <PrintField label="Vendor" value={request.vendor} />
          <PrintField
            label="Date of purchase"
            value={formatDateOnly(request.purchaseDate)}
          />
          <div className="col-span-2">
            <PrintField label="What it was for" value={request.purpose} />
          </div>
        </section>

        {request.items.length > 0 && (
          <section className="mt-5">
            <h2 className="font-semibold">Itemization</h2>
            <table className="mt-2 w-full">
              <thead>
                <tr className="border-b border-current text-left">
                  <th className="py-1 font-medium">Item</th>
                  <th className="py-1 text-right font-medium">Qty</th>
                  <th className="py-1 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {request.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-1">{item.description}</td>
                    <td className="py-1 text-right">{item.quantity}</td>
                    <td className="py-1 text-right">
                      {formatCurrency(parseMoney(item.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="mt-5 ml-auto w-64 space-y-1">
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

        <section className="mt-5 border-t border-current pt-3">
          <p>
            <span className="font-semibold">Attestation: </span>
            {request.attestedPersonalFunds ? "✓ " : "☐ "}
            {PERSONAL_FUNDS_ATTESTATION}
          </p>
          {request.missingReceipt && (
            <p className="mt-2">
              <span className="font-semibold">No receipt. </span>
              {request.boardDecisionNote ||
                "Awaiting the board's decision on how to handle this."}
            </p>
          )}
          {request.authorizationNote && (
            <p className="mt-2">
              <span className="font-semibold">Board authorization: </span>
              {request.authorizationNote}
              {request.authorizationMinutesDate &&
                ` — minutes of ${formatDateOnly(request.authorizationMinutesDate)}`}
            </p>
          )}
        </section>

        {/* Digital stamps above, physical lines below — see the note at the
            top of this file for why both. */}
        <section className="mt-6 border-t-2 border-current pt-4">
          <h2 className="font-semibold">Officer authorization</h2>
          <div className="mt-4 space-y-8">
            {request.requiredApproverRoles.map((slug) => {
              const signed = request.approvals.find((a) => a.role === slug);
              return (
                <div key={slug}>
                  <p className="text-xs">
                    {signed
                      ? `Approved in DragonHub by ${signed.approverName} as ${positionLabel(labels, slug)} on ${formatDateInTimeZone(signed.createdAt, timeZone)}`
                      : `Not approved in DragonHub as of ${formatDateInTimeZone(new Date(), timeZone)}`}
                  </p>
                  <div className="mt-6 flex items-end gap-6">
                    <span className="flex-1 border-b border-current" />
                    <span className="w-32 border-b border-current" />
                  </div>
                  <div className="flex gap-6 text-xs">
                    <span className="flex-1">
                      {positionLabel(labels, slug)} signature
                    </span>
                    <span className="w-32">Date</span>
                  </div>
                </div>
              );
            })}

            <div>
              <p className="text-xs">
                {request.principalAcknowledged
                  ? "Recorded in DragonHub as acknowledged."
                  : "Acknowledgment only — not an approval."}
              </p>
              <div className="mt-6 flex items-end gap-6">
                <span className="flex-1 border-b border-current" />
                <span className="w-32 border-b border-current" />
              </div>
              <div className="flex gap-6 text-xs">
                <span className="flex-1">Principal signature</span>
                <span className="w-32">Date</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 border-t border-current pt-3">
          <h2 className="font-semibold">Treasurer use</h2>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3">
            <PrintField
              label="Check number"
              value={request.checkNumber ?? "________________"}
            />
            <PrintField
              label="Date paid"
              value={
                request.paidAt
                  ? formatDateInTimeZone(request.paidAt, timeZone)
                  : "________________"
              }
            />
          </div>
        </section>

        <footer className="mt-6 border-t border-current pt-3 text-xs">
          Attach the original receipt to this form and file it with the
          disbursements in check-number order. Request {request.id.slice(0, 8)}.
        </footer>
      </article>
    </div>
  );
}

function PrintField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide">{label}</p>
      <p className="font-medium">{value || "—"}</p>
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
