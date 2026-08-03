/**
 * Sorting shared by the approved archive and the pending-approval table, so
 * "newest first" means the same thing in both halves of the Minutes tab.
 */

export const MINUTES_SORT_OPTIONS = {
  "date-desc": "Meeting date (newest first)",
  "date-asc": "Meeting date (oldest first)",
  "name-asc": "File name (A–Z)",
} as const;

export type MinutesSortKey = keyof typeof MINUTES_SORT_OPTIONS;

interface SortableMinutes {
  fileName: string;
  /** `YYYY-MM-DD`, or null when the sync couldn't find a date in the file. */
  meetingDate: string | null;
}

export function sortMinutes<T extends SortableMinutes>(
  items: T[],
  sort: MinutesSortKey
): T[] {
  const byName = (a: T, b: T) =>
    a.fileName.localeCompare(b.fileName, undefined, { numeric: true });

  return [...items].sort((a, b) => {
    if (sort === "name-asc") return byName(a, b);

    // A document whose meeting date couldn't be parsed sorts to the bottom in
    // both directions — it is unplaceable, not oldest. (Postgres would do the
    // opposite on a DESC, which is why the page's own ORDER BY says NULLS
    // LAST.)
    if (!a.meetingDate && !b.meetingDate) return byName(a, b);
    if (!a.meetingDate) return 1;
    if (!b.meetingDate) return -1;

    // ISO dates compare correctly as strings.
    const diff = a.meetingDate.localeCompare(b.meetingDate);
    return sort === "date-asc" ? diff : -diff;
  });
}
