/**
 * ← August 2026 → , plus a "Today" escape hatch.
 *
 * "Today" is the school's today, resolved on the server — on Vercel the process
 * is already tomorrow from 6pm Mountain onward, so a nav built from the
 * runtime's clock would send a Denver parent to the wrong month all evening.
 *
 * Links or buttons, for the same reason as `CalendarViewToggle` — see its
 * comment, including why this module carries no `"use client"`.
 */

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  normalizeAnchor,
  shiftAnchor,
  startOfMonthDay,
  weekDayKeys,
  type CalendarView,
} from "@/lib/calendar-view";
import { formatDateOnly, formatDateOnlyRange } from "@/lib/date-only";

interface CalendarPeriodNavProps {
  view: CalendarView;
  anchor: string;
  /** Today in the school's zone, as a day key. */
  today: string;
  /** Link mode: the URL for a given anchor day. */
  hrefFor?: (date: string) => string;
  /** Button mode, for a calendar whose period is client state. */
  onSelect?: (date: string) => void;
}

/** "August 2026" / "Aug 9 - 15, 2026" / "2026" */
export function periodLabel(view: CalendarView, anchor: string): string {
  if (view === "week") {
    const days = weekDayKeys(anchor);
    return formatDateOnlyRange(days[0], days[days.length - 1], {
      month: "short",
      year: true,
    });
  }
  if (view === "year") return anchor.slice(0, 4);
  return formatDateOnly(startOfMonthDay(anchor), {
    month: "long",
    year: "numeric",
  });
}

const CONTROL_CLASS =
  "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground rounded-md border transition-colors";

export function CalendarPeriodNav({
  view,
  anchor,
  today,
  hrefFor,
  onSelect,
}: CalendarPeriodNavProps) {
  const isCurrentPeriod = normalizeAnchor(view, today) === anchor;

  /** One control, rendered as whichever navigation mode the caller chose. */
  const control = (
    date: string,
    className: string,
    label: string,
    children: React.ReactNode
  ) =>
    hrefFor ? (
      <Link href={hrefFor(date)} aria-label={label} className={className}>
        {children}
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => onSelect?.(date)}
        aria-label={label}
        className={className}
      >
        {children}
      </button>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {control(
          shiftAnchor(view, anchor, -1),
          `${CONTROL_CLASS} p-1.5`,
          `Previous ${view}`,
          <ChevronLeft className="h-4 w-4" />
        )}
        {control(
          shiftAnchor(view, anchor, 1),
          `${CONTROL_CLASS} p-1.5`,
          `Next ${view}`,
          <ChevronRight className="h-4 w-4" />
        )}
      </div>

      <h2 className="text-lg font-semibold">{periodLabel(view, anchor)}</h2>

      {!isCurrentPeriod &&
        control(
          normalizeAnchor(view, today),
          `${CONTROL_CLASS} px-2.5 py-1 text-sm font-medium`,
          "Jump to today",
          "Today"
        )}
    </div>
  );
}
