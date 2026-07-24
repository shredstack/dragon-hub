"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  isRestoreNavigation,
  readPageMemory,
  writePageMemory,
} from "@/lib/page-memory";

/**
 * Remembers how far down a page was scrolled and puts you back there when you
 * return to it through a back link (see `withRestoreFlag`). Drop it in a layout
 * once and every page under it is covered.
 *
 * The app scrolls an inner `<main>` on desktop but can scroll the document on
 * mobile, so the scrolling element is resolved at runtime rather than assumed.
 */

/** How long to keep reaching for the saved offset while content fills in. */
const RESTORE_TIMEOUT_MS = 800;

/** How long scrolling has to settle before the position is written down. */
const SAVE_DEBOUNCE_MS = 150;

function overflowAncestorOf(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

export function ScrollMemory() {
  const pathname = usePathname();
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const container = overflowAncestorOf(anchorRef.current);

    // Whichever of the two is actually holding the overflow right now.
    const scroller = (): HTMLElement | null => {
      if (container && container.scrollHeight - container.clientHeight > 1) {
        return container;
      }
      return (document.scrollingElement as HTMLElement | null) ?? container;
    };

    let cancelled = false;
    let restoring = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;

    const save = () => {
      saveTimer = undefined;
      const el = scroller();
      // Skip while we're mid-restore: the intermediate offsets on the way to
      // the target aren't where the user left off.
      if (!el || restoring) return;
      writePageMemory(pathname, { scrollTop: el.scrollTop });
    };

    // Settling before writing keeps a flick-scroll on a phone from touching
    // sessionStorage on every frame; the cleanup below catches anyone who
    // navigates inside the window.
    const onScroll = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, SAVE_DEBOUNCE_MS);
    };

    const restoreRequested = isRestoreNavigation();
    const target = restoreRequested
      ? (readPageMemory(pathname).scrollTop ?? 0)
      : 0;

    // Arriving fresh starts you at the top, so that's the position to remember
    // until you scroll — otherwise a later back link would restore an offset
    // from some earlier visit.
    if (!restoreRequested) writePageMemory(pathname, { scrollTop: 0 });

    // If the user starts scrolling while we're still reaching for the saved
    // offset, they win — nothing worse than a page that scrolls itself back.
    const abortRestore = () => {
      cancelled = true;
      restoring = false;
    };
    const abortEvents = ["wheel", "touchstart", "keydown"] as const;

    if (target > 0) {
      restoring = true;
      abortEvents.forEach((type) =>
        window.addEventListener(type, abortRestore, { passive: true, once: true })
      );
      const startedAt = performance.now();
      const step = () => {
        if (cancelled) return;
        const el = scroller();
        if (el) el.scrollTop = target;
        // Server components stream and client widgets settle after mount, so
        // the page may still be too short to hold the offset. Keep nudging
        // until it takes, or until we've waited long enough to stop fighting
        // a page that simply got shorter.
        const settled = !el || Math.abs(el.scrollTop - target) <= 1;
        if (!settled && performance.now() - startedAt < RESTORE_TIMEOUT_MS) {
          requestAnimationFrame(step);
        } else {
          restoring = false;
        }
      };
      requestAnimationFrame(step);
    }

    // Capture phase: scroll events don't bubble, so this is what catches them
    // whether the document or an inner element is the one scrolling.
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });

    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll, { capture: true });
      abortEvents.forEach((type) =>
        window.removeEventListener(type, abortRestore)
      );
      clearTimeout(saveTimer);
      // A last save on the way out, but never a zero: by the time this runs the
      // router has already scrolled the new page to the top, and that 0 would
      // overwrite the position the scroll listener recorded.
      const el = scroller();
      if (el && !restoring && el.scrollTop > 0) {
        writePageMemory(pathname, { scrollTop: el.scrollTop });
      }
    };
  }, [pathname]);

  return <span ref={anchorRef} aria-hidden className="hidden" />;
}
