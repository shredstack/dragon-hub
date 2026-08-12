/**
 * Converting between an **instant** and the value an `<input type="datetime-local">`
 * wants.
 *
 * This is the instant side of the house, not the calendar-day side — see
 * `date-only.ts` for the other one, and pick by what the column means. Everything
 * here is for a `timestamptz` that holds a real clock time: a Meet the Masters
 * presentation at 9:30, a signup window closing at 5pm.
 *
 * The subtlety worth having in one place: `datetime-local` is **zone-naive**. It
 * neither reads nor writes an offset, so:
 *
 * - Going *in*, an instant has to be projected into some zone's wall clock
 *   before it can be shown. `toISOString().slice(0, 16)` is the bug — that is
 *   UTC's wall clock, so a hunt opening 5pm Denver renders as the 16th at
 *   23:00, and a board member "correcting" it silently moves the event.
 * - Coming *out*, `new Date("2026-08-17T09:30")` is interpreted in the
 *   **browser's** zone. That is the right answer for someone standing at the
 *   school entering a school event, and the wrong answer for a treasurer
 *   filling in next year's dates from a hotel in another time zone. We accept
 *   the browser's zone deliberately (it is what every other calendar app does)
 *   rather than pretend to a precision we can't get from this input.
 *
 * Three copies of this conversion existed before this module — two of them
 * written differently — in the committee schedule, the committee admin form and
 * the scavenger hunt settings.
 */

/** Two digits, for building a local wall-clock string by hand. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * An instant → `"YYYY-MM-DDTHH:mm"` in the reader's own zone, or `""` when
 * unset so it can be dropped straight into a controlled input.
 *
 * Built from the local getters rather than `toISOString()`, which would hand
 * back UTC's wall clock. Accepts a `Date` or an ISO string, so a caller doesn't
 * have to know whether the value survived serialization from a server
 * component.
 */
export function toDateTimeInputValue(
  value: Date | string | null | undefined
): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * A `datetime-local` value → an ISO instant, resolved in the browser's zone.
 * Empty input gives null, which is what every nullable `timestamptz` here wants.
 *
 * Returns null for an unparseable value too: a half-typed date reaching a
 * server action as `"Invalid Date"` is worse than reaching it as "not set".
 */
export function fromDateTimeInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Whether an end lands at or before its start — the one validation every
 * range in the app wants and none of them had. Both arguments are raw
 * `datetime-local` values; a blank end (the common "open-ended" case) is not
 * an error.
 */
export function isEndBeforeStart(start: string, end: string): boolean {
  if (!start || !end) return false;
  const startAt = new Date(start).getTime();
  const endAt = new Date(end).getTime();
  if (Number.isNaN(startAt) || Number.isNaN(endAt)) return false;
  return endAt <= startAt;
}
