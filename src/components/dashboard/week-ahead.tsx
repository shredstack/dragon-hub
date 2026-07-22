import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { format } from "date-fns";
import type { UpcomingEvent } from "@/lib/dashboard-data";
import { AllClear, SectionCard, SectionHeading } from "./section";

/**
 * The next few things happening at school.
 *
 * Deliberately a short list rather than a count: "47 upcoming events" tells a
 * parent nothing they can act on, while the next five let them notice the
 * Tuesday assembly they'd have missed.
 */
export function WeekAhead({ events }: { events: UpcomingEvent[] }) {
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
                    {format(event.startTime, "MMM")}
                  </span>
                  <span className="text-base font-bold leading-tight">
                    {format(event.startTime, "d")}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {event.title}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    {format(event.startTime, "EEE, h:mm a")}
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
