import type {
  ReimbursementExpenseView,
  ReimbursementReceiptView,
} from "@/actions/reimbursements";

/**
 * One printed page behind the check request: a picture of one receipt.
 *
 * The form lists the receipts in a numbered table and its footer tells the
 * treasurer to file them "in the order listed above", so the pages that follow
 * carry that same number. A receipt photographed in parts — the long till roll
 * — is several pages under one number, which is what `photoNumber` says.
 */
export interface ReceiptSheet {
  id: string;
  /**
   * Which row of the form's receipt table this is a picture of. Null only for
   * an image attached to the request without a receipt row of its own, which
   * the check-request flow doesn't produce but the table permits.
   */
  receiptNumber: number | null;
  receiptCount: number;
  photoNumber: number;
  photoCount: number;
  vendor: string;
  purchaseDate: string | null;
  totalAmount: string | null;
  blobUrl: string;
  fileName: string;
  /** A PDF can't be drawn into the page; the sheet says where to get it. */
  isPdf: boolean;
}

function isPdfReceipt(contentType: string, fileName: string): boolean {
  return (
    contentType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Flatten a request's receipts into the pages that print behind its form, in
 * the order the form lists them.
 *
 * Client-safe and pure: the print page builds the list on the server so the
 * header can say how many pages are coming, and the sheets themselves render
 * from the same array.
 */
export function buildReceiptSheets(
  expenses: ReimbursementExpenseView[],
  looseReceipts: ReimbursementReceiptView[] = []
): ReceiptSheet[] {
  const sheets: ReceiptSheet[] = [];

  expenses.forEach((expense, expenseIndex) => {
    expense.receipts.forEach((receipt, photoIndex) => {
      sheets.push({
        id: receipt.id,
        receiptNumber: expenseIndex + 1,
        receiptCount: expenses.length,
        photoNumber: photoIndex + 1,
        photoCount: expense.receipts.length,
        vendor: expense.vendor,
        purchaseDate: expense.purchaseDate,
        totalAmount: expense.totalAmount,
        blobUrl: receipt.blobUrl,
        fileName: receipt.fileName,
        isPdf: isPdfReceipt(receipt.contentType, receipt.fileName),
      });
    });
  });

  // An image that belongs to the request but to none of its receipts still has
  // to reach the binder — a substantiating photo silently left off the printout
  // is worse than one printed under a heading that can't name a vendor.
  const claimed = new Set(sheets.map((sheet) => sheet.id));
  const orphans = looseReceipts.filter((receipt) => !claimed.has(receipt.id));
  orphans.forEach((receipt, index) => {
    sheets.push({
      id: receipt.id,
      receiptNumber: null,
      receiptCount: expenses.length,
      photoNumber: index + 1,
      photoCount: orphans.length,
      vendor: "",
      purchaseDate: null,
      totalAmount: null,
      blobUrl: receipt.blobUrl,
      fileName: receipt.fileName,
      isPdf: isPdfReceipt(receipt.contentType, receipt.fileName),
    });
  });

  return sheets;
}
