"use client";

/**
 * The month grid.
 *
 * Two renderings rather than one responsive grid, following the card-on-mobile
 * pattern the rest of the app uses for tables: a phone cannot show event titles
 * in a 7-column cell, so it shows density (dots) and reveals the day's events
 * in a panel underneath. Desktop shows the chips inline and only opens the
 * panel when someone asks for a day.
 *
 * Day selection is local state rather than a URL param on purpose — tapping
 * around the month is browsing, and a server round trip per tap would make it
 * feel broken. The *period* stays in the URL, so a shared link still lands on
 * the right month.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  dayNumberLabel,
  eventTypeDot,
  groupEventsByDay,
  isSameMonth,
  monthGridWeeks,
  startOfMonthDay,
  type CalendarViewEvent,
} from "@/lib/calendar-view";
import { formatLongDateOnly } from "@/lib/date-only";
import {
  CalendarDayList,
  CalendarEventChip,
} from "@/components/calendar/calendar-event-items";

/** How many chips fit in a desktop cell before it collapses to "+N more". */
const MAX_CHIPS_PER_CELL = 3;
/** Dots are a density hint, not a count — past three they stop meaning much. */
const MAX_DOTS_PER_CELL = 3;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CalendarMonthViewProps {
  events: CalendarViewEvent[];
  /** First day of the month being shown. */
  anchor: string;
  /** Today in the school's zone. */
  today: string;
  schoolTimeZone: string;
  backHref: string;
}

export function CalendarMonthView({
  events,
  anchor,
  today,
  schoolTimeZone,
  backHref,
}: CalendarMonthViewProps) {
  const monthStart = startOfMonthDay(anchor);
  const weeks = useMemo(() => monthGridWeeks(monthStart), [monthStart]);
  const byDay = useMemo(
    () => groupEventsByDay(events, schoolTimeZone),
    [events, schoolTimeZone]
  );

  // Open on today when today is in view, so the common case ("what's on this
  // week") needs no taps. Otherwise the month's first day with anything on it.
  const defaultDay = useMemo(() => {
    if (isSameMonth(today, monthStart)) return today;
    const withEvents = weeks
      .flat()
      .find((day) => isSameMonth(day, monthStart) && byDay.has(day));
    return withEvents ?? monthStart;
  }, [today, monthStart, weeks, byDay]);

  const [selectedDay, setSelectedDay] = useState(defaultDay);
  // The panel is always up on mobile; on desktop it appears only once someone
  // picks a day, since the chips already say what's happening.
  const [openedOnDesktop, setOpenedOnDesktop] = useState(false);

  // A month change remounts nothing, so re-seed the selection when the grid
  // moves out from under it.
  const [seededFor, setSeededFor] = useState(monthStart);
  if (seededFor !== monthStart) {
    setSeededFor(monthStart);
    setSelectedDay(defaultDay);
    setOpenedOnDesktop(false);
  }

  const selectDay = (day: string) => {
    setSelectedDay(day);
    setOpenedOnDesktop(true);
  };

  return (
    <div>
      {/* The grid draws its own cell borders, so the wrapper clips the last
          column's and last row's against its rounded edge. */}
      <div className="border-border bg-card overflow-hidden rounded-lg border">
        {/* Weekday header, shared by both grids */}
        <div className="border-border grid grid-cols-7 border-b">
          {WEEKDAYS.map((label) => (
            <div
              key={label}
              className="text-muted-foreground px-1 py-2 text-center text-xs font-medium"
            >
              <span className="md:hidden">{label.slice(0, 1)}</span>
              <span className="hidden md:inline">{label}</span>
            </div>
          ))}
        </div>

        {/* ── Mobile: density grid ── */}
        <div className="grid grid-cols-7 md:hidden">
          {weeks.flat().map((day) => {
            const dayEvents = byDay.get(day) ?? [];
            const inMonth = isSameMonth(day, monthStart);
            const isToday = day === today;
            const isSelected = day === selectedDay;

            return (
              <button
                key={day}
                type="button"
                onClick={() => selectDay(day)}
                aria-pressed={isSelected}
                aria-label={`${formatLongDateOnly(day)}, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
                className={cn(
                  "border-border flex min-h-14 flex-col items-center gap-1 border-r border-b py-1.5 transition-colors",
                  !inMonth && "bg-muted/30",
                  isSelected && "bg-primary/10"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums",
                    !inMonth && "text-muted-foreground/50",
                    isToday &&
                      "bg-primary text-primary-foreground font-semibold",
                    !isToday && isSelected && "font-semibold"
                  )}
                >
                  {dayNumberLabel(day)}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {dayEvents.slice(0, MAX_DOTS_PER_CELL).map((event) => (
                    <span
                      key={event.id}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        eventTypeDot(event.eventType)
                      )}
                    />
                  ))}
                  {dayEvents.length > MAX_DOTS_PER_CELL && (
                    <span className="text-muted-foreground text-[0.6rem] leading-none">
                      +
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Desktop: chips in the cell ── */}
        <div className="hidden md:block">
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7">
              {week.map((day) => {
                const dayEvents = byDay.get(day) ?? [];
                const inMonth = isSameMonth(day, monthStart);
                const isToday = day === today;
                const overflow = dayEvents.length - MAX_CHIPS_PER_CELL;

                return (
                  <div
                    key={day}
                    className={cn(
                      "border-border min-h-28 border-r border-b p-1",
                      !inMonth && "bg-muted/30",
                      day === selectedDay && openedOnDesktop && "bg-primary/5"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => selectDay(day)}
                      className={cn(
                        "hover:bg-muted mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums transition-colors",
                        !inMonth && "text-muted-foreground/50",
                        isToday &&
                          "bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                      )}
                    >
                      {dayNumberLabel(day)}
                    </button>

                    <div className="space-y-0.5">
                      {dayEvents.slice(0, MAX_CHIPS_PER_CELL).map((event) => (
                        <CalendarEventChip
                          key={event.id}
                          event={event}
                          schoolTimeZone={schoolTimeZone}
                          backHref={backHref}
                        />
                      ))}
                      {overflow > 0 && (
                        <button
                          type="button"
                          onClick={() => selectDay(day)}
                          className="text-muted-foreground hover:text-foreground w-full px-1.5 text-left text-xs"
                        >
                          +{overflow} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selected day */}
      <div className={cn("mt-4", !openedOnDesktop && "md:hidden")}>
        <h3 className="mb-2 text-sm font-semibold">
          {formatLongDateOnly(selectedDay)}
        </h3>
        <CalendarDayList
          events={byDay.get(selectedDay) ?? []}
          schoolTimeZone={schoolTimeZone}
          backHref={backHref}
        />
      </div>
    </div>
  );
}
