import { db } from "@/lib/db";
import { calendarEvents } from "@/lib/db/schema";
import { asc, gte } from "drizzle-orm";
import { formatDateTime } from "@/lib/utils";
import { MapPin, Calendar } from "lucide-react";
import Link from "next/link";

const typeColors: Record<string, string> = {
  classroom: "bg-dragon-blue-100 text-dragon-blue-700",
  pta: "bg-dragon-gold-100 text-dragon-gold-700",
  school: "bg-muted text-muted-foreground",
};

interface CalendarPageProps {
  searchParams: Promise<{ type?: string }>;
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const params = await searchParams;
  const typeFilter = params.type;

  const query = db
    .select()
    .from(calendarEvents)
    .where(gte(calendarEvents.startTime, new Date()))
    .orderBy(asc(calendarEvents.startTime));

  const events = await query;
  const filtered = typeFilter ? events.filter((e) => e.eventType === typeFilter) : events;

  const types = ["classroom", "pta", "school"];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-muted-foreground">Upcoming events across the school community</p>
      </div>

      <div className="mb-4 flex gap-2">
        <Link
          href="/calendar"
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${!typeFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
        >
          All
        </Link>
        {types.map((t) => (
          <Link
            key={t}
            href={`/calendar?type=${t}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${typeFilter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
          >
            {t}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16">
          <Calendar className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No upcoming events.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((event) => (
            <div key={event.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{event.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(event.startTime)}</p>
                  {event.location && (
                    <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {event.location}
                    </div>
                  )}
                  {event.description && <p className="mt-2 text-sm text-muted-foreground">{event.description}</p>}
                </div>
                {event.eventType && (
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${typeColors[event.eventType] ?? typeColors.school}`}>
                    {event.eventType}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
