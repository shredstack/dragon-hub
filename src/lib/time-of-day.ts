/**
 * A wall-clock time at the school, with no date and no time zone.
 *
 * The sibling of `src/lib/date-only.ts`, and it exists for the same reason.
 * "Field Day starts at 9:00" is 9:00 for everybody at that school — it is not an
 * instant, it has no offset, and the moment it is folded into a timestamp it
 * moves. So a time of day is stored as `"HH:MM"` (24-hour) text and formatted
 * here, against nothing at all.
 *
 * Pick by what the column means, exactly as with the other two modules:
 *
 * | The value means            | Module              |
 * |----------------------------|---------------------|
 * | a calendar day             | `date-only.ts`      |
 * | a clock time on that day   | **this file**       |
 * | an absolute instant        | `time-zone.ts`      |
 *
 * Client-safe, so a form and a server action narrow input identically.
 */

/** `"09:00"`, `"9:00"`, `"14:30"`, `"2:30 PM"` → `"09:00"`; anything else null. */
export function normalizeTimeOfDay(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const match = /^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i.exec(raw);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.[0]?.toLowerCase();

  if (minutes > 59) return null;

  if (meridiem) {
    // A 12-hour string, which is what an older hand-typed value looks like.
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "p" && hours !== 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
  } else if (hours > 23) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** `"14:30"` → `"2:30 PM"`. Returns null for anything unparseable. */
export function formatTimeOfDay(value: string | null | undefined): string | null {
  const normalized = normalizeTimeOfDay(value);
  if (!normalized) return null;

  const hours = Number(normalized.slice(0, 2));
  const minutes = normalized.slice(3, 5);
  const meridiem = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes} ${meridiem}`;
}

/**
 * `"09:00"` + `"11:30"` → `"9:00 AM – 11:30 AM"`; a start alone → `"9:00 AM"`.
 *
 * An end time with no start is not a range and reads as nonsense on its own, so
 * it renders as nothing — the form doesn't let you express it either.
 */
export function formatTimeOfDayRange(
  start: string | null | undefined,
  end: string | null | undefined
): string | null {
  const from = formatTimeOfDay(start);
  if (!from) return null;
  const to = formatTimeOfDay(end);
  return to ? `${from} – ${to}` : from;
}

/**
 * The value an `<input type="time">` wants, from whatever is stored.
 *
 * Separate from `normalizeTimeOfDay` only in intent — a prefill that silently
 * disagreed with what is displayed is the bug `toDateOnly` exists to avoid, so
 * both sides go through one function.
 */
export function toTimeInputValue(value: string | null | undefined): string {
  return normalizeTimeOfDay(value) ?? "";
}

/** True when `end` is at or before `start` — both being real times. */
export function isBackwardsTimeRange(
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  const from = normalizeTimeOfDay(start);
  const to = normalizeTimeOfDay(end);
  if (!from || !to) return false;
  return to <= from;
}
