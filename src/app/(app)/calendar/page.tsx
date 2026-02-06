import { db } from "@/lib/db";
import { calendarEvents, schoolCalendarIntegrations, eventFlyers } from "@/lib/db/schema";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { formatDateTime } from "@/lib/utils";
import { MapPin, Calendar, Image as ImageIcon, FileText } from "lucide-react";
import Link from "next/link";
import { getCurrentSchoolId } from "@/lib/auth-helpers";
import { CalendarFilter } from "@/components/calendar/calendar-filter";
import type { ResourceSource } from "@/lib/constants";

const typeColors: Record<string, string> = {
  classroom: "bg-dragon-blue-100 text-dragon-blue-700",
  pta: "bg-dragon-gold-100 text-dragon-gold-700",
  school: "bg-muted text-muted-foreground",
};

interface CalendarPageProps {
  searchParams: Promise<{ type?: string; calendar?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const typeFilter = params.type;
  const calendarFilter = params.calendar;

  const schoolId = await getCurrentSchoolId();

  // Get all events for the current school
  let events: (typeof calendarEvents.$inferSelect)[] = [];
  let calendarOptions: { calendarId: string; name: string | null; calendarType: ResourceSource | null }[] = [];

  if (schoolId) {
    // Get calendar integrations for this school
    const integrations = await db
      .select({
        calendarId: schoolCalendarIntegrations.calendarId,
        name: schoolCalendarIntegrations.name,
        calendarType: schoolCalendarIntegrations.calendarType,
      })
      .from(schoolCalendarIntegrations)
      .where(
        and(
          eq(schoolCalendarIntegrations.schoolId, schoolId),
          eq(schoolCalendarIntegrations.active, true)
        )
      );
    calendarOptions = integrations;

    // Query events filtered by school
    events = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.schoolId, schoolId),
          gte(calendarEvents.startTime, new Date())
        )
      )
      .orderBy(asc(calendarEvents.startTime));
  } else {
    // No school context - show all future events
    events = await db
      .select()
      .from(calendarEvents)
      .where(gte(calendarEvents.startTime, new Date()))
      .orderBy(asc(calendarEvents.startTime));
  }

  // Create a map of calendarId to name for display
  const calendarNameMap = new Map(
    calendarOptions.map((c) => [c.calendarId, c.name])
  );

  // Apply filters
  let filtered = events;
  if (typeFilter) {
    filtered = filtered.filter((e) => e.eventType === typeFilter);
  }
  if (calendarFilter) {
    filtered = filtered.filter((e) => e.calendarSource === calendarFilter);
  }

  // Get flyer counts for all events
  const eventIds = filtered.map((e) => e.id);
  const flyerCounts = new Map<string, number>();
  if (eventIds.length > 0) {
    const flyers = await db
      .select({
        calendarEventId: eventFlyers.calendarEventId,
      })
      .from(eventFlyers)
      .where(inArray(eventFlyers.calendarEventId, eventIds));

    for (const flyer of flyers) {
      const count = flyerCounts.get(flyer.calendarEventId) || 0;
      flyerCounts.set(flyer.calendarEventId, count + 1);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-muted-foreground">
          Upcoming events across the school community
        </p>
      </div>

      <CalendarFilter
        currentType={typeFilter}
        currentCalendar={calendarFilter}
        calendarOptions={calendarOptions}
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <Calendar className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No upcoming events.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((event) => {
            const calendarName = event.calendarSource
              ? calendarNameMap.get(event.calendarSource)
              : null;
            const flyerCount = flyerCounts.get(event.id) || 0;
            const hasEnhancements = event.ptaDescription || flyerCount > 0;

            return (
              <Link
                key={event.id}
                href={`/calendar/${event.id}`}
                className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{event.title}</h3>
                      {hasEnhancements && (
                        <div className="flex items-center gap-1">
                          {event.ptaDescription && (
                            <span title="Has PTA notes">
                              <FileText className="h-4 w-4 text-dragon-gold-500" />
                            </span>
                          )}
                          {flyerCount > 0 && (
                            <span
                              title={`${flyerCount} flyer${flyerCount > 1 ? "s" : ""}`}
                              className="flex items-center gap-0.5"
                            >
                              <ImageIcon className="h-4 w-4 text-dragon-blue-500" />
                              {flyerCount > 1 && (
                                <span className="text-xs text-dragon-blue-500">
                                  {flyerCount}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDateTime(event.startTime)}
                    </p>
                    {event.location && (
                      <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location}
                      </div>
                    )}
                    {event.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {event.description}
                      </p>
                    )}
                    {calendarName && (
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        From: {calendarName}
                      </p>
                    )}
                  </div>
                  {event.eventType && (
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${typeColors[event.eventType] ?? typeColors.school}`}
                    >
                      {event.eventType}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
