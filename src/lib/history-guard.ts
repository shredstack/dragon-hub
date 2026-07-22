/**
 * Guards for deletes that would take history down with them.
 *
 * Most of this app's foreign keys cascade, which is right for cleanup and wrong
 * for the record: deleting a volunteer campaign silently removes every parent
 * who signed up for it, and deleting a recurring event removes the interest
 * that told next year's board who ran it last time. The rule this module
 * enforces is the one `deleteClassroomPermanently` already follows —
 *
 *   hard delete only when nothing is attached; otherwise archive.
 *
 * The counts are also handed to the UI so the confirmation dialog can name what
 * would be lost instead of saying "this cannot be undone".
 */

/** One category of attached rows, e.g. `{ label: "volunteer signup", count: 12 }`. */
export interface HistoryCount {
  /** Singular noun. Pluralised for display when the count isn't 1. */
  label: string;
  count: number;
  /** Override for irregular plurals ("copies", "people"). */
  plural?: string;
}

export interface HistorySummary {
  /**
   * Non-zero categories only, in the order given. Keeps `plural` so a summary
   * can be fed straight back into `assertNoHistory` without losing wording.
   */
  items: HistoryCount[];
  total: number;
  /** True when a hard delete is safe — nothing is attached. */
  isEmpty: boolean;
  /** Ready-to-render lines for the confirmation dialog. */
  lines: string[];
}

function pluralise({ label, count, plural }: HistoryCount) {
  if (count === 1) return `1 ${label}`;
  return `${count} ${plural ?? `${label}s`}`;
}

/**
 * Fold raw counts into something both the server guard and the client dialog
 * can use. Zero-count categories are dropped so the dialog never says
 * "0 messages".
 */
export function summarizeHistory(counts: HistoryCount[]): HistorySummary {
  const present = counts.filter((entry) => entry.count > 0);
  const total = present.reduce((sum, entry) => sum + entry.count, 0);
  return {
    items: present,
    total,
    isEmpty: total === 0,
    lines: present.map(pluralise),
  };
}

/**
 * Thrown when a delete is refused because history hangs off the row. Carries
 * the summary so a caller can render the counts rather than re-deriving them.
 */
export class HistoryAttachedError extends Error {
  readonly summary: HistorySummary;

  constructor(message: string, summary: HistorySummary) {
    super(message);
    this.name = "HistoryAttachedError";
    this.summary = summary;
  }
}

/**
 * Refuse a hard delete when anything is attached.
 *
 * @param subject   How to name the thing, e.g. `"Fun Run 2026"`.
 * @param counts    What hangs off it.
 * @param alternative What the user should do instead ("Archive it instead —
 *                  that hides it everywhere without destroying the record.")
 */
export function assertNoHistory(
  subject: string,
  counts: HistoryCount[],
  alternative: string
): void {
  const summary = summarizeHistory(counts);
  if (summary.isEmpty) return;

  throw new HistoryAttachedError(
    `"${subject}" has history attached (${summary.lines.join(", ")}). ${alternative}`,
    summary
  );
}
