/**
 * Calendar days, as distinct from instants.
 *
 * A task due August 17 is due August 17 for everyone — it has no clock time and
 * no time zone. The bug this module exists to kill is what happens when such a
 * value is read back as an instant: `new Date("2026-08-17")` is midnight *UTC*,
 * which is 6pm on the **16th** in Denver, so `toLocaleDateString()` renders the
 * day before the one the board member picked. Vercel runs in UTC and a phone
 * doesn't, so the same due date rendered on the server and in the browser
 * disagreed with each other as well as with the form.
 *
 * The rule is one line: **date-only values are parsed and formatted against
 * UTC, never against the runtime's zone.** These helpers are the only place
 * that happens.
 *
 * What this covers:
 *   - `date` columns, which Drizzle hands back as `"YYYY-MM-DD"` strings —
 *     `volunteer_hours.date`, `budget_transactions.date`,
 *     `fundraisers.start_date`/`end_date`, `pta_minutes.meeting_date` and
 *     `ai_extracted_date`, `email_campaigns.week_start`/`week_end`,
 *     `email_content_items.target_date`
 *   - `timestamptz` columns that hold a day rather than a moment —
 *     `event_plans.event_date`, `event_plan_tasks.due_date`,
 *     `classroom_tasks.due_date`, `committee_tasks.due_date`,
 *     `event_plan_meetings.meeting_date`, `school_join_codes.expires_at`
 *
 * What this is NOT for: anything with a real clock time — `created_at`, a
 * committee schedule slot, a Google Calendar event. Those are instants and
 * belong in `@/lib/time-zone`, which formats against the *school's* zone.
 *
 * Client-safe: no db, no server-only imports, so a server component and the
 * client component it hands data to render the identical string.
 */

export type DateOnlyInput = Date | string | null | undefined;

/** Every date-only value is anchored here, so no zone can shift the day. */
const DATE_ONLY_ZONE = "UTC";

/**
 * Noon rather than midnight, deliberately.
 *
 * The formatters below pin UTC, so the hour is invisible to them. It matters
 * for the code this module hasn't reached — an email template, a future
 * `toLocaleDateString`, a `date-fns` `format` — where noon UTC still lands on
 * the right calendar day anywhere from UTC-11 to UTC+11, and midnight UTC does
 * not. It is a seatbelt, not the mechanism.
 */
const DATE_ONLY_TIME = "T12:00:00.000Z";

const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

/**
 * The `"YYYY-MM-DD"` form: the value a `<input type="date">` expects, and the
 * canonical way to compare or store a day.
 *
 * Returns `""` for anything absent or unparseable, so it can be dropped
 * straight into a controlled input's `value` without a null dance.
 */
export function toDateOnly(value: DateOnlyInput): string {
  if (!value) return "";

  if (typeof value === "string") {
    // Covers both a bare "2026-08-17" from a `date` column and a full ISO
    // timestamp, which begins with its own UTC day.
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[0];
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }

  return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
}

/**
 * The instant to **store** for a day someone picked.
 *
 * Use this for every `timestamptz` column that means a day: writing
 * `new Date(formValue)` instead stores midnight UTC, which is the bug.
 */
export function parseDateOnly(value: DateOnlyInput): Date | null {
  const day = toDateOnly(value);
  return day ? new Date(`${day}${DATE_ONLY_TIME}`) : null;
}

/**
 * The instant to store for a day that is a **deadline** rather than a label —
 * "expires Aug 17", "signups close Aug 17". The end of that day, not its start.
 *
 * `parseDateOnly` is wrong for these: a code stored at midnight UTC on the 17th
 * has already stopped working by dinnertime on the *16th* in Denver, which is
 * not what the board member who typed "Aug 17" meant. End-of-day UTC covers the
 * whole of the intended day for schools west of Greenwich, at the cost of the
 * last few evening hours — the app has no per-school zone on these paths, and a
 * gate that closes a little early beats one that closes a day early.
 */
export function endOfDateOnly(value: DateOnlyInput): Date | null {
  const day = toDateOnly(value);
  return day ? new Date(`${day}T23:59:59.999Z`) : null;
}

/** "Aug 17, 2026". Empty string when there's no date, so callers can `&&`. */
export function formatDateOnly(
  value: DateOnlyInput,
  options: Intl.DateTimeFormatOptions = DEFAULT_FORMAT
): string {
  const day = toDateOnly(value);
  if (!day) return "";
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: DATE_ONLY_ZONE,
  }).format(new Date(`${day}${DATE_ONLY_TIME}`));
}

/** "Monday, August 17, 2026" */
export function formatLongDateOnly(value: DateOnlyInput): string {
  return formatDateOnly(value, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "Mon, Aug 17, 2026" */
export function formatWeekdayDateOnly(value: DateOnlyInput): string {
  return formatDateOnly(value, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "8/17/2026" — the terse form `toLocaleDateString()` used to give. */
export function formatShortDateOnly(value: DateOnlyInput): string {
  return formatDateOnly(value, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * "August 17-21", collapsing the parts the two ends share.
 *
 * An email campaign's week, a fundraiser's run. The year is left off by default
 * because these appear in a title beside the week they belong to; pass
 * `year: true` where the range stands alone. A range that straddles New Year
 * always shows both years regardless.
 */
export function formatDateOnlyRange(
  start: DateOnlyInput,
  end: DateOnlyInput,
  options: { month?: "long" | "short"; year?: boolean } = {}
): string {
  const month = options.month ?? "long";
  const showYear = options.year ?? false;
  const from = toDateOnly(start);
  const to = toDateOnly(end);

  const full = (value: string) =>
    formatDateOnly(value, { month, day: "numeric", year: "numeric" });
  const monthDay = (value: string) => formatDateOnly(value, { month, day: "numeric" });
  const day = (value: string) => formatDateOnly(value, { day: "numeric" });

  if (!from && !to) return "";
  if (!from) return full(to);
  if (!to) return full(from);

  const [fromYear, fromMonth] = from.split("-");
  const [toYear, toMonth] = to.split("-");

  if (fromYear !== toYear) return `${full(from)} - ${full(to)}`;

  const suffix = showYear ? `, ${toYear}` : "";
  if (fromMonth !== toMonth) {
    return `${monthDay(from)} - ${monthDay(to)}${suffix}`;
  }
  return `${monthDay(from)}-${day(to)}${suffix}`;
}

/**
 * Today, as a calendar day in `timeZone`.
 *
 * Server callers should pass the school's zone (`getSchoolTimeZone()`) rather
 * than letting this default: the process runs in UTC on Vercel, where a school
 * in Denver is already "tomorrow" from 6pm onward.
 */
export function todayDateOnly(timeZone?: string | null): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || DATE_ONLY_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * `day` shifted by whole days, still as `"YYYY-MM-DD"`.
 *
 * Safe against DST because the arithmetic happens in UTC, which has none —
 * the reason a naive `setDate()` on a local Date can land on the same day
 * twice in November.
 */
export function addDaysToDateOnly(value: DateOnlyInput, days: number): string {
  const day = toDateOnly(value);
  if (!day) return "";
  const shifted = new Date(`${day}${DATE_ONLY_TIME}`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Negative when `a` is earlier, 0 when the same day, positive when later. */
export function compareDateOnly(a: DateOnlyInput, b: DateOnlyInput): number {
  const left = toDateOnly(a);
  const right = toDateOnly(b);
  if (left === right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left < right ? -1 : 1;
}
