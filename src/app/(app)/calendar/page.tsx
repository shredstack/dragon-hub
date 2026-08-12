import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  calendarEvents,
  schoolCalendarIntegrations,
  eventFlyers,
} from "@/lib/db/schema";
import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { DEFAULT_TIME_ZONE } from "@/lib/time-zone";
import { getSchoolTimeZone } from "@/lib/school-time-zone";
import { todayDateOnly } from "@/lib/date-only";
import { getCurrentSchoolId } from "@/lib/auth-helpers";
import { CalendarFilter } from "@/components/calendar/calendar-filter";
import { CalendarViewToggle } from "@/components/calendar/calendar-view-toggle";
import { CalendarViewMemory } from "@/components/calendar/calendar-view-memory";
import { CalendarPeriodNav } from "@/components/calendar/calendar-period-nav";
import { CalendarListView } from "@/components/calendar/calendar-list-view";
import { CalendarWeekView } from "@/components/calendar/calendar-week-view";
import { SchoolCalendarMonth } from "@/components/calendar/school-calendar-month";
import { CalendarYearView } from "@/components/calendar/calendar-year-view";
import { schoolCalendarRenderers } from "@/components/calendar/calendar-event-items";
import {
  buildCalendarHref,
  calendarRange,
  CALENDAR_VIEW_COOKIE,
  dedupeCalendarEvents,
  isValidDayKey,
  normalizeAnchor,
  parseCalendarView,
  type CalendarViewEvent,
} from "@/lib/calendar-view";
import type { ResourceSource } from "@/lib/constants";

export const metadata = { title: "Calendar" };

interface CalendarPageProps {
  searchParams: Promise<{
    type?: string;
    calendar?: string;
    view?: string;
    date?: string;
  }>;
}

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const params = await searchParams;
  const typeFilter = params.type;
  const calendarFilter = params.calendar;
  // An explicit `?view=` always wins — it's what the toggle, a shared link and
  // every "back to calendar" link carry. Only a bare `/calendar` falls back to
  // the view this person last looked at, and only then to the default.
  const cookieStore = await cookies();
  const view = parseCalendarView(
    params.view ?? cookieStore.get(CALENDAR_VIEW_COOKIE)?.value
  );

  const schoolId = await getCurrentSchoolId();

  // The zone has to be resolved *before* the query, not just before rendering:
  // it decides where a week or month starts, and therefore which instants to
  // ask for. This page runs on the server, where the process zone is UTC, so
  // the zone can only come from the data.
  const schoolTimeZone = schoolId
    ? await getSchoolTimeZone(schoolId)
    : DEFAULT_TIME_ZONE;

  const today = todayDateOnly(schoolTimeZone);
  const anchor = normalizeAnchor(
    view,
    isValidDayKey(params.date) ? params.date : today
  );
  const range = calendarRange(view, anchor, schoolTimeZone);

  let calendarOptions: {
    calendarId: string;
    name: string | null;
    calendarType: ResourceSource | null;
  }[] = [];

  if (schoolId) {
    calendarOptions = await db
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
  }

  // The list is unbounded ("everything from now on"); a grid asks for exactly
  // the period it draws. A multi-day event that began before the window still
  // belongs in it, which is why the lower bound tests the *end*.
  const withinPeriod = range
    ? and(
        lt(calendarEvents.startTime, range.end),
        or(
          gte(calendarEvents.endTime, range.start),
          and(
            isNull(calendarEvents.endTime),
            gte(calendarEvents.startTime, range.start)
          )
        )
      )
    : gte(calendarEvents.startTime, new Date());

  const rows = await db
    .select()
    .from(calendarEvents)
    .where(
      schoolId
        ? and(eq(calendarEvents.schoolId, schoolId), withinPeriod)
        : withinPeriod
    )
    .orderBy(asc(calendarEvents.startTime));

  // Apply filters
  let filtered = rows;
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
      .select({ calendarEventId: eventFlyers.calendarEventId })
      .from(eventFlyers)
      .where(inArray(eventFlyers.calendarEventId, eventIds));

    for (const flyer of flyers) {
      flyerCounts.set(
        flyer.calendarEventId,
        (flyerCounts.get(flyer.calendarEventId) || 0) + 1
      );
    }
  }

  const calendarNameMap = new Map(
    calendarOptions.map((c) => [c.calendarId, c.name])
  );

  // Flatten to the shape every view renders. Instants become ISO strings
  // because these cross into client components, which would receive them that
  // way regardless.
  const events: CalendarViewEvent[] = filtered.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    eventType: event.eventType,
    calendarSource: event.calendarSource,
    calendarName: event.calendarSource
      ? (calendarNameMap.get(event.calendarSource) ?? null)
      : null,
    startTime: event.startTime.toISOString(),
    endTime: event.endTime?.toISOString() ?? null,
    allDay: event.allDay,
    timeZone: event.timeZone,
    hasPtaNotes: !!event.ptaDescription,
    flyerCount: flyerCounts.get(event.id) ?? 0,
  }));

  // The same meeting synced from two calendars is one thing that happened —
  // see dedupeCalendarEvents for why the copies are merged rather than dropped.
  const deduped = dedupeCalendarEvents(events);

  // Carried onto every event link so "back" returns to the view and period the
  // parent was actually looking at, rather than dumping them in the list.
  const backHref = buildCalendarHref({
    view,
    date: anchor,
    type: typeFilter,
    calendar: calendarFilter,
  });

  // Everything Google-specific about how an event draws itself. The grids take
  // this and stay ignorant of what they're laying out.
  //
  // Only the views rendered on the server can be handed it: `renderers` is an
  // object of functions, and the month grid is a client component. It builds
  // its own — see `SchoolCalendarMonth`.
  const renderers = schoolCalendarRenderers(schoolTimeZone, backHref);

  return (
    <div>
      <CalendarViewMemory view={view} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-muted-foreground">
          {view === "list"
            ? "Upcoming events across the school community"
            : "Events across the school community"}
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {view === "list" ? (
          <div />
        ) : (
          <CalendarPeriodNav
            view={view}
            anchor={anchor}
            today={today}
            hrefFor={(date) =>
              buildCalendarHref({
                view,
                date,
                type: typeFilter,
                calendar: calendarFilter,
              })
            }
          />
        )}
        <CalendarViewToggle
          currentView={view}
          anchor={anchor}
          hrefFor={(nextView, date) =>
            buildCalendarHref({
              view: nextView,
              date,
              type: typeFilter,
              calendar: calendarFilter,
            })
          }
        />
      </div>

      <CalendarFilter
        currentType={typeFilter}
        currentCalendar={calendarFilter}
        calendarOptions={calendarOptions}
        view={view}
        anchor={anchor}
      />

      {view === "list" && (
        <CalendarListView
          events={deduped}
          schoolTimeZone={schoolTimeZone}
          backHref={backHref}
        />
      )}

      {view === "week" && (
        <CalendarWeekView
          items={deduped}
          anchor={anchor}
          today={today}
          timeZone={schoolTimeZone}
          renderers={renderers}
        />
      )}

      {view === "month" && (
        <SchoolCalendarMonth
          items={deduped}
          anchor={anchor}
          today={today}
          timeZone={schoolTimeZone}
          backHref={backHref}
        />
      )}

      {view === "year" && (
        <CalendarYearView
          items={deduped}
          anchor={anchor}
          today={today}
          timeZone={schoolTimeZone}
          dayHref={(day) =>
            buildCalendarHref({
              view: "month",
              date: day,
              type: typeFilter,
              calendar: calendarFilter,
            })
          }
        />
      )}
    </div>
  );
}
