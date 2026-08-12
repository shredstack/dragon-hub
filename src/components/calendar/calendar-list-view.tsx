/**
 * The upcoming-events list — the calendar's original and default view.
 *
 * Unchanged in behaviour from when it lived inline in the page: everything from
 * now forward, newest first, with the PTA's own additions (notes, flyers)
 * flagged so a parent knows there's more than Google's one-line description
 * behind the card.
 */

import Link from "next/link";
import { Calendar, FileText, Image as ImageIcon, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  eventTimeZone,
  eventTypeColor,
  type CalendarViewEvent,
} from "@/lib/calendar-view";
import {
  formatDateInTimeZone,
  formatDateTimeInTimeZone,
} from "@/lib/time-zone";

interface CalendarListViewProps {
  events: CalendarViewEvent[];
  schoolTimeZone: string;
  backHref: string;
}

export function CalendarListView({
  events,
  schoolTimeZone,
  backHref,
}: CalendarListViewProps) {
  if (events.length === 0) {
    return (
      <div className="border-border bg-card flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
        <Calendar className="text-muted-foreground mb-4 h-12 w-12" />
        <p className="text-muted-foreground">No upcoming events.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const zone = eventTimeZone(event, schoolTimeZone);
        const hasEnhancements = event.hasPtaNotes || event.flyerCount > 0;

        return (
          <Link
            key={event.id}
            href={`/calendar/${event.id}?from=${encodeURIComponent(backHref)}`}
            className="border-border bg-card hover:bg-muted/50 block rounded-lg border p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{event.title}</h3>
                  {hasEnhancements && (
                    <div className="flex items-center gap-1">
                      {event.hasPtaNotes && (
                        <span title="Has PTA notes">
                          <FileText className="text-dragon-gold-500 h-4 w-4" />
                        </span>
                      )}
                      {event.flyerCount > 0 && (
                        <span
                          title={`${event.flyerCount} flyer${event.flyerCount > 1 ? "s" : ""}`}
                          className="flex items-center gap-0.5"
                        >
                          <ImageIcon className="text-dragon-blue-500 h-4 w-4" />
                          {event.flyerCount > 1 && (
                            <span className="text-dragon-blue-500 text-xs">
                              {event.flyerCount}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {event.allDay
                    ? formatDateInTimeZone(event.startTime, zone)
                    : formatDateTimeInTimeZone(event.startTime, zone)}
                </p>
                {event.location && (
                  <div className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
                    <MapPin className="h-3.5 w-3.5" />
                    {event.location}
                  </div>
                )}
                {event.description && (
                  <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                    {event.description}
                  </p>
                )}
                {event.calendarName && (
                  <p className="text-muted-foreground/70 mt-1 text-xs">
                    From: {event.calendarName}
                  </p>
                )}
              </div>
              {event.eventType && (
                <span
                  className={cn(
                    "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                    eventTypeColor(event.eventType)
                  )}
                >
                  {event.eventType}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
