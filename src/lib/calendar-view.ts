/**
 * Laying calendar events out on a grid.
 *
 * The list view only ever had to answer "what's next", which a sort handles.
 * A week/month/year grid has to answer a harder question — *which cell does
 * this event belong in* — and that question is a time-zone trap, because the
 * two kinds of row in `calendar_events` disagree about what a day is:
 *
 *  - A **timed** event is an instant. Its cell is decided in the event's own
 *    zone (`time_zone`), falling back to the school's. Deciding it in the
 *    server's zone puts a 6pm Denver event on tomorrow, because Vercel is UTC.
 *  - An **all-day** event is a date wearing an instant's clothes: stored at
 *    midnight UTC, meaning a day. Its cell is decided in UTC, because
 *    projecting it into any other zone shifts it.
 *
 * So every function here takes days as `"YYYY-MM-DD"` strings and instants as
 * `Date`s, and `eventDayKeys()` is the single place the two meet. Day
 * arithmetic delegates to `@/lib/date-only`, which works in UTC and therefore
 * has no DST to land in.
 *
 * Client-safe: no db, no server-only imports, so the page can resolve the zone
 * on the server and the grid components can render the identical cells.
 */

import { addDaysToDateOnly, toDateOnly } from "@/lib/date-only";
import {
  formatTimeInTimeZone,
  inclusiveEndDate,
  resolveTimeZone,
  zonedDayKey,
  zonedParts,
  zonedTimeToUtc,
} from "@/lib/time-zone";

// ─── View modes ──────────────────────────────────────────────────────────────

export const CALENDAR_VIEWS = ["list", "week", "month", "year"] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/**
 * Month is the default: a parent opening the calendar is usually asking "what
 * is happening this month", which the grid answers at a glance, and it is the
 * shape every other calendar they use opens in.
 *
 * It is only the default for someone who has never chosen — see
 * `CALENDAR_VIEW_COOKIE`.
 */
export const DEFAULT_CALENDAR_VIEW: CalendarView = "month";

/**
 * Remembers the last view someone actually looked at, so a bare `/calendar`
 * (the sidebar link, the dashboard cards) reopens where they left off rather
 * than snapping back to the default.
 *
 * A cookie rather than localStorage because the page is server-rendered: the
 * server can only pick the right view before the first paint if the preference
 * arrives with the request. It's a display preference, so it is written from
 * the client (`CalendarViewMemory`) and is deliberately not httpOnly.
 */
export const CALENDAR_VIEW_COOKIE = "dragonhub_calendar_view";

/**
 * The cookie for one *particular* calendar. Every grid in the app shares these
 * view components, and "I like the month grid on the school calendar" says
 * nothing about how someone wants to read a committee's schedule — so each
 * surface remembers its own choice under its own scope.
 *
 * Unscoped is the school calendar, so its existing cookies keep working.
 */
export function calendarViewCookie(scope?: string): string {
  return scope ? `${CALENDAR_VIEW_COOKIE}_${scope}` : CALENDAR_VIEW_COOKIE;
}

/** A school year and then some — long enough that it just stays chosen. */
export const CALENDAR_VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseCalendarView(value: string | undefined): CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView)
    ? (value as CalendarView)
    : DEFAULT_CALENDAR_VIEW;
}

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  list: "List",
  week: "Week",
  month: "Month",
  year: "Year",
};

// ─── The event shape the grid renders ────────────────────────────────────────

/**
 * A calendar row flattened for rendering, with its enhancements folded in.
 *
 * Instants are ISO strings rather than `Date`s because these cross the
 * server/client boundary into the grid components, and Next would serialize
 * them anyway — being explicit keeps the type honest about what arrives.
 */
/**
 * The minimum a thing needs to be placed on the grid — and the *only* fields
 * the layout functions below read.
 *
 * Everything in this module that decides a cell is generic over this, so the
 * grids can lay out anything dated: a synced Google event, a Meet the Masters
 * slot, whatever comes next. A concrete item type extends it with the fields
 * its own renderer needs, and the grid never looks at those.
 */
export interface CalendarItem {
  id: string;
  title: string;
  /** ISO instant. */
  startTime: string;
  /** ISO instant. For all-day events this is Google's *exclusive* end. */
  endTime: string | null;
  allDay: boolean;
  /** IANA zone the item was authored in; null on pre-migration rows. */
  timeZone: string | null;
}

/** A row from `calendar_events` — the school calendar's own item type. */
export interface CalendarViewEvent extends CalendarItem {
  description: string | null;
  location: string | null;
  eventType: string | null;
  calendarSource: string | null;
  calendarName: string | null;
  hasPtaNotes: boolean;
  flyerCount: number;
}

/**
 * The zone an event's day should be decided and rendered in. All-day rows are
 * pinned to UTC — see the module comment.
 */
export function eventTimeZone(
  event: Pick<CalendarItem, "allDay" | "timeZone">,
  schoolTimeZone: string
): string {
  return event.allDay ? "UTC" : resolveTimeZone(event.timeZone, schoolTimeZone);
}

// ─── Bucketing events into days ──────────────────────────────────────────────

/**
 * A multi-day event occupies one cell per day it covers, but a bad end date
 * (Google has produced year-3000 ends on corrupted recurring events) would
 * otherwise expand a single row into an unbounded run of cells. Two years is
 * far past anything a school calendar means and well short of hanging a render.
 */
const MAX_EVENT_SPAN_DAYS = 732;

/**
 * Every day this event appears on, as `"YYYY-MM-DD"` keys in ascending order.
 *
 * A one-day event returns one key; a multi-day event returns one per day so it
 * shows up in each cell it spans. (Repeating the chip rather than drawing a bar
 * across the row is deliberate: continuous bars need interval lane-packing, and
 * a PTA calendar's handful of multi-day events don't earn it.)
 */
export function eventDayKeys(
  event: CalendarItem,
  schoolTimeZone: string
): string[] {
  const zone = eventTimeZone(event, schoolTimeZone);
  const start = new Date(event.startTime);
  if (Number.isNaN(start.getTime())) return [];

  const startKey = zonedDayKey(start, zone);

  // Google's all-day end is exclusive, so this steps it back to the last day
  // actually covered before anything else looks at it.
  const end = inclusiveEndDate(event.endTime, event.allDay);
  if (!end || Number.isNaN(end.getTime())) return [startKey];

  let endKey = zonedDayKey(end, zone);

  // A timed event ending exactly at midnight belongs to the evening it started
  // on, not to the first instant of the next day — a 7pm–12am event is one
  // night, and letting it claim tomorrow's cell reads as a two-day event.
  if (!event.allDay && endKey > startKey) {
    const { hour, minute } = zonedParts(end, zone);
    if (hour === 0 && minute === 0) endKey = addDaysToDateOnly(endKey, -1);
  }

  if (endKey <= startKey) return [startKey];

  const days = [startKey];
  let cursor = startKey;
  while (cursor < endKey && days.length < MAX_EVENT_SPAN_DAYS) {
    cursor = addDaysToDateOnly(cursor, 1);
    days.push(cursor);
  }
  return days;
}

/**
 * Within a day: all-day events first (they're the day's header, not a slot),
 * then by start time, then by title so the order is stable across renders.
 */
function compareWithinDay(a: CalendarItem, b: CalendarItem): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  const byTime =
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  if (byTime !== 0) return byTime;
  return a.title.localeCompare(b.title);
}

/** Day key → the items on that day, each day's list already ordered. */
export function groupEventsByDay<T extends CalendarItem>(
  events: T[],
  schoolTimeZone: string
): Map<string, T[]> {
  const byDay = new Map<string, T[]>();
  for (const event of events) {
    for (const key of eventDayKeys(event, schoolTimeZone)) {
      const existing = byDay.get(key);
      if (existing) existing.push(event);
      else byDay.set(key, [event]);
    }
  }
  for (const list of byDay.values()) list.sort(compareWithinDay);
  return byDay;
}

// ─── Collapsing the same meeting synced from several calendars ───────────────

/**
 * The same meeting on two Google calendars arrives as two rows with different
 * ids, so it would render as two chips in the same cell.
 *
 * Enhancements are keyed to a specific copy's id — a board member can attach a
 * flyer to one copy and PTA notes to the other — so the copies are merged
 * rather than one being dropped, and the survivor is whichever copy carries the
 * notes. The detail page merges across copies the same way, so a badge shown
 * here is always backed by data at the URL it links to.
 */
export function dedupeCalendarEvents(
  events: CalendarViewEvent[]
): CalendarViewEvent[] {
  const byKey = new Map<string, CalendarViewEvent>();

  for (const event of events) {
    const key = `${event.title.trim().toLowerCase()}|${new Date(event.startTime).getTime()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...event });
      continue;
    }

    const survivor =
      !existing.hasPtaNotes && event.hasPtaNotes ? { ...event } : existing;
    survivor.hasPtaNotes = existing.hasPtaNotes || event.hasPtaNotes;
    survivor.flyerCount = existing.flyerCount + event.flyerCount;
    byKey.set(key, survivor);
  }

  return Array.from(byKey.values()).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

// ─── Day arithmetic for the grid ─────────────────────────────────────────────

/**
 * Noon rather than midnight, for the same reason `date-only` anchors there: it
 * keeps a day key on the right day under any accessor, in any zone.
 */
function dayToUtcNoon(day: string): Date {
  return new Date(`${day}T12:00:00.000Z`);
}

/** 0 = Sunday, matching the column order the grid renders. */
export function weekdayIndex(day: string): number {
  return dayToUtcNoon(day).getUTCDay();
}

export function startOfWeekDay(day: string): string {
  return addDaysToDateOnly(day, -weekdayIndex(day));
}

export function startOfMonthDay(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function startOfYearDay(day: string): string {
  return `${day.slice(0, 4)}-01-01`;
}

export function daysInMonth(day: string): number {
  const value = dayToUtcNoon(day);
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)
  ).getUTCDate();
}

/** The seven day keys of the week containing `anchor`, Sunday first. */
export function weekDayKeys(anchor: string): string[] {
  const start = startOfWeekDay(anchor);
  return Array.from({ length: 7 }, (_, i) => addDaysToDateOnly(start, i));
}

/**
 * The month grid containing `anchor`, as rows of seven day keys including the
 * leading/trailing days from the neighbouring months.
 *
 * The row count is computed rather than fixed at six, so a February that starts
 * on a Sunday doesn't render an empty final row.
 */
export function monthGridWeeks(anchor: string): string[][] {
  const monthStart = startOfMonthDay(anchor);
  const gridStart = startOfWeekDay(monthStart);
  const rows = Math.ceil(
    (weekdayIndex(monthStart) + daysInMonth(monthStart)) / 7
  );
  return Array.from({ length: rows }, (_, week) =>
    Array.from({ length: 7 }, (_, day) =>
      addDaysToDateOnly(gridStart, week * 7 + day)
    )
  );
}

/** The twelve month-start keys of `anchor`'s year. */
export function monthsOfYear(anchor: string): string[] {
  const year = anchor.slice(0, 4);
  return Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`
  );
}

/** The actual days of one month — no neighbours — for the year view's minis. */
export function daysOfMonth(monthStart: string): string[] {
  return Array.from({ length: daysInMonth(monthStart) }, (_, i) =>
    addDaysToDateOnly(monthStart, i)
  );
}

export function isSameMonth(day: string, monthStart: string): boolean {
  return day.slice(0, 7) === monthStart.slice(0, 7);
}

/**
 * The day a view should be anchored at, so that a URL naming any day inside a
 * period resolves to the same page as the period's first day. Without this,
 * `?view=month&date=2026-08-17` and `…&date=2026-08-01` are two URLs for one
 * grid, and "next month" from each lands somewhere different.
 */
export function normalizeAnchor(view: CalendarView, day: string): string {
  switch (view) {
    case "week":
      return startOfWeekDay(day);
    case "month":
      return startOfMonthDay(day);
    case "year":
      return startOfYearDay(day);
    default:
      return day;
  }
}

/** The anchor `delta` periods forward (or back, when negative). */
export function shiftAnchor(
  view: CalendarView,
  anchor: string,
  delta: number
): string {
  if (view === "week") return addDaysToDateOnly(anchor, delta * 7);

  const value = dayToUtcNoon(anchor);
  if (view === "year") {
    return `${value.getUTCFullYear() + delta}-01-01`;
  }
  // Month. Going through Date.UTC handles the December→January rollover and
  // the fact that month lengths differ.
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + delta, 1, 12)
  )
    .toISOString()
    .slice(0, 10);
}

// ─── Query bounds ────────────────────────────────────────────────────────────

/**
 * A day's worth of slack on each end of the query range.
 *
 * The grid's edges are midnight *in the school's zone*, but an all-day row is
 * stored at midnight *UTC* — up to fourteen hours apart. Without padding, an
 * all-day event sitting on the first or last cell of the grid falls outside the
 * range and silently vanishes from the view. Anything the padding over-fetches
 * simply buckets to a day the grid doesn't render.
 */
const RANGE_PAD_DAYS = 1;

/**
 * The instants to query for, to fill every cell `view` will render.
 *
 * Returns null for the list view, which is unbounded ("everything from now on")
 * rather than a period.
 */
export function calendarRange(
  view: CalendarView,
  anchor: string,
  timeZone: string
): { start: Date; end: Date } | null {
  if (view === "list") return null;

  let firstDay: string;
  let lastDay: string;

  if (view === "week") {
    const days = weekDayKeys(anchor);
    firstDay = days[0];
    lastDay = days[days.length - 1];
  } else if (view === "month") {
    const weeks = monthGridWeeks(anchor);
    firstDay = weeks[0][0];
    lastDay = weeks[weeks.length - 1][6];
  } else {
    firstDay = startOfYearDay(anchor);
    lastDay = `${anchor.slice(0, 4)}-12-31`;
  }

  return {
    start: dayStartInstant(
      addDaysToDateOnly(firstDay, -RANGE_PAD_DAYS),
      timeZone
    ),
    // Exclusive: the day after the last one rendered, plus the same padding.
    end: dayStartInstant(
      addDaysToDateOnly(lastDay, 1 + RANGE_PAD_DAYS),
      timeZone
    ),
  };
}

/** Midnight at the start of `day`, as an instant, in `timeZone`. */
function dayStartInstant(day: string, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return zonedTimeToUtc(year, month, date, 0, 0, timeZone);
}

// ─── Labels ──────────────────────────────────────────────────────────────────

/**
 * "10:30a" / "2p" — the time on a chip, where a full "10:30 AM" would push the
 * title out of a month cell. The day list uses the full form.
 */
export function compactTimeLabel(isoInstant: string, timeZone: string): string {
  const formatted = formatTimeInTimeZone(new Date(isoInstant), timeZone);
  const match = formatted.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return formatted;
  const [, hour, minute, meridiem] = match;
  return `${hour}${minute === "00" ? "" : `:${minute}`}${meridiem[0].toLowerCase()}`;
}

/** The day number as it appears in a grid cell: "1", "17". */
export function dayNumberLabel(day: string): string {
  return String(Number(day.slice(8, 10)));
}

// ─── Links ───────────────────────────────────────────────────────────────────

/** Where a calendar's own URLs live. The school calendar is `/calendar`. */
export const DEFAULT_CALENDAR_BASE_PATH = "/calendar";

export interface CalendarHrefParams {
  view?: CalendarView;
  date?: string;
  type?: string;
  calendar?: string;
  /**
   * The page this calendar is on. Defaults to the school calendar; a committee
   * schedule passes its own workspace path, so the same nav and view toggle
   * drive both without either knowing where it lives.
   */
  basePath?: string;
}

/**
 * A calendar URL carrying the view, the anchored period, and the filters.
 *
 * The view is always named, even when it's the default, because a bare
 * `/calendar` now means "whichever view you last used" — so a link that means
 * a *specific* view has to say which one.
 */
export function buildCalendarHref(params: CalendarHrefParams): string {
  const basePath = params.basePath ?? DEFAULT_CALENDAR_BASE_PATH;
  const query = new URLSearchParams();
  if (params.view) {
    query.set("view", params.view);
  }
  // The anchor only means anything to a grid, and pinning the list view to a
  // date would quietly change what "upcoming" means.
  if (params.date && params.view && params.view !== "list") {
    query.set("date", params.date);
  }
  if (params.type) query.set("type", params.type);
  if (params.calendar) query.set("calendar", params.calendar);

  const search = query.toString();
  return search ? `${basePath}?${search}` : basePath;
}

/**
 * The `?from=` value an event link carried, if it is safe to render as a back
 * link — otherwise the plain calendar.
 *
 * This value comes from the URL and becomes an `href`, so it has to be a path
 * inside this app: `//evil.example` is a protocol-relative URL that would make
 * "Back to Calendar" leave the site, and `/calendarish` isn't this page.
 */
export function safeCalendarBackHref(
  value: string | undefined,
  basePath: string = DEFAULT_CALENDAR_BASE_PATH
): string {
  const fallback = basePath;
  if (!value || value.startsWith("//") || !value.startsWith(fallback)) {
    return fallback;
  }
  const next = value.charAt(fallback.length);
  return !next || next === "?" || next === "/" ? value : fallback;
}

/** Whether a `?date=` value is a day key we can safely anchor on. */
export function isValidDayKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Rejects "2026-02-31", which passes the pattern but isn't a day: the
  // round-trip through Date normalizes it to March 3 and wouldn't match.
  return toDateOnly(dayToUtcNoon(value)) === value;
}

// ─── Shared styling ──────────────────────────────────────────────────────────

/**
 * One definition of what each event type looks like, so a chip in the month
 * grid, a row in the week view and a card in the list can't drift apart.
 */
export const EVENT_TYPE_COLORS: Record<string, string> = {
  classroom: "bg-dragon-blue-100 text-dragon-blue-700",
  pta: "bg-dragon-gold-100 text-dragon-gold-700",
  school: "bg-muted text-muted-foreground",
};

/** The solid version, for the dots a mobile month cell shows instead of chips. */
export const EVENT_TYPE_DOTS: Record<string, string> = {
  classroom: "bg-dragon-blue-500",
  pta: "bg-dragon-gold-500",
  school: "bg-muted-foreground",
};

export function eventTypeColor(eventType: string | null): string {
  return EVENT_TYPE_COLORS[eventType ?? ""] ?? EVENT_TYPE_COLORS.school;
}

export function eventTypeDot(eventType: string | null): string {
  return EVENT_TYPE_DOTS[eventType ?? ""] ?? EVENT_TYPE_DOTS.school;
}
