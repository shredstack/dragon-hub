/**
 * When a submitted content item belongs in the weekly email.
 *
 * The secretary used to work an inbox: every submission sat in a queue until
 * somebody clicked "Add". That put the burden of remembering *when* a thing
 * should run on the one person who didn't know — the submitter is the one who
 * knows the spirit night is on the 12th and that mentioning it before the 1st
 * is pointless.
 *
 * So a submission carries a **window** instead of a single target date:
 * `start_date` (begin including it in emails) and `end_date` (it has happened;
 * stop). Both are required. An item belongs in a campaign when its window
 * overlaps that campaign's week — the standard interval overlap, not a
 * containment test, because a one-day event in the middle of the week and a
 * month-long fundraiser spanning it are both "this week's news".
 *
 * Client-safe: no db, no server-only imports, so the submit form can preview
 * exactly which weeks its dates will reach.
 */

import {
  addDaysToDateOnly,
  compareDateOnly,
  toDateOnly,
  type DateOnlyInput,
} from "@/lib/date-only";

export interface ContentWindow {
  startDate: DateOnlyInput;
  endDate: DateOnlyInput;
}

export interface CampaignWeek {
  weekStart: DateOnlyInput;
  weekEnd: DateOnlyInput;
}

/**
 * Does this item's window overlap that campaign's week?
 *
 * Kept as a pure predicate even though the server does the same comparison in
 * SQL (`relevantContentFilter`), because the submit form and the inbox both
 * need to answer it about dates that aren't in the database yet.
 */
export function isContentRelevantToWeek(
  item: ContentWindow,
  week: CampaignWeek
): boolean {
  const start = toDateOnly(item.startDate);
  const end = toDateOnly(item.endDate);
  const weekStart = toDateOnly(week.weekStart);
  const weekEnd = toDateOnly(week.weekEnd);
  if (!start || !end || !weekStart || !weekEnd) return false;

  return (
    compareDateOnly(start, weekEnd) <= 0 && compareDateOnly(end, weekStart) >= 0
  );
}

/** True when the end date falls before the start date — rejected on save. */
export function isInvalidContentWindow(item: ContentWindow): boolean {
  const start = toDateOnly(item.startDate);
  const end = toDateOnly(item.endDate);
  if (!start || !end) return false;
  return compareDateOnly(end, start) < 0;
}

/**
 * What the submit form prefills: start today, end four weeks out.
 *
 * A default rather than a blank because the form now demands two dates where
 * it used to demand none, and most submissions really are "run this until it
 * happens, some weeks from now". Something perennial gets an end date pushed
 * far out by hand — the form says so.
 */
export function defaultContentWindow(today: string): ContentWindow {
  return { startDate: today, endDate: addDaysToDateOnly(today, 28) };
}
