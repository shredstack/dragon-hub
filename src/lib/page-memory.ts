/**
 * Remembers where you were on a page you're coming back to — scroll position,
 * and whatever else a page wants to hold onto (the hub remembers its search).
 *
 * Only a deliberate "back" restores: links built with `withRestoreFlag()` carry
 * `?restore=1`, and only then does a page put you back where you left off.
 * Arriving from the sidebar or a fresh link still starts at the top, which is
 * what you'd expect from a link you chose on purpose.
 *
 * State lives in sessionStorage, so it's per tab and gone when the tab is.
 */

const STORAGE_PREFIX = "dragonhub:page-memory:";
const RESTORE_PARAM = "restore";

export interface PageMemory {
  /** Scroll offset of the page's scrolling container, in pixels. */
  scrollTop?: number;
  /** Free-form filter state, e.g. the PTA Board Hub's search box. */
  search?: string;
}

/** Adds the flag that tells `href`'s page to restore itself when it loads. */
export function withRestoreFlag(href: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}${RESTORE_PARAM}=1`;
}

/**
 * Whether the current navigation asked for a restore. Read from the live URL
 * rather than `useSearchParams()` so any number of components can ask
 * independently, in any order, without a shared Suspense boundary.
 */
export function isRestoreNavigation(): boolean {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get(RESTORE_PARAM) === "1"
  );
}

export function readPageMemory(path: string): PageMemory {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + path);
    return raw ? (JSON.parse(raw) as PageMemory) : {};
  } catch {
    // Private browsing, quota, or a value we didn't write. Not worth failing a
    // page render over — the page just starts at the top.
    return {};
  }
}

/** Merges `patch` into what's already remembered for `path`. */
export function writePageMemory(path: string, patch: PageMemory): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readPageMemory(path), ...patch };
    window.sessionStorage.setItem(STORAGE_PREFIX + path, JSON.stringify(next));
  } catch {
    // Same as above — remembering the position is a nicety, not a feature to
    // break the page for.
  }
}
