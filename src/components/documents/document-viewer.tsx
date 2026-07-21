"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { previewKind } from "@/lib/documents/preview";
import { ExternalLink, Loader2 } from "lucide-react";

export interface ViewableDocument {
  id: string;
  fileName: string;
  title: string | null;
  mimeType: string | null;
  source: string;
  url: string | undefined;
}

interface DocumentViewerProps {
  document: ViewableDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PREVIEW_TIMEOUT_MS = 30_000;

interface PreviewResponse {
  kind: "html" | "text" | "pending" | "none";
  content?: string;
  truncated?: boolean;
}

/**
 * Read a document without leaving the app.
 *
 * On a phone the alternative is downloading the file and handing it to
 * whatever app claims the type, which loses the user's place entirely — so
 * images and PDFs render from their stored file, and Word/Sheets/text fall
 * back to a reader view built from the text we extracted at index time.
 * Opening the original stays one tap away for anything that needs real
 * formatting or editing.
 */
export function DocumentViewer({
  document,
  open,
  onOpenChange,
}: DocumentViewerProps) {
  const kind = previewKind(document);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = document.title || document.fileName;

  useEffect(() => {
    if (!open || kind !== "extracted") return;
    let cancelled = false;
    // Converting a large Word file can stall; without this the spinner spins
    // forever and the only way out is closing the dialog.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    fetch(`/api/documents/${document.id}/preview`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load");
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof DOMException && err.name === "AbortError"
            ? "This file is taking too long to open. Open the original instead."
            : err instanceof Error
              ? err.message
              : "Failed to load"
        );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [open, kind, document.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate text-base sm:text-lg">
            {name}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background">
          {kind === "image" && document.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={document.url}
              alt={name}
              className="mx-auto h-auto max-w-full"
            />
          )}

          {kind === "pdf" && document.url && (
            <iframe
              src={document.url}
              title={name}
              className="h-[70dvh] w-full"
            />
          )}

          {kind === "extracted" && (
            <div className="p-4">
              {loading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              {preview?.kind === "html" && (
                <div
                  className="meeting-notes document-preview text-sm"
                  dangerouslySetInnerHTML={{ __html: preview.content ?? "" }}
                />
              )}
              {preview?.kind === "text" && (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                  {preview.content}
                </pre>
              )}
              {preview?.kind === "pending" && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Still reading this file. Check back in a minute.
                </p>
              )}
              {preview?.kind === "none" && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  There&apos;s no text to show for this file. Open the original
                  to view it.
                </p>
              )}
            </div>
          )}

          {!kind && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              This file type can&apos;t be shown here. Open the original to view
              it.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {preview?.kind === "text"
              ? "Text preview — open the original for full formatting."
              : preview?.truncated
                ? "Long document — showing the beginning."
                : ""}
          </p>
          {document.url && (
            <a
              href={document.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" />
              Open original
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
