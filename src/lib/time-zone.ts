/**
 * Formatting instants in a school's own time zone.
 *
 * `calendar_events.start_time` is a `timestamptz` — an absolute instant, with no
 * memory of the wall-clock time someone typed into Google Calendar. Formatting
 * it with `date-fns` / `toLocaleString()` uses whatever zone the *process* runs
 * in, which is UTC on Vercel. That is what made a 10:30am PTA meeting render as
 * 4:30pm: the instant was right the whole time, the zone was missing.
 *
 * So every calendar-derived time must be formatted against an explicit IANA
 * zone. Helpers here take one and use `Intl.DateTimeFormat`, which is built in —
 * no tz database dependency.
 *
 * This module is client-safe (no db, no server-only imports) so a server
 * component can resolve the zone and hand it to a client component to render.
 */

/**
 * Last-resort zone, used only when a school has no calendar synced yet and so
 * nothing has told us where it is. Every real path resolves a zone from Google:
 * the event's own `start.timeZone`, else the calendar's zone.
 */
export const DEFAULT_TIME_ZONE = "America/Denver";

/**
 * Guard against a bad zone taking down a render. `Intl` throws a RangeError on
 * an unknown IANA name, and these strings come from an external API and from
 * columns that are null on pre-migration rows.
 */
export function resolveTimeZone(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: candidate });
      return candidate;
    } catch {
      // Not a zone Intl knows; try the next candidate.
    }
  }
  return DEFAULT_TIME_ZONE;
}

/**
 * Escape hatch for a shape the named helpers below don't cover. Same contract:
 * an explicit zone, never the runtime's.
 */
export function formatInTimeZone(
  date: Date | string,
  timeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: resolveTimeZone(timeZone),
  }).format(value);
}

/** "Aug 12, 2026" */
export function formatDateInTimeZone(
  date: Date | string,
  timeZone: string | null | undefined
): string {
  return formatInTimeZone(date, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Wednesday, August 12, 2026" */
export function formatLongDateInTimeZone(
  date: Date | string,
  timeZone: string | null | undefined
): string {
  return formatInTimeZone(date, timeZone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "10:30 AM" */
export function formatTimeInTimeZone(
  date: Date | string,
  timeZone: string | null | undefined
): string {
  return formatInTimeZone(date, timeZone, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "Aug 12, 2026, 10:30 AM" */
export function formatDateTimeInTimeZone(
  date: Date | string,
  timeZone: string | null | undefined
): string {
  return formatInTimeZone(date, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * The parts of the wall-clock time in `timeZone`, as numbers. Use this instead
 * of `getMonth()` / `getDate()` when the question is "which calendar day is this
 * in the school's zone" — a 6pm Mountain event is the *next* day in UTC, so the
 * server's own accessors put late-evening events in the wrong month.
 */
export function zonedParts(
  date: Date | string,
  timeZone: string | null | undefined
): { year: number; month: number; day: number; hour: number; minute: number } {
  const value = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // "24" is how Intl spells midnight under hour12: false.
    hour: get("hour") % 24,
    minute: get("minute"),
  };
}

/**
 * The UTC instant of `hour:minute` wall-clock on the given Y/M/D in `timeZone`.
 * Used to build the query bounds for "events in August" without the boundary
 * days landing in the wrong month.
 *
 * Works by guessing UTC, measuring how far off the guess renders in the target
 * zone, and correcting — one iteration is enough except exactly at a DST
 * transition, where a second pass settles it.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string | null | undefined
): Date {
  const zone = resolveTimeZone(timeZone);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = new Date(target);

  for (let i = 0; i < 2; i++) {
    const p = zonedParts(guess, zone);
    const rendered = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const drift = rendered - target;
    if (drift === 0) break;
    guess = new Date(guess.getTime() - drift);
  }

  return guess;
}
