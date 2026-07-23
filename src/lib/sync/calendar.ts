import { calendar_v3 } from "googleapis";
import {
  getCalendarClient,
  getSchoolGoogleCredentials,
  GoogleCredentials,
} from "@/lib/google";
import { db } from "@/lib/db";
import {
  calendarEvents,
  eventFlyers,
  eventPlans,
  schoolCalendarIntegrations,
  schools,
} from "@/lib/db/schema";
import { and, eq, gte, inArray, isNotNull, notInArray } from "drizzle-orm";

interface CalendarConfig {
  calendarId: string;
  schoolId: string;
  name?: string;
}

interface SchoolCalendarConfigs {
  schoolId: string;
  credentials: GoogleCredentials;
  calendars: CalendarConfig[];
}

type CalendarClient = ReturnType<typeof getCalendarClient>;

async function getSchoolCalendarConfigs(): Promise<SchoolCalendarConfigs[]> {
  const results: SchoolCalendarConfigs[] = [];

  // Get all active schools
  const activeSchools = await db.query.schools.findMany({
    where: eq(schools.active, true),
  });

  for (const school of activeSchools) {
    // Get Google credentials for this school
    const credentials = await getSchoolGoogleCredentials(school.id);
    if (!credentials) {
      // School doesn't have Google credentials configured, skip
      continue;
    }

    // Get calendar integrations for this school
    const calendarIntegrations =
      await db.query.schoolCalendarIntegrations.findMany({
        where: eq(schoolCalendarIntegrations.schoolId, school.id),
      });

    const activeCalendars = calendarIntegrations.filter((c) => c.active);

    if (activeCalendars.length > 0) {
      results.push({
        schoolId: school.id,
        credentials,
        calendars: activeCalendars.map((c) => ({
          calendarId: c.calendarId,
          schoolId: school.id,
          name: c.name ?? undefined,
        })),
      });
    }
  }

  return results;
}

/**
 * Sync a single Google calendar into `calendar_events`.
 *
 * Pages through every upcoming event (Google caps a single page at 250) so we
 * see the calendar's complete future state, upserts each one by its Google
 * event ID, and then prunes rows for events Google no longer returns. Returns
 * the number of events upserted.
 */
async function syncCalendar(
  calendar: CalendarClient,
  config: CalendarConfig
): Promise<number> {
  const now = new Date();
  const seenGoogleEventIds: string[] = [];
  let synced = 0;
  let pageToken: string | undefined = undefined;

  do {
    const response = await calendar.events.list({
      calendarId: config.calendarId,
      timeMin: now.toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: "startTime",
      pageToken,
    });

    const data: calendar_v3.Schema$Events = response.data;
    const events = data.items ?? [];

    for (const event of events) {
      if (!event.id || !event.summary) continue;

      const startTime = event.start?.dateTime || event.start?.date;
      const endTime = event.end?.dateTime || event.end?.date;

      if (!startTime) continue;

      seenGoogleEventIds.push(event.id);

      const existing = await db.query.calendarEvents.findFirst({
        where: eq(calendarEvents.googleEventId, event.id),
      });

      const eventData = {
        googleEventId: event.id,
        schoolId: config.schoolId,
        title: event.summary,
        description: event.description ?? null,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        location: event.location ?? null,
        calendarSource: config.calendarId,
        eventType: inferEventType(config.calendarId, config.name),
        lastSynced: new Date(),
      };

      if (existing) {
        await db
          .update(calendarEvents)
          .set(eventData)
          .where(eq(calendarEvents.id, existing.id));
      } else {
        await db.insert(calendarEvents).values(eventData);
      }

      synced++;
    }

    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  await pruneOrphanedEvents(config, seenGoogleEventIds, now);

  return synced;
}

/**
 * Delete future events that came from this calendar but Google no longer
 * returns — i.e. they were deleted or re-created (a new Google ID) upstream.
 * Without this, editing an event in a way that changes its Google ID leaves a
 * stale copy behind forever, showing up as a duplicate on the calendar.
 *
 * We only prune within the future window we actually re-fetched, and we never
 * touch an event a board member has enhanced (PTA notes / flyers) or attached
 * to an event plan — those are preserved so we never silently destroy board
 * work or trip the event-plan foreign key.
 */
async function pruneOrphanedEvents(
  config: CalendarConfig,
  seenGoogleEventIds: string[],
  now: Date
): Promise<number> {
  const conditions = [
    eq(calendarEvents.schoolId, config.schoolId),
    eq(calendarEvents.calendarSource, config.calendarId),
    gte(calendarEvents.startTime, now),
    isNotNull(calendarEvents.googleEventId),
  ];

  // If Google returned nothing, every future event from this calendar is a
  // candidate orphan. Otherwise, orphans are the ones not in the seen set.
  if (seenGoogleEventIds.length > 0) {
    conditions.push(
      notInArray(calendarEvents.googleEventId, seenGoogleEventIds)
    );
  }

  const candidates = await db
    .select({
      id: calendarEvents.id,
      ptaDescription: calendarEvents.ptaDescription,
      ptaDescriptionUpdatedBy: calendarEvents.ptaDescriptionUpdatedBy,
    })
    .from(calendarEvents)
    .where(and(...conditions));

  if (candidates.length === 0) return 0;

  const candidateIds = candidates.map((c) => c.id);

  // Preserve events a board member has attached an event plan to (would also
  // trip the foreign key on delete) or uploaded flyers for.
  const [linkedPlans, linkedFlyers] = await Promise.all([
    db
      .select({ id: eventPlans.calendarEventId })
      .from(eventPlans)
      .where(inArray(eventPlans.calendarEventId, candidateIds)),
    db
      .select({ id: eventFlyers.calendarEventId })
      .from(eventFlyers)
      .where(inArray(eventFlyers.calendarEventId, candidateIds)),
  ]);

  const preserved = new Set<string>();
  for (const p of linkedPlans) if (p.id) preserved.add(p.id);
  for (const f of linkedFlyers) preserved.add(f.id);

  const deletableIds = candidates
    .filter(
      (c) =>
        !c.ptaDescription &&
        !c.ptaDescriptionUpdatedBy &&
        !preserved.has(c.id)
    )
    .map((c) => c.id);

  if (deletableIds.length === 0) return 0;

  await db
    .delete(calendarEvents)
    .where(inArray(calendarEvents.id, deletableIds));

  console.log(
    `Pruned ${deletableIds.length} orphaned event(s) from calendar ${config.calendarId}`
  );

  return deletableIds.length;
}

export async function syncGoogleCalendars() {
  const schoolConfigs = await getSchoolCalendarConfigs();

  if (schoolConfigs.length === 0) {
    console.log(
      "No schools with Google credentials and calendar integrations configured, skipping sync"
    );
    return { synced: 0, schoolsProcessed: 0 };
  }

  let totalSynced = 0;
  let schoolsProcessed = 0;

  for (const schoolConfig of schoolConfigs) {
    const calendar = getCalendarClient(schoolConfig.credentials);

    for (const config of schoolConfig.calendars) {
      try {
        totalSynced += await syncCalendar(calendar, config);
      } catch (error) {
        console.error(`Failed to sync calendar ${config.calendarId}:`, error);
      }
    }

    schoolsProcessed++;
  }

  return { synced: totalSynced, schoolsProcessed };
}

function inferEventType(calendarId: string, name?: string): string {
  const searchStr = (calendarId + (name || "")).toLowerCase();
  if (searchStr.includes("classroom")) return "classroom";
  if (searchStr.includes("pta")) return "pta";
  return "school";
}

export async function syncSchoolCalendars(schoolId: string) {
  const credentials = await getSchoolGoogleCredentials(schoolId);
  if (!credentials) {
    return { synced: 0, error: "No Google credentials configured" };
  }

  const calendarIntegrations =
    await db.query.schoolCalendarIntegrations.findMany({
      where: eq(schoolCalendarIntegrations.schoolId, schoolId),
    });

  const activeCalendars = calendarIntegrations.filter((c) => c.active);
  if (activeCalendars.length === 0) {
    return { synced: 0, error: "No active calendars configured" };
  }

  const calendar = getCalendarClient(credentials);
  let totalSynced = 0;
  const errors: string[] = [];

  for (const config of activeCalendars) {
    try {
      totalSynced += await syncCalendar(calendar, {
        calendarId: config.calendarId,
        schoolId,
        name: config.name ?? undefined,
      });
    } catch (error) {
      const calendarName = config.name || config.calendarId;
      const errorMessage =
        error instanceof Error && (error as { status?: number }).status === 404
          ? `Calendar "${calendarName}" not found - share it with your service account`
          : `Failed to sync "${calendarName}"`;
      errors.push(errorMessage);
      console.error(`Failed to sync calendar ${config.calendarId}:`, error);
    }
  }

  if (errors.length > 0 && totalSynced === 0) {
    return { synced: 0, error: errors[0] };
  }

  return { synced: totalSynced, errors: errors.length > 0 ? errors : undefined };
}
