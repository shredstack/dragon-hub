"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The paper the form has to land on: Letter at the 0.5in margins `globals.css`
 * sets, less a little slack for the printer's own unprintable edge and for the
 * browser's page header when the reader leaves it switched on.
 */
const USABLE_PAGE_HEIGHT_PX = 9.5 * 96;

/**
 * The width that same page leaves, and the width the form is measured at.
 * Measuring it as it happens to be laid out on screen would mean measuring a
 * phone: the same form wraps to twice the length in a 375px column, and the
 * scale computed from that would shrink a form that already fitted.
 */
const MEASURE_WIDTH = "7.5in";

/**
 * Below this a check request is a photocopy of a photocopy — the signature
 * lines stop being worth signing and the treasurer squints at the totals. A
 * form this long (a dozen itemized receipts, a slate of four approvers) is
 * genuinely two pages, and printing it honestly at full size beats shrinking it
 * to something nobody can read and still spilling.
 */
const MIN_SCALE = 0.7;

/**
 * Whether this browser resolves a zoomed element's width against the page the
 * way the current spec says, or the way `zoom` worked for its first twenty
 * years.
 *
 * The distinction decides whether a scaled form fills the paper or hangs off
 * the right-hand edge of it, and there is no way to reason it out — it has to
 * be measured. Under the CSS Viewport behaviour (Chrome 128+, Firefox 126+,
 * Safari 18+) the containing block is divided by the element's zoom before a
 * width resolves against it, so `width: 100%` paints at exactly the parent's
 * width and needs no help. Under the older behaviour the width resolves first
 * and *then* shrinks, leaving a gutter down the right-hand side that has to be
 * divided back out. Compensating on a browser that doesn't need it is how the
 * treasurer's box ran off the edge of the page: 100% / 0.88 is 114% of the
 * paper, and the last two columns of the receipt table print into the margin.
 */
let zoomFillsParent: boolean | null = null;

function zoomWidthFillsParent(): boolean {
  if (zoomFillsParent !== null) return zoomFillsParent;
  const outer = document.createElement("div");
  outer.style.cssText =
    "position:absolute;left:-9999px;top:0;width:200px;visibility:hidden";
  const inner = document.createElement("div");
  inner.style.cssText = "zoom:0.5;width:100%";
  outer.append(inner);
  document.body.append(outer);
  // 200 under the spec behaviour, 100 under the old one — the midpoint is a
  // wide berth around whatever rounding either arrives at.
  const width = inner.getBoundingClientRect().width;
  outer.remove();
  zoomFillsParent = width > 150;
  return zoomFillsParent;
}

/**
 * Shrink-to-fit for a printed page that runs a little past one sheet.
 *
 * A check request is a *form*: it goes in the binder, gets signed across the
 * bottom and filed behind the check, and a form whose signature block is
 * stranded alone on a second sheet is the version everyone loses half of. Its
 * length isn't fixed, though — an afternoon of errands is several receipts with
 * their line items, and a school's slate may need three signatures where the
 * next school needs one — so no amount of tightening the layout can promise one
 * page for every request. This measures the real thing and scales it.
 *
 * `zoom` rather than `transform: scale()`, and the difference matters here:
 * zoom reflows, so the element genuinely occupies its new smaller height and
 * the browser paginates accordingly. A transform only paints smaller — the
 * layout box stays two pages tall, and the browser dutifully prints a blank
 * second sheet behind the shrunken form, which is the exact bug this exists to
 * fix. The `--dh-print-fit` custom property is read by a `@media print` rule in
 * `globals.css`; nothing about the screen changes.
 */
export function PrintFit({
  children,
  className,
  notice = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** The screen-only line explaining a shrink the reader didn't ask for. */
  notice?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // False until the probe below says otherwise, which is the harmless answer:
  // it means the form is laid out at the page's own width. Guessing the other
  // way would print a form wider than the paper.
  const [widthCompensated, setWidthCompensated] = useState(false);

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;

    // Widen to the page, read, put it back — all inside one frame, so the
    // browser reflows but never paints the intermediate width.
    const previousWidth = element.style.width;
    element.style.width = MEASURE_WIDTH;
    const height = element.getBoundingClientRect().height;
    element.style.width = previousWidth;

    if (height <= USABLE_PAGE_HEIGHT_PX) {
      setScale(1);
      return;
    }
    // Round down: a scale that fits by a rounding error doesn't fit.
    const fit = Math.floor((USABLE_PAGE_HEIGHT_PX / height) * 100) / 100;
    setScale(fit >= MIN_SCALE ? fit : 1);
  }, []);

  useEffect(() => {
    setWidthCompensated(!zoomWidthFillsParent());
    measure();
    // The form is all text, so the web font arriving after first paint changes
    // its height. Measuring again when it lands costs nothing on a warm cache.
    document.fonts?.ready.then(measure).catch(() => undefined);
    // And once more on the way into the dialog, for anything that reflowed
    // since — a late image, a reader who zoomed the browser.
    window.addEventListener("beforeprint", measure);
    return () => window.removeEventListener("beforeprint", measure);
  }, [measure]);

  return (
    <>
      {notice && scale < 1 && (
        <p className="text-muted-foreground mb-3 text-xs print:hidden">
          Scaled to {Math.round(scale * 100)}% so the form prints on one sheet.
        </p>
      )}
      <div
        ref={ref}
        className={cn("dh-print-fit", className)}
        style={
          // Strings, not numbers: a custom property carries whatever it is
          // handed, and nothing downstream should depend on how React chooses
          // to stringify a float. The width property is set only where the
          // browser needs the gutter divided out — everywhere else the `100%`
          // default in `globals.css` already fills the page.
          scale < 1
            ? ({
                "--dh-print-fit": String(scale),
                ...(widthCompensated
                  ? { "--dh-print-fit-width": `${(100 / scale).toFixed(3)}%` }
                  : null),
              } as CSSProperties)
            : undefined
        }
      >
        {children}
      </div>
    </>
  );
}
