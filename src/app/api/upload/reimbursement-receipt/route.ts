import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  reimbursementExpenses,
  reimbursementReceipts,
  reimbursementRequests,
  spendingCardRequests,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isEditableReimbursementStatus } from "@/lib/reimbursements-shared";

/**
 * Receipt upload, cloned from the meeting-notes-image route.
 *
 * Two things differ. PDFs are accepted as well as photos, because half of what
 * gets reimbursed arrives as an emailed invoice rather than a till roll. And
 * the authorization is the *request's* rather than a plan's: only the submitter
 * may attach a receipt, and only while the request is still theirs to edit —
 * a receipt appearing on a request an officer has already approved would change
 * what they approved.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const requestId = (formData.get("requestId") as string) || null;
    const spendingCardRequestId =
      (formData.get("spendingCardRequestId") as string) || null;
    /**
     * Which of the request's receipts this image is a picture of. Required for
     * a check request — a long till roll is several images of one receipt, and
     * an image that named no receipt would be money nobody claimed. A spending
     * card has no per-receipt claim, so it sends none.
     */
    const expenseId = (formData.get("expenseId") as string) || null;

    // Exactly one owner, matching the table's own check constraint.
    if (!file || (!requestId && !spendingCardRequestId)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (requestId && spendingCardRequestId) {
      return NextResponse.json(
        { error: "A receipt belongs to one request, not both" },
        { status: 400 }
      );
    }

    // Who owns the thing being substantiated, and whether it is still open to
    // receipts. A check request is open while its submitter may still edit it;
    // a spending card is open while it is out being spent.
    let schoolId: string;
    if (requestId) {
      const target = await db.query.reimbursementRequests.findFirst({
        where: eq(reimbursementRequests.id, requestId),
        columns: { id: true, schoolId: true, submittedBy: true, status: true },
      });
      if (!target) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }
      if (target.submittedBy !== session.user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      if (!isEditableReimbursementStatus(target.status)) {
        return NextResponse.json(
          {
            error:
              "This request has been submitted — ask an officer to send it back before changing its receipts.",
          },
          { status: 409 }
        );
      }
      // The receipt has to be one of *this* request's, or an id from the client
      // would file an image against somebody else's claim.
      if (!expenseId) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }
      const expense = await db.query.reimbursementExpenses.findFirst({
        where: eq(reimbursementExpenses.id, expenseId),
        columns: { id: true, requestId: true },
      });
      if (!expense || expense.requestId !== requestId) {
        return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
      }
      schoolId = target.schoolId;
    } else {
      const card = await db.query.spendingCardRequests.findFirst({
        where: eq(spendingCardRequests.id, spendingCardRequestId!),
        columns: { id: true, schoolId: true, requestedBy: true, status: true },
      });
      if (!card) {
        return NextResponse.json(
          { error: "Spending card request not found" },
          { status: 404 }
        );
      }
      if (card.requestedBy !== session.user.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
      if (card.status !== "issued") {
        return NextResponse.json(
          {
            error:
              "Receipts can only be added while the card is out. Ask the treasurer to reopen it if something is missing.",
          },
          { status: 409 }
        );
      }
      schoolId = card.schoolId;
    }

    // Photos from a phone, plus PDF for an emailed invoice.
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Please upload a photo (JPEG, PNG, WebP, HEIC) or a PDF." },
        { status: 400 }
      );
    }

    // Max 10MB — phone photos can be large.
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const owner = requestId ?? spendingCardRequestId;
    const blob = await put(
      `reimbursement-receipts/${schoolId}/${owner}/${Date.now()}-${file.name}`,
      file,
      { access: "public", addRandomSuffix: true }
    );

    const [receipt] = await db
      .insert(reimbursementReceipts)
      .values({
        requestId,
        spendingCardRequestId,
        expenseId: requestId ? expenseId : null,
        blobUrl: blob.url,
        fileName: file.name,
        contentType: file.type,
        uploadedBy: session.user.id,
      })
      .returning();

    return NextResponse.json({
      receiptId: receipt.id,
      url: blob.url,
      fileName: file.name,
      contentType: file.type,
    });
  } catch (error) {
    console.error("Reimbursement receipt upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload receipt" },
      { status: 500 }
    );
  }
}
