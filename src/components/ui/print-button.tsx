"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Don't open the dialog over half-loaded images.
 *
 * A page that prints photographs — a reimbursement's receipts — hands the
 * printer whatever has arrived by the time the dialog opens, and an image still
 * in flight prints as the empty space it would have occupied. Waiting costs a
 * moment on a slow connection and nothing at all on a page that has none.
 *
 * The race is the point: a blob that will never load must not leave the reader
 * holding a button that does nothing. After the timeout we print what we have,
 * which is exactly what pressing ⌘P would have done.
 */
async function waitForImages() {
  const pending = Array.from(document.images).filter((img) => !img.complete);
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(pending.map((img) => img.decode().catch(() => undefined))),
    new Promise((resolve) => setTimeout(resolve, 8000)),
  ]);
}

/**
 * Opens the browser's own print dialog for the page it sits on.
 *
 * The printable surfaces in the app are print CSS, not a PDF library — the
 * page *is* the page — so there is nothing to generate and nothing to fetch:
 * the whole job is calling `window.print()` on a page whose non-print chrome
 * is already `print:hidden`. Same dialog the reader would reach with ⌘P, and
 * the same "Save as PDF" destination inside it.
 *
 * **Not for the native shell.** `window.print()` is unimplemented in both
 * iOS's WKWebView and Android's WebView — it is not a slow or partial print,
 * it is a button that does nothing at all. Callers resolve `isNativeShell()`
 * on the server and render something else there; see the reimbursement print
 * page for the wording.
 */
export function PrintButton({
  label = "Print",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const [preparing, setPreparing] = useState(false);

  async function handlePrint() {
    setPreparing(true);
    try {
      await waitForImages();
      window.print();
    } finally {
      setPreparing(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handlePrint}
      disabled={preparing}
      className={cn("print:hidden", className)}
    >
      <Printer className="h-4 w-4" />
      {preparing ? "Preparing…" : label}
    </Button>
  );
}
