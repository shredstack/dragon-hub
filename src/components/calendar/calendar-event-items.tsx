/**
 * The two shapes an event takes inside a grid: a chip that fits in a month
 * cell, and a row that fills a day's list.
 *
 * Both live here so the month, week and year views render an event identically
 * — and so the "has PTA notes / has flyers" markers stay in one place, since
 * those are the whole reason a parent taps through to the detail page.
 */

import Link from "next/link";
import { FileText, Image as ImageIcon, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  compactTimeLabel,
  eventTimeZone,
  eventTypeColor,
  type CalendarViewEvent,
} from "@/lib/calendar-view";
import { formatTimeInTimeZone, inclusiveEndDate } from "@/lib/time-zone";

interface EventItemProps {
  event: CalendarViewEvent;
  schoolTimeZone: string;
  /** Carried onto the detail link so "back" can return to the right view. */
  backHref?: string;
}

function detailHref(event: CalendarViewEvent, backHref?: string): string {
  return backHref
    ? `/calendar/${event.id}?from=${encodeURIComponent(backHref)}`
    : `/calendar/${event.id}`;
}

/** A single line in a month or week cell. */
export function CalendarEventChip({
  event,
  schoolTimeZone,
  backHref,
}: EventItemProps) {
  const zone = eventTimeZone(event, schoolTimeZone);
  const hasEnhancements = event.hasPtaNotes || event.flyerCount > 0;

  return (
    <Link
      href={detailHref(event, backHref)}
      title={event.title}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80",
        eventTypeColor(event.eventType)
      )}
    >
      {!event.allDay && (
        <span className="shrink-0 font-medium opacity-75">
          {compactTimeLabel(event.startTime, zone)}
        </span>
      )}
      <span className="truncate">{event.title}</span>
      {hasEnhancements && (
        <span
          aria-hidden
          className="ml-auto shrink-0 text-[0.65rem] leading-none opacity-70"
        >
          ●
        </span>
      )}
    </Link>
  );
}

/**
 * The week view's column form: taller than a chip and allowed to wrap, because
 * a seventh of the screen is too narrow to truncate a title into anything
 * readable.
 */
export function CalendarEventBlock({
  event,
  schoolTimeZone,
  backHref,
}: EventItemProps) {
  const zone = eventTimeZone(event, schoolTimeZone);
  const hasEnhancements = event.hasPtaNotes || event.flyerCount > 0;

  return (
    <Link
      href={detailHref(event, backHref)}
      className={cn(
        "block rounded p-1.5 text-xs transition-opacity hover:opacity-80",
        eventTypeColor(event.eventType)
      )}
    >
      <span className="flex items-center gap-1 font-medium opacity-75">
        {event.allDay ? "All day" : formatTimeInTimeZone(event.startTime, zone)}
        {hasEnhancements && (
          <span aria-hidden className="text-[0.65rem] leading-none">
            ●
          </span>
        )}
      </span>
      <span className="line-clamp-3 font-medium">{event.title}</span>
      {event.location && (
        <span className="mt-0.5 line-clamp-1 opacity-75">{event.location}</span>
      )}
    </Link>
  );
}

/** The fuller form, for a day panel or the week view's mobile agenda. */
export function CalendarEventRow({
  event,
  schoolTimeZone,
  backHref,
}: EventItemProps) {
  const zone = eventTimeZone(event, schoolTimeZone);
  const end = inclusiveEndDate(event.endTime, event.allDay);
  // Only show an end time when it's on the same day — a multi-day event's end
  // belongs on the detail page, not appended to today's slot.
  const showEnd =
    !event.allDay &&
    end &&
    end.getTime() > new Date(event.startTime).getTime() &&
    formatTimeInTimeZone(end, zone) !==
      formatTimeInTimeZone(event.startTime, zone);

  return (
    <Link
      href={detailHref(event, backHref)}
      className="border-border bg-card hover:bg-muted/50 flex items-start gap-3 rounded-lg border p-3 transition-colors"
    >
      <span
        className={cn(
          "mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium tabular-nums",
          eventTypeColor(event.eventType)
        )}
      >
        {event.allDay ? "All day" : formatTimeInTimeZone(event.startTime, zone)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-medium">{event.title}</p>
          {event.hasPtaNotes && (
            <span title="Has PTA notes">
              <FileText className="text-dragon-gold-500 h-3.5 w-3.5 shrink-0" />
            </span>
          )}
          {event.flyerCount > 0 && (
            <span
              title={`${event.flyerCount} flyer${event.flyerCount > 1 ? "s" : ""}`}
              className="flex shrink-0 items-center gap-0.5"
            >
              <ImageIcon className="text-dragon-blue-500 h-3.5 w-3.5" />
              {event.flyerCount > 1 && (
                <span className="text-dragon-blue-500 text-xs">
                  {event.flyerCount}
                </span>
              )}
            </span>
          )}
        </div>

        {showEnd && (
          <p className="text-muted-foreground text-xs">
            until {formatTimeInTimeZone(end, zone)}
          </p>
        )}

        {event.location && (
          <p className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{event.location}</span>
          </p>
        )}

        {event.calendarName && (
          <p className="text-muted-foreground/70 mt-1 truncate text-xs">
            From: {event.calendarName}
          </p>
        )}
      </div>
    </Link>
  );
}

/** Every event on one day, or a quiet note that there aren't any. */
export function CalendarDayList({
  events,
  schoolTimeZone,
  backHref,
  emptyLabel = "No events this day.",
}: {
  events: CalendarViewEvent[];
  schoolTimeZone: string;
  backHref?: string;
  emptyLabel?: string;
}) {
  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <CalendarEventRow
          key={event.id}
          event={event}
          schoolTimeZone={schoolTimeZone}
          backHref={backHref}
        />
      ))}
    </div>
  );
}
