"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { RESOURCE_SOURCES, type ResourceSource } from "@/lib/constants";
import { buildCalendarHref, type CalendarView } from "@/lib/calendar-view";

interface CalendarFilterProps {
  currentType: string | undefined;
  currentCalendar: string | undefined;
  calendarOptions: { calendarId: string; name: string | null; calendarType: ResourceSource | null }[];
  /**
   * Carried through every filter link, so narrowing to "PTA" doesn't drop the
   * reader back into the list view at today's date.
   */
  view: CalendarView;
  anchor: string;
}

const EVENT_TYPES = ["classroom", "pta", "school"];

export function CalendarFilter({
  currentType,
  currentCalendar,
  calendarOptions,
  view,
  anchor,
}: CalendarFilterProps) {
  const buildHref = (type: string | undefined, calendar: string | undefined) =>
    buildCalendarHref({ view, date: anchor, type, calendar });

  return (
    <div className="mb-4 space-y-2">
      {/* Type Filter */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={buildHref(undefined, currentCalendar)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            !currentType
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          All Types
        </Link>
        {EVENT_TYPES.map((t) => (
          <Link
            key={t}
            href={buildHref(t, currentCalendar)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
              currentType === t
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {t}
          </Link>
        ))}
      </div>

      {/* Calendar Source Filter - only show if there are multiple calendars */}
      {calendarOptions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={buildHref(currentType, undefined)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              !currentCalendar
                ? "bg-dragon-blue-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            All Calendars
          </Link>
          {/* PTA Calendars */}
          {calendarOptions.filter((c) => c.calendarType === "pta" || !c.calendarType).length > 0 && (
            <>
              <span className="text-xs font-medium text-muted-foreground">{RESOURCE_SOURCES.pta}:</span>
              {calendarOptions
                .filter((c) => c.calendarType === "pta" || !c.calendarType)
                .map((cal) => (
                  <Link
                    key={cal.calendarId}
                    href={buildHref(currentType, cal.calendarId)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      currentCalendar === cal.calendarId
                        ? "bg-dragon-gold-500 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {cal.name || cal.calendarId}
                  </Link>
                ))}
            </>
          )}
          {/* School Calendars */}
          {calendarOptions.filter((c) => c.calendarType === "school").length > 0 && (
            <>
              <span className="ml-2 text-xs font-medium text-muted-foreground">{RESOURCE_SOURCES.school}:</span>
              {calendarOptions
                .filter((c) => c.calendarType === "school")
                .map((cal) => (
                  <Link
                    key={cal.calendarId}
                    href={buildHref(currentType, cal.calendarId)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      currentCalendar === cal.calendarId
                        ? "bg-dragon-blue-500 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {cal.name || cal.calendarId}
                  </Link>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
