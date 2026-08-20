/**
 * The shape Our Events sends to the browser — client-safe, so the page, the
 * cards and the server action all describe the same thing.
 *
 * This file is the readable form of §8's security boundary. **A field that
 * isn't here is not in the projection**, and that is deliberate:
 * `getCatalog()` returns `...entry` — every column, tips and budget and vendor
 * notes included — so the member path is a separate function with an explicit
 * `columns:` list precisely so that adding a column to `event_catalog` later
 * cannot silently publish it to the school.
 */

import type { CapacityState } from "@/lib/waitlist-shared";
import type { ReactionTally } from "@/lib/event-reactions-shared";
import { compareDateOnly, formatWeekdayDateOnly } from "@/lib/date-only";
import { monthLabel } from "@/lib/constants";

/** What a member may know about this year's run, and no more. */
export interface DirectoryPlan {
  id: string;
  /**
   * A calendar day, as `YYYY-MM-DD`. Never a timestamp: "Field Day is May 15"
   * is May 15 for everybody, and `new Date(value)` in a browser west of UTC
   * renders it as the 14th. See src/lib/date-only.ts.
   */
  eventDate: string | null;
  /**
   * True for `approved` / `pending_approval` / `completed`.
   *
   * Filtered rather than raw: a parent should never learn from this page that
   * the board turned an event down, so `draft` and `rejected` send `false` and
   * say nothing at all.
   */
  planningStarted: boolean;
  /**
   * Who to ask about the Fun Run — the question this page exists to answer.
   * Names only; lead *emails* are not shown, because the request button is the
   * contact channel.
   */
  leadNames: string[];
}

export type EventHelpRequestStatus =
  | "pending"
  | "approved"
  | "waitlisted"
  | "declined";

export interface MyHelpRequest {
  id: string;
  status: EventHelpRequestStatus;
  /** 1-based, only for `waitlisted`. */
  position: number | null;
  /**
   * Shown to the requester when the decider wrote one. Absence is not "no
   * reason given" — it's "the board said yes to someone else"; the copy on the
   * panel handles that rather than inventing a sentence here.
   */
  decisionNote: string | null;
}

export type MemberInterestLevel = "help" | "lead";

export interface DirectoryEntry {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  iconEmoji: string | null;
  imageUrl: string | null;
  description: string | null;
  /** "What you'd actually be doing" — the single biggest recruiting fact. */
  volunteerResponsibilities: string | null;
  timeCommitment: string | null;
  /**
   * "about 20 helpers". Shown; `estimatedBudget` is not — "$2,400" invites a
   * conversation the board should be having in its own room.
   */
  estimatedVolunteers: string | null;
  typicalMonth: number | null;
  timingNote: string | null;
  tags: string[] | null;

  plan: DirectoryPlan | null;
  /**
   * Seats on the team. `limit: null` is uncapped, which renders as nothing at
   * all rather than as "unlimited" — `capacityCountLabel()` already returns
   * null for it.
   */
  capacity: CapacityState;

  reactions: ReactionTally[];
  /**
   * Who reacted, per emoji — present only when the school turned
   * `showReactorNames` on. Absent from the payload otherwise: a setting that
   * hides names in the component while the response still carries them is not
   * a setting, it's a CSS rule.
   */
  reactorNames?: Record<string, string[]>;

  myInterest: MemberInterestLevel | null;
  myInterestNote: string | null;
  myRequest: MyHelpRequest | null;
  /** Already on this year's team — the request panel says so instead of asking. */
  onTeam: boolean;
}

/** The stat row in the hero: genuinely fun, and genuinely true. */
export interface DirectoryStats {
  events: number;
  reactions: number;
  handsUp: number;
}

export type DirectoryView = "timeline" | "grid";

export function parseDirectoryView(value: string | undefined): DirectoryView {
  return value === "grid" ? "grid" : "timeline";
}

/**
 * Months in *school-year* order — August first, not January.
 *
 * A timeline that starts in January puts Back to School Night at the bottom and
 * Field Day at the top, which is exactly backwards from how a parent thinks
 * about the year in front of them.
 */
export const SCHOOL_YEAR_MONTH_ORDER = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7];

export function schoolYearMonthRank(month: number | null | undefined): number {
  if (!month) return SCHOOL_YEAR_MONTH_ORDER.length; // "Anytime", always last
  const rank = SCHOOL_YEAR_MONTH_ORDER.indexOf(month);
  return rank === -1 ? SCHOOL_YEAR_MONTH_ORDER.length : rank;
}

/**
 * The one line of timing a card shows: a real date when this year's plan has
 * one, the typical month otherwise.
 *
 * `formatWeekdayDateOnly` and never `new Date(value)` — an event date is a
 * calendar day, and `new Date("2026-05-15")` is midnight **UTC**, which renders
 * as May 14th in Denver. That is exactly the trap `src/lib/date-only.ts` exists
 * for, and it bites hardest on the page most parents read from a phone.
 */
export function eventTimingLine(entry: DirectoryEntry): string | null {
  if (entry.plan?.eventDate) return formatWeekdayDateOnly(entry.plan.eventDate);
  const month = monthLabel(entry.typicalMonth);
  if (month && entry.timingNote) return `${month} — ${entry.timingNote}`;
  return month ?? entry.timingNote ?? null;
}

/**
 * Up to `limit` events to put at the top under "Coming up next".
 *
 * A dated plan wins outright and sorts by its date; everything else falls back
 * to the typical month, read forward from *today in the school's zone* — on
 * Vercel a Denver school is already tomorrow from 6pm onward, so `today` is
 * passed in from `todayDateOnly(await getSchoolTimeZone(schoolId))` rather than
 * taken from the server's clock.
 */
export function comingUpNext(
  entries: DirectoryEntry[],
  today: string,
  limit = 3
): DirectoryEntry[] {
  const currentMonth = Number(today.slice(5, 7));

  const dated = entries
    .filter((e) => e.plan?.eventDate && compareDateOnly(e.plan.eventDate, today) >= 0)
    .sort((a, b) => compareDateOnly(a.plan!.eventDate, b.plan!.eventDate));

  // Months ahead of this one, wrapping through the end of the calendar year so
  // that in November "January" is two months away rather than ten months past.
  const monthsAway = (month: number) => (month - currentMonth + 12) % 12;

  const undated = entries
    .filter((e) => !e.plan?.eventDate && e.typicalMonth)
    .sort((a, b) => monthsAway(a.typicalMonth!) - monthsAway(b.typicalMonth!));

  return [...dated, ...undated].slice(0, limit);
}

/**
 * Free-text search over the fields a parent would type into it.
 *
 * Client-side on purpose: the whole directory is one page of a few dozen rows,
 * and a round trip per keystroke on a parent's cell connection is worse than
 * the filtering being approximate.
 */
export function matchesEventQuery(entry: DirectoryEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    entry.title,
    entry.description,
    entry.volunteerResponsibilities,
    entry.timingNote,
    ...(entry.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
