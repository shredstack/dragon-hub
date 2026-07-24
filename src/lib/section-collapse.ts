/**
 * Which collapsible sections a user has opened, remembered between visits.
 *
 * Deliberately not part of `page-memory.ts`: that is `sessionStorage` and gated
 * behind a `?restore=1` back link, both right for "put me back where I was in
 * this tab". Section state is a preference — it should survive closing the tab
 * and apply however you arrived — so it lives in `localStorage` and is read on
 * every visit.
 *
 * Only sections the user has actually toggled are written down. A section
 * nobody has touched has no entry, so a section added later starts at its own
 * default rather than inheriting a stale "everything was open" blob.
 */

const STORAGE_KEY = "dragonhub:sections-expanded";

type ExpandedMap = Record<string, boolean>;

function readAll(): ExpandedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ExpandedMap) : {};
  } catch {
    // Private browsing, quota, or a value we didn't write. Sections just open
    // at their default — not worth failing a page render over.
    return {};
  }
}

/** `undefined` means the user has never toggled this section. */
export function readSectionExpanded(id: string): boolean | undefined {
  return readAll()[id];
}

export function writeSectionExpanded(id: string, expanded: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readAll(), [id]: expanded };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Same as above — remembering is a nicety, not a feature to break a page for.
  }
}
