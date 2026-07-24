"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  linkHostname,
  linkPreviewUrl,
  type ImportantLink,
} from "@/lib/important-links-shared";

/**
 * A board link opened *over* the dashboard instead of away from it.
 *
 * The honest limitation: a site that sends `X-Frame-Options: DENY` refuses to
 * render here, and the browser gives cross-origin JavaScript no way to find
 * out — the frame just stays blank. So the escape hatch is permanent, not a
 * fallback we try to detect our way into: "Open in new tab" sits in the header
 * the whole time, and a nudge toward it appears if nothing has painted after a
 * few seconds. The board also chooses per link which mode to use, so the ones
 * that don't frame never open here in the first place.
 */
export function LinkPreviewDialog({
  link,
  onClose,
}: {
  link: ImportantLink | null;
  onClose: () => void;
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!link) return;
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [link]);

  if (!link) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-[calc(100vw-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        {/* pr-12 leaves room for the close button DialogContent pins to the
            top-right corner. */}
        <div className="flex items-center gap-3 border-b border-border p-4 pr-12">
          <span className="text-xl" aria-hidden>
            {link.iconEmoji || "🔗"}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">
              {link.title}
            </DialogTitle>
            <DialogDescription className="truncate text-xs">
              {linkHostname(link.url)}
            </DialogDescription>
          </div>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open in new tab</span>
          </a>
        </div>

        <div className="relative flex-1 bg-muted/40">
          <iframe
            key={link.id}
            src={linkPreviewUrl(link.url)}
            title={link.title}
            className="h-full w-full border-0"
            // No `sandbox`: the destination is cross-origin, so the browser
            // already walls it off from this session, and stripping
            // allow-same-origin would break the Google previews this exists to
            // show (they need their own cookies to render).
            referrerPolicy="no-referrer"
          />
          {slow && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
              <p className="pointer-events-auto mx-auto max-w-md rounded-xl border border-border bg-card/95 px-4 py-3 text-center text-xs text-muted-foreground shadow-lg">
                Still blank? Some sites don&apos;t allow being shown inside
                another page.{" "}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-dragon-blue-500 hover:underline"
                >
                  Open it in a new tab
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
