/**
 * ← August 2026 → , plus a "Today" escape hatch.
 *
 * "Today" is the school's today, resolved on the server — on Vercel the process
 * is already tomorrow from 6pm Mountain onward, so a nav built from the
 * runtime's clock would send a Denver parent to the wrong month all evening.
 */

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildCalendarHref,
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
  type: string | undefined;
  calendar: string | undefined;
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

export function CalendarPeriodNav({
  view,
  anchor,
  today,
  type,
  calendar,
}: CalendarPeriodNavProps) {
  const href = (date: string) =>
    buildCalendarHref({ view, date, type, calendar });

  const isCurrentPeriod = normalizeAnchor(view, today) === anchor;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Link
          href={href(shiftAnchor(view, anchor, -1))}
          aria-label={`Previous ${view}`}
          className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground rounded-md border p-1.5 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Link
          href={href(shiftAnchor(view, anchor, 1))}
          aria-label={`Next ${view}`}
          className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground rounded-md border p-1.5 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <h2 className="text-lg font-semibold">{periodLabel(view, anchor)}</h2>

      {!isCurrentPeriod && (
        <Link
          href={href(normalizeAnchor(view, today))}
          className="border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground rounded-md border px-2.5 py-1 text-sm font-medium transition-colors"
        >
          Today
        </Link>
      )}
    </div>
  );
}
