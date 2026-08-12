/**
 * The week.
 *
 * Deliberately *not* a 24-hour time grid. Google draws one because a work
 * calendar is dense enough to need it; a PTA week is three events and two
 * all-day spirit days, so an hour grid would be a screen of empty rows with the
 * content squeezed into a strip. Instead each day is a column listing its
 * events in time order — the same at-a-glance shape, without the whitespace.
 *
 * On a phone the columns become an agenda: seven columns of readable text don't
 * exist at 375px, and days with nothing on them are dropped rather than
 * rendering a screen of "No events".
 */

import { cn } from "@/lib/utils";
import {
  dayNumberLabel,
  groupEventsByDay,
  weekDayKeys,
  type CalendarViewEvent,
} from "@/lib/calendar-view";
import { formatDateOnly, formatWeekdayDateOnly } from "@/lib/date-only";
import { Calendar } from "lucide-react";
import {
  CalendarDayList,
  CalendarEventBlock,
} from "@/components/calendar/calendar-event-items";

interface CalendarWeekViewProps {
  events: CalendarViewEvent[];
  /** Any day in the week being shown. */
  anchor: string;
  /** Today in the school's zone. */
  today: string;
  schoolTimeZone: string;
  backHref: string;
}

export function CalendarWeekView({
  events,
  anchor,
  today,
  schoolTimeZone,
  backHref,
}: CalendarWeekViewProps) {
  const days = weekDayKeys(anchor);
  const byDay = groupEventsByDay(events, schoolTimeZone);
  const daysWithEvents = days.filter((day) => byDay.has(day));

  return (
    <div>
      {/* ── Desktop: seven columns ── */}
      <div className="border-border bg-card hidden overflow-hidden rounded-lg border md:grid md:grid-cols-7">
        {days.map((day) => {
          const dayEvents = byDay.get(day) ?? [];
          const isToday = day === today;

          return (
            <div
              key={day}
              className={cn(
                "border-border min-h-48 border-r p-2 last:border-r-0",
                isToday && "bg-primary/5"
              )}
            >
              <div className="mb-2 text-center">
                <p className="text-muted-foreground text-xs font-medium uppercase">
                  {formatDateOnly(day, { weekday: "short" })}
                </p>
                <p
                  className={cn(
                    "mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm tabular-nums",
                    isToday &&
                      "bg-primary text-primary-foreground font-semibold"
                  )}
                >
                  {dayNumberLabel(day)}
                </p>
              </div>

              <div className="space-y-1">
                {dayEvents.map((event) => (
                  <CalendarEventBlock
                    key={event.id}
                    event={event}
                    schoolTimeZone={schoolTimeZone}
                    backHref={backHref}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Mobile: agenda ── */}
      <div className="space-y-4 md:hidden">
        {daysWithEvents.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
            <Calendar className="text-muted-foreground mb-3 h-10 w-10" />
            <p className="text-muted-foreground">No events this week.</p>
          </div>
        ) : (
          daysWithEvents.map((day) => (
            <div key={day}>
              <h3
                className={cn(
                  "mb-2 text-sm font-semibold",
                  day === today && "text-primary"
                )}
              >
                {formatWeekdayDateOnly(day)}
                {day === today && " · Today"}
              </h3>
              <CalendarDayList
                events={byDay.get(day) ?? []}
                schoolTimeZone={schoolTimeZone}
                backHref={backHref}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
