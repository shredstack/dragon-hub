"use client";

import { createContext, useContext, useState } from "react";
import { FileText } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { formatDateOnly } from "@/lib/date-only";
import { parseMoney } from "@/lib/reimbursements-shared";
import type { ReceiptSheet } from "@/lib/reimbursement-receipt-sheets";

/**
 * Whether the receipt pages print with the form.
 *
 * They do by default — a check request without its substantiation is half a
 * document, and the treasurer printing it is about to staple something behind
 * it either way. The choice exists for the reprint: someone who only needs a
 * fresh signature page shouldn't spend eleven sheets of paper on it.
 *
 * It is deliberately *not* remembered between visits. Leaving receipts out is
 * the unusual case, and a remembered "off" would quietly print an unsupported
 * form months later.
 */
const ReceiptPrintContext = createContext<{
  include: boolean;
  setInclude: (include: boolean) => void;
} | null>(null);

export function ReceiptPrintProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [include, setInclude] = useState(true);
  return (
    <ReceiptPrintContext.Provider value={{ include, setInclude }}>
      {children}
    </ReceiptPrintContext.Provider>
  );
}

function useReceiptPrint() {
  const context = useContext(ReceiptPrintContext);
  if (!context) {
    throw new Error("Receipt print controls must sit inside the provider.");
  }
  return context;
}

/** The checkbox beside the Print button. Renders nothing with no receipts. */
export function ReceiptPrintToggle({ count }: { count: number }) {
  const { include, setInclude } = useReceiptPrint();
  if (count === 0) return null;
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm print:hidden">
      <input
        type="checkbox"
        checked={include}
        onChange={(event) => setInclude(event.target.checked)}
        className="border-input accent-dragon-blue-500 h-4 w-4 rounded"
      />
      <span>
        Include {count === 1 ? "the receipt" : `all ${count} receipts`}
      </span>
    </label>
  );
}

/**
 * The receipt pages themselves: one page per photo, in the order the form's
 * table lists them, each one starting a fresh sheet.
 *
 * **Everything here prints in black and white** (`print:grayscale`). A receipt
 * is read for its vendor, date and totals, never for its colour, and a PTA is
 * printing these on a school office printer whose colour cartridge is somebody's
 * personal expense. The screen keeps its colour, because the reader checking the
 * photo before printing is doing a different job.
 *
 * The grayscale filter is on each sheet rather than on the page as a whole, on
 * purpose: a `filter` spanning a page break is where browsers' pagination goes
 * wrong, and a sheet is exactly one page.
 */
export function ReceiptPrintSheets({
  sheets,
  requestLabel,
}: {
  sheets: ReceiptSheet[];
  requestLabel: string;
}) {
  const { include } = useReceiptPrint();
  if (sheets.length === 0 || !include) return null;

  return (
    <section className="mt-8 space-y-6 print:mt-0 print:space-y-0">
      <p className="text-muted-foreground text-sm print:hidden">
        {sheets.length === 1
          ? "One receipt page prints behind the form, in black and white."
          : `${sheets.length} receipt pages print behind the form, in the order the form lists them and in black and white.`}
      </p>
      {sheets.map((sheet) => (
        <figure
          key={sheet.id}
          className="border-border bg-card break-before-page break-inside-avoid rounded-lg border p-4 print:rounded-none print:border-0 print:bg-transparent print:p-0 print:text-black print:grayscale"
        >
          <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-current pb-2">
            <span className="text-sm font-semibold">
              {sheet.receiptNumber === null
                ? "Receipt photo"
                : `Receipt ${sheet.receiptNumber} of ${sheet.receiptCount}`}
              {sheet.photoCount > 1 &&
                ` · photo ${sheet.photoNumber} of ${sheet.photoCount}`}
            </span>
            <span className="text-xs">{sheetMeta(sheet)}</span>
            <span className="w-full text-xs">{requestLabel}</span>
          </figcaption>
          <ReceiptSheetImage sheet={sheet} />
        </figure>
      ))}
    </section>
  );
}

/**
 * The clause on the form's footer that says the photographs are behind it.
 *
 * A client component for one sentence, because the sentence has to be true:
 * with the receipts switched off the printout is a form on its own, and a
 * footer promising pages that aren't there sends a treasurer looking for them.
 */
export function ReceiptPrintFootnote({ count }: { count: number }) {
  const { include } = useReceiptPrint();
  if (count === 0 || !include) return null;
  return (
    <>
      {" "}
      {count === 1
        ? "A photograph of the receipt follows this page."
        : "Photographs of the receipts follow this page, in the same order."}
    </>
  );
}

function sheetMeta(sheet: ReceiptSheet): string {
  return [
    sheet.vendor,
    sheet.purchaseDate ? formatDateOnly(sheet.purchaseDate) : null,
    sheet.totalAmount ? formatCurrency(parseMoney(sheet.totalAmount)) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The photo, or an honest note in its place.
 *
 * A PDF can't be drawn into a page the browser is printing, and a phone photo
 * saved as HEIC renders in Safari and nowhere else — the uploader accepts both.
 * Either way the fix is the same and the page has to say so, because a silently
 * blank sheet in a binder reads as "no receipt exists".
 */
function ReceiptSheetImage({ sheet }: { sheet: ReceiptSheet }) {
  const [failed, setFailed] = useState(false);

  if (sheet.isPdf || failed) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-current p-8 text-center text-sm">
        <FileText className="h-6 w-6" />
        <p className="font-medium break-all">{sheet.fileName}</p>
        <p>
          {sheet.isPdf
            ? "This receipt is a PDF and can't print with the form."
            : "This photo can't be shown here — some phone photo formats only open on the device that took them."}{" "}
          Open it from the request in DragonHub, print it, and file it in this
          spot.
        </p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sheet.blobUrl}
      alt={sheet.fileName}
      // Eager, and never lazy: a print dialog opened before the image has
      // loaded prints the empty space where it would have been.
      loading="eager"
      onError={() => setFailed(true)}
      className="mx-auto max-h-[70vh] w-auto max-w-full object-contain print:max-h-[8.5in]"
    />
  );
}
