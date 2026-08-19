"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { deleteReimbursementReceipt } from "@/actions/reimbursements";
import { actionErrorMessage } from "@/lib/action-error";

export interface UploadedReceipt {
  id: string;
  blobUrl: string;
  fileName: string;
  contentType: string;
}

interface ReceiptUploaderProps {
  receipts: UploadedReceipt[];
  onChange: (receipts: UploadedReceipt[]) => void;
  /**
   * Resolves the request these receipts belong to, creating the draft on first
   * use. A receipt row needs a request to hang off, and step one of the wizard
   * is the photograph — so the draft is created by the act of taking it rather
   * than by opening the page, which would litter the list with empty drafts
   * every time someone looked.
   */
  ensureRequestId: () => Promise<string>;
  /**
   * Which of the request's receipts these images are pictures of, created on
   * first use for the same reason the draft is: a photograph has to have
   * something to belong to. Check requests always pass it; a spending card has
   * no per-receipt claim and passes none.
   */
  ensureExpenseId?: () => Promise<string>;
  /**
   * Which side of `reimbursement_receipts` the id belongs to. A card's receipts
   * go through the identical pipeline — same route, same table, same blob
   * prefix — because the substantiation trail is identical and only the payment
   * instrument differs.
   */
  ownerField?: "requestId" | "spendingCardRequestId";
  /** Defaults to the check-request removal; cards pass their own. */
  onDeleteReceipt?: (receiptId: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * Receipt capture: several photos, or a PDF invoice.
 *
 * In the native shell the camera button opens the real action sheet
 * (`@capacitor/camera`) — the same path the profile picture takes, and what
 * exercises the Info.plist usage strings. On the web it falls through to a file
 * input with `capture="environment"`, which is what a phone browser needs to
 * open the back camera straight away. Receipts get photographed in the Costco
 * parking lot; the fewer taps between "I paid" and "it's filed", the more of
 * them actually get filed.
 */
export function ReceiptUploader({
  receipts,
  onChange,
  ensureRequestId,
  ensureExpenseId,
  ownerField = "requestId",
  onDeleteReceipt = deleteReimbursementReceipt,
  disabled = false,
}: ReceiptUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const requestId = await ensureRequestId();
      const formData = new FormData();
      formData.append("file", file);
      formData.append(ownerField, requestId);
      if (ensureExpenseId) {
        formData.append("expenseId", await ensureExpenseId());
      }

      const response = await fetch("/api/upload/reimbursement-receipt", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to upload receipt");

      onChange([
        ...receipts,
        {
          id: data.receiptId,
          blobUrl: data.url,
          fileName: data.fileName,
          contentType: data.contentType,
        },
      ]);
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't upload that receipt."));
    } finally {
      setUploading(false);
    }
  }

  async function handleCamera() {
    const { isNativeCameraAvailable, capturePhoto } = await import(
      "@/lib/native-camera"
    );
    if (await isNativeCameraAvailable()) {
      const photo = await capturePhoto();
      if (photo) await upload(photo.file);
      return;
    }
    cameraInputRef.current?.click();
  }

  async function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Reset first: picking the same file twice in a row fires no change event
    // otherwise, which reads as "the button is broken".
    event.target.value = "";
    for (const file of files) await upload(file);
  }

  async function handleRemove(receipt: UploadedReceipt) {
    setError(null);
    try {
      await onDeleteReceipt(receipt.id);
      onChange(receipts.filter((r) => r.id !== receipt.id));
    } catch (err) {
      setError(actionErrorMessage(err, "Couldn't remove that receipt."));
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInput}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
        multiple
        onChange={handleInput}
        className="hidden"
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={handleCamera}
          disabled={disabled || uploading}
          className="flex-1 py-6"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
          Take a photo
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex-1 py-6"
        >
          <Upload className="h-5 w-5" />
          Upload a file or PDF
        </Button>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {receipts.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {receipts.map((receipt) => (
            <li
              key={receipt.id}
              className="relative overflow-hidden rounded-lg border border-border bg-card"
            >
              {receipt.contentType === "application/pdf" ? (
                <div className="flex h-28 flex-col items-center justify-center gap-1 p-2 text-center">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {receipt.fileName}
                  </span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={receipt.blobUrl}
                  alt={receipt.fileName}
                  className="h-28 w-full object-cover"
                />
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(receipt)}
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-1.5 text-destructive shadow-sm"
                  aria-label={`Remove ${receipt.fileName}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
