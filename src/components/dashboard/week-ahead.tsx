import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import type { UpcomingEvent } from "@/lib/dashboard-data";
import { formatInTimeZone } from "@/lib/time-zone";
import { AllClear, SectionCard, SectionHeading } from "./section";

/**
 * Which zone to render an event in.
 *
 * This component renders on the server, where the process zone is UTC — an
 * evening event formatted without an explicit zone lands on the wrong day, not
 * just at the wrong time. An all-day event is stored as midnight UTC and so has
 * to be read back in UTC.
 */
function eventZone(event: UpcomingEvent, schoolTimeZone: string): string {
  return event.allDay ? "UTC" : (event.timeZone ?? schoolTimeZone);
}

/**
 * The next few things happening at school.
 *
 * Deliberately a short list rather than a count: "47 upcoming events" tells a
 * parent nothing they can act on, while the next five let them notice the
 * Tuesday assembly they'd have missed.
 */
export function WeekAhead({
  events,
  schoolTimeZone,
}: {
  events: UpcomingEvent[];
  /** Fallback for events synced before they carried their own zone. */
  schoolTimeZone: string;
}) {
  return (
    <SectionCard>
      <SectionHeading
        icon={CalendarDays}
        title="Coming up"
        tone="gold"
        href="/calendar"
        linkLabel="Full calendar"
      />

      {events.length === 0 ? (
        <AllClear
          emoji="🗓️"
          message="No events on the calendar yet. Check back soon!"
        />
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/calendar/${event.id}`}
                className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-dragon-gold-300 hover:bg-dragon-gold-50"
              >
                {/* Tear-off calendar page — the date should be scannable
                    without reading the row. */}
                <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-dragon-blue-500 text-white">
                  <span className="text-[10px] font-semibold uppercase leading-none">
                    {formatInTimeZone(event.startTime, eventZone(event, schoolTimeZone), {
                      month: "short",
                    })}
                  </span>
                  <span className="text-base font-bold leading-tight">
                    {formatInTimeZone(event.startTime, eventZone(event, schoolTimeZone), {
                      day: "numeric",
                    })}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {event.title}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    {event.allDay
                      ? formatInTimeZone(event.startTime, eventZone(event, schoolTimeZone), {
                          weekday: "short",
                        })
                      : formatInTimeZone(event.startTime, eventZone(event, schoolTimeZone), {
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                    {event.location && (
                      <>
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
