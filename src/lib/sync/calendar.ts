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
  /** Zone already stored on the integration row, so a no-op write is skipped. */
  timeZone?: string | null;
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
          timeZone: c.timeZone ?? null,
        })),
      });
    }
  }

  return results;
}

/** An event as Google described it, ready to be written. */
type NewCalendarEvent = typeof calendarEvents.$inferInsert & {
  googleEventId: string;
};

/** Postgres caps a statement at 65535 bound parameters; stay well under it. */
const DB_CHUNK_SIZE = 400;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

/**
 * Write the events this calendar returned, touching only the rows that differ.
 *
 * A school calendar is overwhelmingly static between runs — the sync fires
 * every six hours and a normal week adds a handful of events — but the previous
 * shape re-wrote every row every time, because `lastSynced: new Date()` made
 * each one unconditionally "changed". Nothing in the app reads that column, so
 * comparing the fields that are actually rendered turns a routine sync from
 * 2N queries into a single SELECT.
 */
async function writeCalendarEvents(
  incoming: NewCalendarEvent[]
): Promise<{ inserted: number; updated: number }> {
  if (incoming.length === 0) return { inserted: 0, updated: 0 };

  // `google_event_id` is unique, so one duplicate would fail the whole batch
  // insert where the previous row-at-a-time loop absorbed it. Paging a calendar
  // that is being edited underneath us is the way that happens.
  const fetched = [
    ...new Map(incoming.map((e) => [e.googleEventId, e] as const)).values(),
  ];

  const existingRows = (
    await Promise.all(
      chunk(
        fetched.map((e) => e.googleEventId),
        DB_CHUNK_SIZE
      ).map((ids) =>
        db
          .select()
          .from(calendarEvents)
          .where(inArray(calendarEvents.googleEventId, ids))
      )
    )
  ).flat();

  const existingByGoogleId = new Map(
    existingRows.flatMap((row) =>
      row.googleEventId ? [[row.googleEventId, row] as const] : []
    )
  );

  const toInsert: NewCalendarEvent[] = [];
  const toUpdate: Array<{ id: string; data: NewCalendarEvent }> = [];

  for (const event of fetched) {
    const existing = existingByGoogleId.get(event.googleEventId);

    if (!existing) {
      toInsert.push(event);
      continue;
    }

    const unchanged =
      existing.schoolId === event.schoolId &&
      existing.title === event.title &&
      existing.description === event.description &&
      sameInstant(existing.startTime, event.startTime ?? null) &&
      sameInstant(existing.endTime, event.endTime ?? null) &&
      existing.timeZone === event.timeZone &&
      existing.allDay === event.allDay &&
      existing.location === event.location &&
      existing.calendarSource === event.calendarSource &&
      existing.eventType === event.eventType;

    if (!unchanged) toUpdate.push({ id: existing.id, data: event });
  }

  for (const rows of chunk(toInsert, DB_CHUNK_SIZE)) {
    await db.insert(calendarEvents).values(rows);
  }

  // Updates stay per-row: they are rare in a steady state, and an event whose
  // Google ID is stable but whose details changed is the uncommon case.
  for (const { id, data } of toUpdate) {
    await db
      .update(calendarEvents)
      .set({ ...data, lastSynced: new Date() })
      .where(eq(calendarEvents.id, id));
  }

  return { inserted: toInsert.length, updated: toUpdate.length };
}

/**
 * Sync a single Google calendar into `calendar_events`.
 *
 * Pages through every upcoming event (Google caps a single page at 250) so we
 * see the calendar's complete future state, upserts each one by its Google
 * event ID, and then prunes rows for events Google no longer returns. Returns
 * the number of events upserted.
 *
 * Google first, Postgres second, deliberately. Neon bills compute by the wall
 * clock the endpoint is awake rather than by query time, so a loop that
 * interleaves a page fetch with a write holds the database open across every
 * one of Google's round trips. Paging to completion before touching the
 * database keeps it awake only for the short burst at the end — and lets the
 * reads and writes below be batched, which they can't be one event at a time.
 */
async function syncCalendar(
  calendar: CalendarClient,
  config: CalendarConfig
): Promise<number> {
  const now = new Date();
  const seenGoogleEventIds: string[] = [];
  const fetched: NewCalendarEvent[] = [];
  let pageToken: string | undefined = undefined;
  let calendarTimeZone: string | null = null;

  // ── Phase 1: Google only, no database ──────────────────────────────────────
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

    // The calendar's own zone, returned on every page. This is the zone the
    // board sees in Google, and the default for events that don't override it.
    calendarTimeZone = data.timeZone ?? calendarTimeZone;

    for (const event of events) {
      if (!event.id || !event.summary) continue;

      // An all-day event has `date` (YYYY-MM-DD) instead of `dateTime`. `new
      // Date("2026-08-12")` parses as midnight UTC, so it must be rendered as a
      // date only — formatting it in a western zone would show Aug 11.
      const allDay = !event.start?.dateTime && !!event.start?.date;
      const startTime = event.start?.dateTime || event.start?.date;
      const endTime = event.end?.dateTime || event.end?.date;

      if (!startTime) continue;

      seenGoogleEventIds.push(event.id);

      fetched.push({
        googleEventId: event.id,
        schoolId: config.schoolId,
        title: event.summary,
        description: event.description ?? null,
        // `dateTime` carries its own UTC offset, so the instant stored here is
        // already correct — the zone below is what it takes to render it back
        // as the wall-clock time the board typed in.
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        timeZone: event.start?.timeZone ?? calendarTimeZone,
        allDay,
        location: event.location ?? null,
        calendarSource: config.calendarId,
        eventType: inferEventType(config.calendarId, config.name),
      });
    }

    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  // The calendar's zone arrives on the page response, not the event, so events
  // read before the last page may have been stamped with a zone we hadn't seen
  // yet. Backfill them now that it's known.
  if (calendarTimeZone) {
    for (const event of fetched) {
      event.timeZone ??= calendarTimeZone;
    }
  }

  // ── Phase 2: database only, batched ────────────────────────────────────────
  const { inserted, updated } = await writeCalendarEvents(fetched);

  if (inserted > 0 || updated > 0) {
    console.log(
      `[calendar-sync] ${config.calendarId}: ${inserted} new, ${updated} changed of ${fetched.length} events`
    );
  }

  // Keep the integration row's zone current — it is the school's effective zone
  // for surfaces that don't have a specific event in hand (see
  // getSchoolTimeZone), and a board can move a calendar between zones. Only
  // written when it actually moved; a board changes this about once ever.
  if (calendarTimeZone && calendarTimeZone !== config.timeZone) {
    await db
      .update(schoolCalendarIntegrations)
      .set({ timeZone: calendarTimeZone })
      .where(
        and(
          eq(schoolCalendarIntegrations.schoolId, config.schoolId),
          eq(schoolCalendarIntegrations.calendarId, config.calendarId)
        )
      );
  }

  await pruneOrphanedEvents(config, seenGoogleEventIds, now);

  // The count the board sees on /admin/integrations, so it means "events now in
  // sync", not "rows written" — a calendar that changed nothing synced fine.
  return fetched.length;
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

  // A fully-empty response is ambiguous: the calendar may genuinely have no
  // future events, or Google may have returned a transient/degraded result. In
  // the latter case we're about to delete every un-enhanced future event for
  // this calendar; they'll reappear on the next successful sync, but log loudly
  // so a mass-prune is visible if it ever happens.
  if (seenGoogleEventIds.length === 0) {
    console.warn(
      `Calendar ${config.calendarId} returned no events from Google; pruning ${deletableIds.length} future event(s) as orphaned. If this was an empty/degraded response rather than a real deletion, they will return on the next successful sync.`
    );
  }

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
        timeZone: config.timeZone ?? null,
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
