"use client";

import { useState } from "react";
import { ExternalLink, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HUNT_IMAGE_ASPECT_CLASS,
  huntImageAlt,
  type HuntImageFit,
} from "@/lib/hunt-image-shared";
import { cn } from "@/lib/utils";

/**
 * The image embedded in a hunt item, rendered the one way hunt images are
 * rendered: into a fixed 4:3 box, so a list of cards keeps a steady rhythm no
 * matter what shape the board pasted in. See `@/lib/hunt-image-shared` for why
 * the box is fixed and what `fit` chooses between.
 *
 * Always tappable. Card size is a preview, not a reading experience — a budget
 * page is never legible at 400px wide — so the tap is the actual answer to
 * "let families see the budget without opening an attachment": it opens full
 * screen *over* the hunt, with a zoom, and closing it puts the player back
 * exactly where they were.
 */
export function HuntItemImage({
  url,
  alt,
  fit,
  itemTitle,
  className,
}: {
  url: string;
  alt: string | null;
  fit: HuntImageFit;
  itemTitle: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const label = huntImageAlt(alt, itemTitle);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group relative block w-full overflow-hidden rounded-lg border border-border bg-muted",
          HUNT_IMAGE_ASPECT_CLASS,
          className
        )}
        aria-label={`View "${label}" full screen`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- blob-hosted, arbitrary dimensions, and this is a plain preview */}
        <img
          src={url}
          alt={label}
          loading="lazy"
          className={cn(
            "h-full w-full",
            fit === "cover" ? "object-cover" : "object-contain"
          )}
        />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium text-white">
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
          Tap to enlarge
        </span>
      </button>

      {open && (
        <HuntImageViewer label={label} url={url} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/**
 * The full-screen view. Two states only — fit to the screen, or zoomed and
 * pannable — because a parent holding a phone in one hand needs one obvious
 * control, not a pinch gesture that fights the dialog. "Open original" stays
 * visible as the escape hatch for anyone who'd rather have the raw file.
 */
function HuntImageViewer({
  label,
  url,
  onClose,
}: {
  label: string;
  url: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex h-[92dvh] max-h-[92dvh] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        {/* pr-12 leaves room for the close button pinned to the top-right. */}
        <div className="flex items-center gap-3 border-b border-border p-4 pr-12">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">{label}</DialogTitle>
            <DialogDescription className="text-xs">
              {zoomed ? "Scroll around to read it" : "Zoom in to read the details"}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            {zoomed ? (
              <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {zoomed ? "Fit to screen" : "Zoom in"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Open original</span>
          </a>
        </div>

        <div
          className={cn(
            "flex-1 bg-muted/40",
            zoomed ? "overflow-auto" : "flex items-center justify-center p-2"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- blob-hosted, arbitrary dimensions, and zooming needs the raw element */}
          <img
            src={url}
            alt={label}
            className={
              zoomed
                ? // At least 2.5x the viewport width, or natural size if that's
                  // bigger — a small image still zooms usefully, a big one
                  // isn't shrunk back down.
                  "min-w-[250%] max-w-none"
                : "max-h-full max-w-full object-contain"
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
