/**
 * The year, as twelve mini-months tinted by how busy each day is.
 *
 * A full-detail year grid would be 365 unreadable cells, so this answers the
 * question a year view is actually asked — *when is this school busy* — and
 * hands off to the month view for the detail. Every day is a link, so the
 * planning move ("what did we do last October?") is one click from here.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  buildCalendarHref,
  dayNumberLabel,
  daysOfMonth,
  groupEventsByDay,
  monthsOfYear,
  weekdayIndex,
  type CalendarViewEvent,
} from "@/lib/calendar-view";
import { formatDateOnly, formatLongDateOnly } from "@/lib/date-only";

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Three steps is as much as a 20px cell can express. The scale is the app's
 * blue rather than the per-type colors: at this size the question is density,
 * and mixing four hues into it would just look like noise.
 */
function densityClass(count: number): string {
  if (count === 0) return "text-muted-foreground";
  if (count === 1) return "bg-dragon-blue-100 text-dragon-blue-700";
  if (count <= 3) return "bg-dragon-blue-200 text-dragon-blue-700";
  return "bg-dragon-blue-300 font-medium text-dragon-blue-800";
}

interface CalendarYearViewProps {
  events: CalendarViewEvent[];
  /** Any day in the year being shown. */
  anchor: string;
  /** Today in the school's zone. */
  today: string;
  schoolTimeZone: string;
  type: string | undefined;
  calendar: string | undefined;
}

export function CalendarYearView({
  events,
  anchor,
  today,
  schoolTimeZone,
  type,
  calendar,
}: CalendarYearViewProps) {
  const byDay = groupEventsByDay(events, schoolTimeZone);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {monthsOfYear(anchor).map((monthStart) => {
        const days = daysOfMonth(monthStart);
        const monthHref = buildCalendarHref({
          view: "month",
          date: monthStart,
          type,
          calendar,
        });
        const monthCount = days.reduce(
          (total, day) => total + (byDay.get(day)?.length ?? 0),
          0
        );

        return (
          <div
            key={monthStart}
            className="border-border bg-card rounded-lg border p-3"
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <Link
                href={monthHref}
                className="hover:text-primary font-semibold"
              >
                {formatDateOnly(monthStart, { month: "long" })}
              </Link>
              {monthCount > 0 && (
                <span className="text-muted-foreground text-xs">
                  {monthCount} event{monthCount === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {WEEKDAY_INITIALS.map((initial, index) => (
                <div
                  key={index}
                  className="text-muted-foreground/70 text-center text-[0.65rem] font-medium"
                >
                  {initial}
                </div>
              ))}

              {/* Blanks so the 1st lands under its weekday. */}
              {Array.from({ length: weekdayIndex(monthStart) }, (_, i) => (
                <div key={`pad-${i}`} />
              ))}

              {days.map((day) => {
                const count = byDay.get(day)?.length ?? 0;
                return (
                  <Link
                    key={day}
                    href={buildCalendarHref({
                      view: "month",
                      date: day,
                      type,
                      calendar,
                    })}
                    title={`${formatLongDateOnly(day)} — ${count} event${count === 1 ? "" : "s"}`}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded text-[0.65rem] tabular-nums transition-opacity hover:opacity-70",
                      densityClass(count),
                      day === today && "ring-primary ring-2 ring-offset-1"
                    )}
                  >
                    {dayNumberLabel(day)}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
